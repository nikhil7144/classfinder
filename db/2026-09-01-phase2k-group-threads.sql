-- The group becomes a page, and messages become one of its tabs.
--
-- Until now a conversation was its own page at /groups/<id>/chat/<request>,
-- reachable only by scrolling the group page and pressing the right button.
-- With four coaches in touch there was no screen anywhere that showed four
-- conversations. This adds the one read an inbox needs, in a single call the
-- mobile app can make too — rather than the page fetching the pitches, then a
-- provider profile per pitch, then a last message per pitch.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. who has read what
--
-- A list of four conversations is only useful if it says which of them are
-- waiting on you. Two columns rather than a table: a thread has exactly two
-- sides and always will.
-- ---------------------------------------------------------------------

alter table public.group_requests
  add column if not exists creator_read_at timestamptz,
  add column if not exists provider_read_at timestamptz;

-- Written through a function, not a policy: granting each side UPDATE on
-- group_requests to touch its own timestamp would also hand the provider a
-- route to the status column, which only the parent may change.
create or replace function public.mark_thread_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_requests r
     set creator_read_at = now()
   where r.id = p_request_id
     and exists (
       select 1 from public.groups g
       where g.id = r.group_id and g.creator_id = auth.uid()
     );

  update public.group_requests r
     set provider_read_at = now()
   where r.id = p_request_id
     and exists (
       select 1 from public.providers p
       where p.id = r.provider_id and p.user_id = auth.uid()
     );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. every conversation in a group, in one call
--
-- Definer, so the where clause is the whole security boundary: the parent who
-- created the group sees every coach who wrote in; a coach sees the one thread
-- they are party to; everybody else — including another member of the same
-- group — gets an empty set, matching the RLS on group_requests exactly.
-- ---------------------------------------------------------------------

drop function if exists public.group_threads(uuid);

create function public.group_threads(p_group_id uuid)
returns table (
  request_id uuid,
  provider_id uuid,
  provider_name text,
  provider_photo_url text,
  pitch text,
  status text,
  created_at timestamptz,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  message_count bigint,
  unread boolean,
  is_creator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.provider_id,
    p.display_name,
    p.photo_url,
    r.message,
    r.status,
    r.created_at,
    m.body,
    m.created_at,
    m.sender_id,
    (select count(*) from public.group_messages gm where gm.request_id = r.id),
    -- something has arrived since I last looked, and it wasn't me who sent it.
    -- A pitch with no reply yet counts as the first thing to read.
    coalesce(m.created_at, r.created_at)
      > coalesce(
          case when g.creator_id = auth.uid() then r.creator_read_at else r.provider_read_at end,
          '-infinity'::timestamptz
        )
      and coalesce(m.sender_id, p.user_id) <> auth.uid(),
    g.creator_id = auth.uid()
  from public.group_requests r
  join public.groups g on g.id = r.group_id
  join public.providers p on p.id = r.provider_id
  left join lateral (
    select gm.body, gm.created_at, gm.sender_id
    from public.group_messages gm
    where gm.request_id = r.id
    order by gm.created_at desc
    limit 1
  ) m on true
  where r.group_id = p_group_id
    and (g.creator_id = auth.uid() or p.user_id = auth.uid())
  order by coalesce(m.created_at, r.created_at) desc;
$$;

-- ---------------------------------------------------------------------
-- 3. the society name stops leaking to coaches
--
-- groups_for_provider deliberately withholds the society, and
-- get_request_contact releases it only once the parent has accepted. But a
-- coach gets the group id from groups_for_provider and could then call
-- get_group_invite with it and read the society anyway, which made the other
-- two withholdings pointless.
--
-- The invite stays open to a link holder — that is its job, and the society is
-- the whole point of the invitation to a neighbour. It is a signed-in provider
-- who has not been accepted that now gets null.
-- ---------------------------------------------------------------------

create or replace function public.get_group_invite(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'service_name', sc.name,
    'area_name', a.name,
    'city_name', c.name,
    'society_name', case
      when exists (
        select 1 from public.providers p
        where p.user_id = auth.uid()
      ) and not exists (
        select 1
        from public.group_requests r
        join public.providers p2 on p2.id = r.provider_id
        where r.group_id = g.id
          and p2.user_id = auth.uid()
          and r.status = 'accepted'
      )
      then null
      else g.society_name
    end,
    'student_count', g.student_count,
    'notes', g.notes,
    'member_count', (select count(*) from public.group_members m where m.group_id = g.id),
    'expires_at', g.expires_at,
    'is_open', (g.expires_at > now() and g.closed_at is null),
    'already_member', public.is_group_member(g.id)
  )
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  where g.id = p_id;
$$;

grant execute on function public.group_threads to anon, authenticated, service_role;
grant execute on function public.mark_thread_read to anon, authenticated, service_role;
grant execute on function public.get_group_invite to anon, authenticated, service_role;
