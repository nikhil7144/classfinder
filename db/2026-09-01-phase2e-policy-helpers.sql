-- One systemic fault, fixed everywhere it occurs.
--
-- An RLS policy that reads another RLS-protected table is evaluated as the
-- calling user, so the inner read is itself filtered. If the caller cannot see
-- that row, the policy silently evaluates false — no error, just a denial that
-- looks like a bug in your own rule.
--
-- It produced a chicken-and-egg in three places:
--   * you could not join a group, because the policy checked the group was open
--     by reading groups — which a non-member cannot read until they join
--   * an approved provider could not pitch, because the policy checked the
--     group was live via active_groups, which a provider can never read
--   * a provider could not read or send messages on their own accepted thread,
--     because those policies join groups to identify the participants
--
-- The fix is to ask these questions through SECURITY DEFINER helpers, which
-- run outside RLS. Each answers a single boolean about a row the caller is
-- entitled to act on, and none of them returns data.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------

-- Open = still joinable. Deliberately not "active": you join a group to help
-- it reach three members, so joining must not require it to already be live.
create or replace function public.is_group_open(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and expires_at > now() and closed_at is null
  );
$$;

-- Active = visible to providers: three members, not expired, not closed.
create or replace function public.is_group_active(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.expires_at > now()
      and g.closed_at is null
      and (select count(*) from public.group_members m where m.group_id = g.id) >= 3
  );
$$;

-- Is the caller one of the two people on this thread?
create or replace function public.is_request_participant(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_requests r
    join public.groups g on g.id = r.group_id
    join public.providers p on p.id = r.provider_id
    where r.id = p_request_id
      and (p.user_id = auth.uid() or g.creator_id = auth.uid())
  );
$$;

create or replace function public.is_request_accepted(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_requests where id = p_request_id and status = 'accepted'
  );
$$;

grant execute on function public.is_group_open to anon, authenticated, service_role;
grant execute on function public.is_group_active to anon, authenticated, service_role;
grant execute on function public.is_request_participant to anon, authenticated, service_role;
grant execute on function public.is_request_accepted to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- policies rewritten to use them
-- ---------------------------------------------------------------------

-- profiles is fine to read inline: "read own profile" lets a user see their
-- own row, which is exactly what this checks.
drop policy if exists "join a group" on public.group_members;
create policy "join a group" on public.group_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'seeker'
        and p.profile_complete = true
    )
    and public.is_group_open(group_id)
  );

drop policy if exists "provider sends request" on public.group_requests;
create policy "provider sends request" on public.group_requests for insert
  with check (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and p.user_id = auth.uid()
        and p.approved = true
        and p.is_suspended = false
        and p.provider_type <> 'event_planner'
    )
    and public.is_group_active(group_id)
  );

drop policy if exists "participants read messages" on public.group_messages;
create policy "participants read messages" on public.group_messages for select
  using (public.is_request_participant(request_id));

drop policy if exists "participants send messages" on public.group_messages;
create policy "participants send messages" on public.group_messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_request_participant(request_id)
    and public.is_request_accepted(request_id)
  );
