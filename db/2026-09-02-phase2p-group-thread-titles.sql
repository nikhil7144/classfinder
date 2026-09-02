-- Phase 2P — a coach was shown their own name as the person they were talking to.
--
-- group_threads() has returned provider_name and provider_photo_url since
-- phase2k, unconditionally. On the parent's side that is right: they are
-- looking at a list of coaches. On the coach's side it is their own name and
-- their own face, labelling a conversation with a family.
--
-- It went unnoticed because the group page was built for the creator first,
-- and a coach only ever has one thread there, so the header looked like a
-- heading rather than a mistake.
--
-- my_threads() in phase2l already resolves this per viewer. This brings the
-- older function into line rather than patching it in the page, so the mobile
-- app gets the fix without knowing about it.
--
-- Run in the Supabase SQL editor. Idempotent.

drop function if exists public.group_threads(uuid);

create function public.group_threads(p_group_id uuid)
returns table (
  request_id uuid,
  provider_id uuid,
  -- Who the OTHER side is, in the words this viewer is allowed to hear them.
  -- Replaces provider_name / provider_photo_url, which only ever described
  -- one of the two people in the room.
  title text,
  subtitle text,
  photo_url text,
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
as $fn$
  select
    r.id,
    r.provider_id,
    case when g.creator_id = auth.uid()
      then p.display_name
      else sc.name || ' group'
    end,
    case when g.creator_id = auth.uid()
      then sc.name
      -- The society stays withheld until the parent has accepted, the same
      -- rule get_group_invite and my_threads both hold to.
      else a.name || case when r.status = 'accepted' then ' · ' || g.society_name else '' end
    end,
    case when g.creator_id = auth.uid() then p.photo_url else null end,
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
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
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
$fn$;

grant execute on function public.group_threads to anon, authenticated, service_role;
