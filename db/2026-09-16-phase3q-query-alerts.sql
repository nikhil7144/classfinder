-- ---------------------------------------------------------------------
-- Phase 3Q — a coach can see that a query arrived
--
-- phase3h built queries end to end: the form, the worklist, the statuses,
-- answer_query(), a notification row and an email. What it never built was any
-- way to find out in the app. ProviderTabs badges Find students and Messages;
-- the Queries tab has none, my_alerts() has no counter for it, and needs_you
-- is computed purely from my_threads(). So a coach learns about a parent who
-- asked to be rung either by email, or by clicking a tab that gives no reason
-- to be clicked.
--
-- That is the wrong way round. The web puts Queries *before* Messages on
-- purpose — "a parent who left a number is waiting on a call, not on a reply,
-- and that is the more perishable of the two" — and then gives the perishable
-- one no badge.
--
-- This adds the counter, and lets it into needs_you, which is the number a
-- bell carries.
--
-- Two ways it clears, deliberately:
--
--   * mark_query_read() stamps provider_read_at — what opening the tab means;
--   * the status moving off 'new' — because a coach who has rung somebody has
--     plainly seen the request, and a badge that needed a separate read call
--     to clear would sit there after the work was done.
--
-- phase3h already wrote both columns and granted the function. Nothing calls
-- it: mark_query_read() has been reachable since phase3h and no client has
-- ever used it, because QueryDto exposes neither read column, so no client
-- could tell there was anything to mark. The counter is what gives it a job.
-- ---------------------------------------------------------------------

create or replace function public.my_alerts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'pending_pitches', (
      select count(*)
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      where g.creator_id = auth.uid() and r.status = 'pending'
    ),
    'groups_needing_members', (
      select count(*)
      from public.groups g
      where g.creator_id = auth.uid()
        and g.closed_at is null
        and g.expires_at > now()
        and not public.is_group_active(g.id)
    ),
    'accepted_pitches', (
      select count(*)
      from public.group_requests r
      join public.providers p on p.id = r.provider_id
      where p.user_id = auth.uid() and r.status = 'accepted'
    ),
    -- coaches who have asked to teach this parent's child and are waiting
    'pending_approaches', (
      select count(*)
      from public.enquiries e
      where e.seeker_id = auth.uid()
        and e.initiated_by = 'provider'
        and e.status = 'pending'
    ),
    'unread_threads', (
      select count(*) from public.my_threads() t where t.unread
    ),
    'unanswered_enquiries', (
      select count(*)
      from public.enquiries e
      join public.providers p on p.id = e.provider_id
      where p.user_id = auth.uid()
        and e.status = 'open'
        and not exists (
          select 1 from public.enquiry_messages em
          where em.enquiry_id = e.id and em.sender_id = auth.uid()
        )
    ),
    -- New this phase. Zero for a parent: their own request producing an answer
    -- arrives as a thread, and unread_threads already counts that.
    'unread_queries', (
      select count(*)
      from public.queries q
      where public.is_my_provider(q.provider_id)
        and q.provider_read_at is null
        and q.status = 'new'
    ),
    'needs_you', (
      (
        select count(*)
        from public.my_threads() t
        where t.unread
           or (t.kind = 'group' and t.status = 'pending' and t.i_am_seeker)
           -- a coach's approach the parent has not answered
           or (t.kind = 'enquiry' and t.status = 'pending' and t.i_am_seeker)
           or (t.kind = 'enquiry' and t.status = 'open' and not t.i_am_seeker
               and t.message_count = 0)
      )
      + (
        -- Somebody is waiting by a phone. That wants an action as much as an
        -- unanswered message does, and more urgently.
        select count(*)
        from public.queries q
        where public.is_my_provider(q.provider_id)
          and q.provider_read_at is null
          and q.status = 'new'
      )
    )
  );
$fn$;

grant execute on function public.my_alerts to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Where a conversation came from — deliberately not here
--
-- ThreadPane reads `enquiries.query_id` straight from the table to render
-- "They asked for a call about Kathak on 3 Sep", and its comment explains why
-- that is not in my_threads(): changing that function's return columns needs a
-- drop and recreate, which is a live error window for every inbox.
--
-- That reasoning still holds, so my_threads() is left alone and no new
-- function is added either. The API reads the two tables itself, batched
-- across the whole inbox — which is what QueriesService already does with its
-- embedded selects, and what the tier exists to do on behalf of a client that
-- is not allowed to read tables directly.
--
-- Recorded here so the next person looks in the service rather than for a
-- migration that was never written.
-- ---------------------------------------------------------------------
