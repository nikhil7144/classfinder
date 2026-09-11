-- ---------------------------------------------------------------------
-- Phase 3P — choosing a role, once, from any client.
--
-- The web writes profiles.role straight from the signup form: /choose-role
-- upserts the row with 'seeker' or 'provider'. That works and is safe —
-- phase 3C's trigger blocks self-promotion to admin on INSERT and UPDATE
-- alike, and the policy pins auth.uid() = id.
--
-- What it is not is reachable. A mobile client does not write tables, so the
-- app can create a session and then has nowhere to go: an account with no role
-- cannot be finished, which means a coach cannot sign up on their phone at all.
--
-- The sibling already exists. phase 3C moved role *switching* into
-- switch_role() so both clients could reach it; this is the same move for the
-- first choice, which was left behind.
--
-- WHY NOT JUST UPSERT FROM THE APP
--
-- Because an upsert that overwrites is a back door around switch_role(), which
-- exists to say no. That function refuses once profile_complete is true, and
-- deletes the row for the role being left so a coach who becomes a parent does
-- not keep a listing nobody can see. An endpoint that simply wrote role would
-- skip both: a finished coach could become a seeker, keep an orphaned providers
-- row, and stay discoverable through it.
--
-- So this sets a role only when there is not one. Changing an existing role
-- remains switch_role()'s job, with its rules intact.
--
-- The INSERT ... ON CONFLICT DO UPDATE ... WHERE is the point: one statement,
-- so two taps on a slow connection cannot both find "no role" and both write.
-- ---------------------------------------------------------------------

create or replace function public.choose_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_existing text;
begin
  if v_user is null then
    raise exception 'Sign in first.';
  end if;

  -- 'admin' is absent deliberately and the trigger would refuse it anyway.
  -- Stated here too so the refusal is a sentence rather than a trigger error.
  if p_role is null or p_role not in ('seeker', 'provider', 'organiser') then
    raise exception 'Choose seeker, provider or organiser.';
  end if;

  insert into public.profiles (id, role, profile_complete)
  values (v_user, p_role, false)
  on conflict (id) do update
    set role = excluded.role
    where public.profiles.role is null
  returning role into v_role;

  if v_role is not null then
    return v_role;
  end if;

  -- Nothing was written. Either the row already carries a role, or the
  -- conflict target matched and the WHERE refused it. Say which.
  select role into v_existing from public.profiles where id = v_user;

  if v_existing = p_role then
    -- Asking for the role you already have is not an error. A retry on a
    -- flaky connection should not read as a refusal.
    return v_existing;
  end if;

  raise exception 'Your account type is already set.'
    using hint = 'Changing it is a different action, and not always allowed.';
end;
$fn$;

grant execute on function public.choose_role to authenticated, service_role;
