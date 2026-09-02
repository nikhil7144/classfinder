-- Phase 2S — suggested coaches, for the parent.
--
-- 2R gave the coach a ranked feed of families. This is the same idea pointed
-- back the other way: a parent who has said what they want should not have to
-- run the search themselves to find the four coaches who actually fit it.
--
-- The one thing that differs is when the ranking happens, and it matters
-- enough to be a table.
--
-- The coach's ranking is on demand — they press a button, they wait a second,
-- they get an answer about a list they are looking at. A parent's suggestions
-- are ambient: they sit under their requirement on the dashboard and above
-- their results in search, and both of those are pages people open without
-- meaning to ask for anything. Ranking on every page load would mean a paid
-- model call per navigation, for an answer that has not changed since the
-- last one.
--
-- So the ranking is computed once per REQUIREMENT and cached here. The
-- fingerprint is what the ranking was computed for — the subjects, area,
-- level, days, budget and radius, in a canonical order. Change any of them
-- and the fingerprint changes and the next page load recomputes; change none
-- of them and a parent can open the dashboard fifty times for free. This is
-- also what makes "edit what you're looking for" visibly do something: the
-- old ranking cannot survive the edit that invalidated it.
--
-- A ranking also expires on age alone, because the supply side moves: coaches
-- are approved, open new areas and go dormant, and a suggestion list that
-- never refreshes slowly becomes a list of the coaches who were there first.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2r.

create table if not exists public.seeker_suggestions (
  -- One live ranking per parent. A second row would only ever be a stale one.
  seeker_id uuid primary key references public.profiles(id) on delete cascade,

  -- What this ranking was computed for. Opaque here on purpose: it is built
  -- and compared in app/api/coaches/suggest, and the database's only job is
  -- to hand back what it stored and let the route decide whether it still
  -- applies. Encoding the requirement's shape in SQL too would be a second
  -- definition to keep in step.
  fingerprint text not null,

  -- [{ "provider_id": uuid, "reason": text }] — the model's picks, in order.
  picks jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  constraint seeker_suggestions_picks_is_array check (jsonb_typeof(picks) = 'array')
);

alter table public.seeker_suggestions enable row level security;

-- Yours to read and nobody's to write. Every row is written by the route
-- under the service role, which bypasses RLS — the same shape as the
-- notification queue in phase2n, and for the same reason: a cache a client
-- can write is a cache a client can poison.
drop policy if exists "read own suggestions" on public.seeker_suggestions;
create policy "read own suggestions" on public.seeker_suggestions for select
  using (seeker_id = auth.uid());

grant select on public.seeker_suggestions to authenticated, service_role;

-- ---------------------------------------------------------------------
-- The purposes the usage log now sees
--
-- Left unconstrained deliberately (phase2r created the table with a plain
-- text column): a check constraint here would mean a migration every time a
-- model call is added, to protect a log nobody reads programmatically.
-- Recorded as a comment instead so the admin page's rows can be read.
-- ---------------------------------------------------------------------

comment on column public.llm_usage_log.purpose is
  'rank_demand_for_coach (2R) | rank_coaches_for_seeker (2S)';
