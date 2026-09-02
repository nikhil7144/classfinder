-- Phase 3C — close a privilege escalation on profiles.role.
--
-- THE PROBLEM
--
-- phase1 gave profiles the obvious owner-only policy:
--
--   create policy "update own profile" on public.profiles
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--
-- which is correct about *which row* may be written and says nothing about
-- *which columns*. profiles.role is the sole basis of admin authority —
-- nine places across db/ ask `role = 'admin'` and grant moderation, report
-- resolution and Space suspension on the answer. So any signed-in user could
-- run, straight from the browser with the anon key:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- and become an admin. No API route was involved; the policy allowed it.
--
-- This is the same class of bug the codebase has already reasoned about
-- twice — phase2k and phase2l both note that RLS cannot restrict which
-- columns an UPDATE touches, and route those writes through definer
-- functions for exactly that reason. profiles was written before that
-- realisation and never revisited.
--
-- WHY NOT JUST BLOCK role CHANGES
--
-- Because the owner legitimately sets it. /choose-role upserts the row with
-- role 'seeker' or 'provider' at signup, and switching between those two is
-- a supported action while the profile is incomplete. The rule is narrower
-- than "the owner may not write role":
--
--   The owner may move between 'seeker' and 'provider'. Nobody may make
--   themselves an admin, and nobody may quietly stop being one.
--
-- auth.uid() is null under the service role and in the SQL editor, so
-- granting an admin out of band keeps working — that is the intended seam,
-- and the only one.
--
-- Run in the Supabase SQL editor. Idempotent. Fixes phase1.

create or replace function public.tg_profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Only constrains a user acting as themselves. A service-role caller has
  -- no auth.uid(), which is how an operator promotes an admin.
  if auth.uid() is null or auth.uid() <> new.id then
    return new;
  end if;

  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    raise exception 'Not permitted.'
      using hint = 'Admin access is granted by an operator, not chosen.';
  end if;

  -- The other direction, so an admin cannot be downgraded by anything
  -- holding their session — and so the check above cannot be stepped around
  -- in two moves.
  if tg_op = 'UPDATE' and old.role = 'admin' and new.role is distinct from 'admin' then
    raise exception 'Not permitted.'
      using hint = 'An admin account cannot change its own type.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_guard_role();

-- ---------------------------------------------------------------------
-- Belt and braces: column privileges, which RLS genuinely cannot express.
--
-- The trigger is the rule; this makes the rule cheap to keep. If a future
-- policy is written loosely, Postgres still refuses an UPDATE that names a
-- column the role was never granted.
--
-- Deliberately NOT restricting profile_complete: the profile forms set it
-- from the client today (SeekerProfileForm, ProviderProfileForm, dashboard),
-- so revoking it here would break profile completion. That it is
-- self-attested is a real but separate weakness — it gates group joining and
-- enquiries — and wants its own change, not a silent one bundled in here.
-- ---------------------------------------------------------------------

-- The grant list is every column the client writes today:
--   id                  /choose-role upserts, and ON CONFLICT DO UPDATE
--                       names it. Harmless — the policy pins auth.uid() = id
--                       in both USING and WITH CHECK, so it cannot become
--                       somebody else's row.
--   role                /choose-role at signup; the trigger above bounds it
--   profile_complete    both profile forms and the dashboard
--   phone               both profile forms
-- created_at is never written by a client and stays ungranted.
revoke update on public.profiles from anon, authenticated;
grant update (id, role, profile_complete, phone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Switching role, as a definer function rather than a service-role route.
--
-- app/api/account/switch-role currently does this with the service role,
-- which means the mobile app cannot switch roles at all — it has no way to
-- reach that key, and should not. The rules are unchanged; they have moved
-- somewhere both clients can call.
--
-- Deleting the abandoned row is the part RLS cannot do at all: there is no
-- delete policy on seekers or providers, by design, so this has to be
-- definer whatever calls it.
-- ---------------------------------------------------------------------

create or replace function public.switch_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_current text;
  v_complete boolean;
begin
  if p_role not in ('seeker', 'provider') then
    raise exception 'Choose either seeker or provider.';
  end if;

  select role, profile_complete into v_current, v_complete
  from public.profiles where id = auth.uid();

  if v_current is null then
    raise exception 'No profile to switch.';
  end if;

  if v_current = 'admin' then
    raise exception 'Admin accounts cannot change type.';
  end if;

  -- Switching is only allowed while nothing has been published. Once a
  -- profile is complete the listing, branches and approval state are real,
  -- and switching would silently destroy them.
  if v_complete then
    raise exception 'Your profile is already complete, so the account type cannot be changed.'
      using hint = 'Contact support if this is wrong.';
  end if;

  if v_current = p_role then
    return p_role;
  end if;

  -- Drop the half-finished row for the role being left. branches and
  -- provider_service_areas cascade off providers, so they go with it.
  if v_current = 'provider' then
    delete from public.providers where user_id = auth.uid();
  else
    delete from public.seekers where user_id = auth.uid();
  end if;

  update public.profiles
     set role = p_role, profile_complete = false
   where id = auth.uid();

  return p_role;
end;
$fn$;

grant execute on function public.switch_role to authenticated, service_role;
