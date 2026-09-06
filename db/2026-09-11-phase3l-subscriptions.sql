-- Phase 3L — what it costs to be here, and what it costs to run an event.
--
-- TWO SCOPES, NOT TWO PRICE LISTS
--
-- A plan carries a scope. `listing` is being findable at all — a coach or an
-- academy listing themselves, an event company listing its business. `events`
-- is running an event here.
--
-- The events catalogue has no role dimension in it. The price of running a
-- tournament is the price of running a tournament, whether a cricket coach or
-- a company is running it, and a coach's cheap listing plan cannot discount
-- it because the two scopes never meet. Plans name a scope, entitlements name
-- a party, and nothing anywhere names a role.
--
-- SAME PRICE, DIFFERENT SHAPE
--
-- A period plan is a fee for a window with a cap on how many events may be
-- published at once. A one-off is a fee for one event: an entitlement row that
-- names its event and never expires. A company running twenty a year takes the
-- first; a coach running one takes the second and pays nothing for the eleven
-- months either side. Nobody is charged a different price for the same thing —
-- they are charged for different amounts of it, which is the only fairness
-- that survives contact with an organiser who runs one tournament a year.
--
-- WHERE THE CHECK GOES, AND WHERE IT MUST NOT
--
-- Beside event_party_is_live in the update policy, never inside it. That
-- function is what the *public read* policy calls too, so an entitlement test
-- folded into it would make a lapsed plan hide every event the company had
-- already published — including ones families have entered and are turning up
-- to. An expired plan stops new publishing and retracts nothing.
--
-- FAILING OPEN
--
-- may_publish_event returns true when no plan applies at all: no entitlement,
-- no active subscription, and no default plan seeded for the events scope. A
-- paywall that fails open loses a fee; one that fails closed locks every
-- organiser out of the product on the day somebody deactivates the wrong row.
-- The seeded free default below has no cap, so nothing changes on the day this
-- ships — tightening it is an admin editing one row, not a migration.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No enforcement on the listing scope. Its plans exist so the catalogue is
-- whole, but nothing yet gates being findable on one: switching that on would
-- take live coaches out of search, which is a business decision with a date on
-- it rather than a migration.
--
-- No gateway. An admin records the money that arrived, the same three columns
-- an entry carries, and Phase 6 replaces the recording rather than the
-- columns.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3k.

-- ---------------------------------------------------------------------
-- 1. the catalogue
-- ---------------------------------------------------------------------

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),

  scope text not null check (scope in ('listing', 'events')),
  name text not null,
  blurb text,

  price_amount numeric(10, 2) not null default 0,
  -- null with period_months null is a one-off: a fee for one event rather
  -- than for a window of time.
  period_months integer,

  -- null means uncapped. Only meaningful for the events scope.
  max_active_events integer,
  takes_platform_bookings boolean not null default true,

  -- The plan a party is on when they hold no subscription of this scope.
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  constraint subscription_plans_name_len check (length(name) between 2 and 80),
  constraint subscription_plans_blurb_len check (blurb is null or length(blurb) <= 400),
  constraint subscription_plans_price_not_negative check (price_amount >= 0),
  constraint subscription_plans_period_sane
    check (period_months is null or period_months between 1 and 60),
  constraint subscription_plans_cap_positive
    check (max_active_events is null or max_active_events > 0)
);

-- One default per scope, or "what plan am I on" has two answers.
create unique index if not exists subscription_plans_one_default
  on public.subscription_plans (scope) where is_default;

-- ---------------------------------------------------------------------
-- 2. who is on what
--
-- The party is named the way an event names its owner — two nullable foreign
-- keys with a check that exactly one is set — so referential integrity holds
-- and 3J's reasoning carries over unchanged.
-- ---------------------------------------------------------------------

create table if not exists public.party_subscriptions (
  id uuid primary key default gen_random_uuid(),

  provider_id uuid references public.providers(id) on delete cascade,
  organiser_id uuid references public.organisers(id) on delete cascade,

  plan_id uuid not null references public.subscription_plans(id),

  -- Set for a one-off: this row entitles that event and nothing else, and
  -- never expires. Null for a period subscription.
  event_id uuid references public.events(id) on delete cascade,

  starts_on date not null default current_date,
  -- null is open-ended, which is what a one-off and a comped plan both are.
  ends_on date,

  -- What was actually collected, recorded rather than taken. The same three
  -- columns an entry carries, so Phase 6 replaces the entering and not the
  -- schema.
  amount_paid numeric(10, 2),
  payment_mode text check (payment_mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  payment_reference text,
  paid_on date,

  -- The admin who saw the money arrive.
  recorded_by uuid references public.profiles(id) on delete set null,
  note text,

  created_at timestamptz not null default now(),

  constraint party_subscriptions_one_party
    check (num_nonnulls(provider_id, organiser_id) = 1),
  constraint party_subscriptions_dates_ordered
    check (ends_on is null or ends_on >= starts_on),
  constraint party_subscriptions_amount_not_negative
    check (amount_paid is null or amount_paid >= 0),
  constraint party_subscriptions_reference_len
    check (payment_reference is null or length(payment_reference) <= 120),
  constraint party_subscriptions_note_len check (note is null or length(note) <= 500)
);

create index if not exists party_subscriptions_provider_idx
  on public.party_subscriptions (provider_id, starts_on desc) where provider_id is not null;
create index if not exists party_subscriptions_organiser_idx
  on public.party_subscriptions (organiser_id, starts_on desc) where organiser_id is not null;
create index if not exists party_subscriptions_event_idx
  on public.party_subscriptions (event_id) where event_id is not null;

-- ---------------------------------------------------------------------
-- 3. the free default, so nothing changes on the day this ships
--
-- Seeded uncapped and free. What a plan costs and how many events it allows
-- are business decisions with dates on them; both are one admin edit away,
-- and neither belongs in a migration that is trying to change no behaviour.
-- ---------------------------------------------------------------------

insert into public.subscription_plans
  (scope, name, blurb, price_amount, period_months, max_active_events, is_default, sort_order)
select 'events', 'Free', 'Run events here at no charge while we are getting started.', 0, null,
       null, true, 0
where not exists (
  select 1 from public.subscription_plans where scope = 'events' and is_default
);

insert into public.subscription_plans
  (scope, name, blurb, price_amount, period_months, max_active_events, is_default, sort_order)
select 'listing', 'Free', 'Be findable at no charge while we are getting started.', 0, null,
       null, true, 0
where not exists (
  select 1 from public.subscription_plans where scope = 'listing' and is_default
);

-- ---------------------------------------------------------------------
-- 4. what a party is entitled to
--
-- Definer, because a policy that read these tables directly would be filtered
-- by their own RLS and would then quietly answer "no plan" for exactly the
-- company asking why it cannot publish. The same trap phase2e documented.
-- ---------------------------------------------------------------------

/**
 * The events plan a party is effectively on: their live subscription's, or
 * the seeded default when they hold none. Never null unless nothing is
 * seeded at all.
 */
create or replace function public.party_events_plan(
  p_provider_id uuid,
  p_organiser_id uuid
)
returns public.subscription_plans
language sql
stable
security definer
set search_path = public
as $fn$
  select p.*
  from public.subscription_plans p
  where p.id = coalesce(
    (
      select s.plan_id
      from public.party_subscriptions s
      join public.subscription_plans sp on sp.id = s.plan_id
      where sp.scope = 'events'
        and sp.is_active
        and s.event_id is null
        and s.provider_id is not distinct from p_provider_id
        and s.organiser_id is not distinct from p_organiser_id
        and s.starts_on <= current_date
        and (s.ends_on is null or s.ends_on >= current_date)
      -- The most generous live plan wins, so an upgrade takes effect without
      -- anybody having to end the old row first.
      order by coalesce(sp.max_active_events, 2147483647) desc, s.starts_on desc
      limit 1
    ),
    (select d.id from public.subscription_plans d
      where d.scope = 'events' and d.is_default and d.is_active)
  );
$fn$;

/**
 * May this event be published?
 *
 * A one-off entitlement naming this event says yes on its own. Otherwise the
 * party's effective plan decides, counting only events that are published and
 * still to come — a finished tournament does not hold a slot against next
 * season's.
 *
 * Fails open when no plan applies at all. See the header.
 */
create or replace function public.may_publish_event(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_event public.events;
  v_plan public.subscription_plans;
  v_live integer;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.party_subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where s.event_id = p_event_id
      and sp.scope = 'events'
      and sp.is_active
  ) then
    return true;
  end if;

  select * into v_plan
  from public.party_events_plan(v_event.provider_id, v_event.organiser_id);

  if v_plan.id is null or v_plan.max_active_events is null then
    return true;
  end if;

  select count(*) into v_live
  from public.events e
  where e.id <> p_event_id
    and e.status = 'published'
    and e.starts_at >= now()
    and e.provider_id is not distinct from v_event.provider_id
    and e.organiser_id is not distinct from v_event.organiser_id;

  return v_live < v_plan.max_active_events;
end;
$fn$;

grant execute on function public.party_events_plan to authenticated, service_role;
grant execute on function public.may_publish_event to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. the gate
--
-- Beside event_party_is_live, never inside it. Only a row landing on
-- 'published' passes through this; editing a draft, cancelling and marking
-- finished are all untouched, and a lapsed plan therefore retracts nothing.
-- ---------------------------------------------------------------------

drop policy if exists "owner updates own event" on public.events;
create policy "owner updates own event" on public.events for update
  using (public.event_party_is_mine(provider_id, organiser_id))
  with check (
    public.event_party_is_mine(provider_id, organiser_id)
    and (
      status <> 'published'
      or (
        public.event_party_is_live(provider_id, organiser_id)
        and public.may_publish_event(id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 6. RLS
--
-- Plans are a public price list. Subscriptions are the party's own business
-- and the admin's, and nobody else's — what a company pays is not something
-- its competitors get to read.
-- ---------------------------------------------------------------------

alter table public.subscription_plans enable row level security;

drop policy if exists "anyone reads active plans" on public.subscription_plans;
create policy "anyone reads active plans" on public.subscription_plans for select
  using (is_active or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "admins write plans" on public.subscription_plans;
create policy "admins write plans" on public.subscription_plans for all
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

alter table public.party_subscriptions enable row level security;

drop policy if exists "party reads own subscriptions" on public.party_subscriptions;
create policy "party reads own subscriptions" on public.party_subscriptions for select
  using (public.event_party_is_mine(provider_id, organiser_id));

drop policy if exists "admins read subscriptions" on public.party_subscriptions;
create policy "admins read subscriptions" on public.party_subscriptions for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Only an admin writes one, because only an admin saw the money arrive. A
-- party that could insert its own row could give itself any plan in the
-- catalogue, which is the whole fee.
drop policy if exists "admins write subscriptions" on public.party_subscriptions;
create policy "admins write subscriptions" on public.party_subscriptions for all
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

grant select on public.subscription_plans to anon, authenticated;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select on public.party_subscriptions to authenticated;
grant select, insert, update, delete on public.party_subscriptions to service_role;

-- An admin writes through the policies above rather than through a grant that
-- names columns: there is nothing here a party may edit and an admin may not,
-- so column privileges would be ceremony.
grant insert, update, delete on public.party_subscriptions to authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;
