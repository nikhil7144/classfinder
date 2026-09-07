-- Phase 3L — three products for three audiences, and one boolean the
-- database keeps for itself.
--
-- WHO BUYS WHAT
--
-- The catalogue is keyed by who you are, not by what the fee is for:
--
--   organiser  — a subscription in tiers, and the tier says how many events
--                may be live at once
--   provider   — a listing subscription, which carries no event rights at
--                all; a coach who wants to run one buys that event
--   advertiser — Phase 5's, modelled here only so it does not need a table
--                of its own later
--
-- This reverses 3L's first draft, which gave coaches and organisers one
-- shared events catalogue at one price. The reasoning then was that the price
-- of running a tournament should not depend on who is running it. The
-- reasoning now is that these are different businesses buying different
-- things: an events company buys capacity to run many, and a coach buys one
-- tournament on top of a listing they already pay for. Both are recorded in
-- PLAN.md rather than one quietly replacing the other.
--
-- A per-event purchase is a plan of kind 'per_event' and an entitlement row
-- naming its event. It never expires, because what it bought already
-- happened.
--
-- WHERE THE RULE LIVES
--
-- The API owns all of this — the catalogue, the quotas, the arithmetic, every
-- number and every sentence a person reads. What stays here is one boolean
-- the publish policy calls, so a write that never went through the API cannot
-- skip the quota. Two places, and the second is one line that will not change
-- when the pricing does.
--
-- It sits BESIDE event_party_is_live, never inside it: that function is what
-- the public read policy calls too, so an entitlement test folded into it
-- would hide every event a lapsed company had already published, including
-- the ones families have entered and are turning up to. Only a row landing on
-- 'published' passes through this.
--
-- WHAT IS FREE TODAY, AND HOW THAT ENDS
--
-- Every seeded default is uncapped, so running this changes nothing for
-- anybody. Coach events in particular are free until Phase 6 brings a
-- gateway: enforcing a per-event fee now would mean an admin manually
-- granting every coach's tournament, which is a worse product than a free
-- one. Switching it on is an admin setting the default provider plan's
-- max_active_events to 0 — one row, no migration — after which a coach needs
-- a per-event purchase and an organiser needs a tier.
--
-- may_publish_event also fails open when no plan applies at all. A paywall
-- that fails open loses a fee; one that fails closed loses the product.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3k.

-- ---------------------------------------------------------------------
-- 1. the catalogue
-- ---------------------------------------------------------------------

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),

  -- Who this is sold to. Three audiences, three price lists, and no row that
  -- belongs to two of them: a coach's listing fee can never be read as an
  -- events allowance because it is not in the same catalogue.
  audience text not null check (audience in ('organiser', 'provider', 'advertiser')),

  -- A subscription runs for a period; a per_event purchase is bought once,
  -- for one event, and does not expire.
  kind text not null default 'subscription' check (kind in ('subscription', 'per_event')),

  name text not null,
  blurb text,

  price_amount numeric(10, 2) not null default 0,
  period_months integer,

  -- How many events of this party's may be published and still to come.
  -- null is uncapped; 0 means none without a per-event purchase, which is how
  -- a pure listing plan is expressed.
  max_active_events integer,

  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  constraint subscription_plans_name_len check (length(name) between 2 and 80),
  constraint subscription_plans_blurb_len check (blurb is null or length(blurb) <= 400),
  constraint subscription_plans_price_not_negative check (price_amount >= 0),
  constraint subscription_plans_period_sane
    check (period_months is null or period_months between 1 and 60),
  constraint subscription_plans_cap_not_negative
    check (max_active_events is null or max_active_events >= 0),

  -- A one-off has no period and no allowance of its own: it entitles the one
  -- event its purchase names.
  constraint subscription_plans_per_event_shape check (
    kind <> 'per_event'
    or (period_months is null and max_active_events is null and not is_default)
  )
);

-- One default per audience, or "what am I on" has two answers. Only a
-- subscription can be a default; a per-event purchase is never automatic.
create unique index if not exists subscription_plans_one_default
  on public.subscription_plans (audience) where is_default;

-- ---------------------------------------------------------------------
-- 2. who holds what
--
-- The party is named the way an event names its owner — two nullable foreign
-- keys and a check that exactly one is set — so referential integrity holds
-- and 3J's reasoning carries over unchanged.
-- ---------------------------------------------------------------------

create table if not exists public.party_subscriptions (
  id uuid primary key default gen_random_uuid(),

  provider_id uuid references public.providers(id) on delete cascade,
  organiser_id uuid references public.organisers(id) on delete cascade,

  plan_id uuid not null references public.subscription_plans(id),

  -- Set for a per-event purchase: this row entitles that event and nothing
  -- else, and never expires.
  event_id uuid references public.events(id) on delete cascade,

  starts_on date not null default current_date,
  -- null is open-ended, which is what a per-event purchase and a comped plan
  -- both are.
  ends_on date,

  -- Recorded, not taken. The same three columns an entry carries, so Phase 6
  -- replaces the recording and not the schema.
  amount_paid numeric(10, 2),
  payment_mode text check (payment_mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  payment_reference text,
  paid_on date,

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

-- One purchase per event. A second row for the same event is a
-- double-recorded payment, which is a refund conversation rather than two
-- entitlements.
create unique index if not exists party_subscriptions_one_per_event
  on public.party_subscriptions (event_id) where event_id is not null;

-- ---------------------------------------------------------------------
-- 3. the defaults, seeded so that running this changes nothing
--
-- Both uncapped and free. What a tier costs and how many events it allows are
-- business decisions with dates on them; both are an admin editing one row.
-- ---------------------------------------------------------------------

insert into public.subscription_plans
  (audience, kind, name, blurb, price_amount, max_active_events, is_default, sort_order)
select 'organiser', 'subscription', 'Free',
       'Run events at no charge while we are getting started.', 0, null, true, 0
where not exists (
  select 1 from public.subscription_plans where audience = 'organiser' and is_default
);

insert into public.subscription_plans
  (audience, kind, name, blurb, price_amount, max_active_events, is_default, sort_order)
select 'provider', 'subscription', 'Free listing',
       'Be findable at no charge. Events are free too until we can take payment for them.',
       0, null, true, 0
where not exists (
  select 1 from public.subscription_plans where audience = 'provider' and is_default
);

-- No advertiser default: Phase 5 decides what one costs, and a seeded free
-- tier would be a price nobody chose.

-- ---------------------------------------------------------------------
-- 4. the one boolean
--
-- Definer, because a policy reading these tables directly would be filtered
-- by their own RLS and would then answer "no plan" for exactly the company
-- asking why it cannot publish — the trap phase2e documented.
-- ---------------------------------------------------------------------

/** The plan a party is effectively on: their live one, or their audience's default. */
create or replace function public.party_plan(
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
      where sp.kind = 'subscription'
        and sp.is_active
        and s.event_id is null
        and s.provider_id is not distinct from p_provider_id
        and s.organiser_id is not distinct from p_organiser_id
        and s.starts_on <= current_date
        and (s.ends_on is null or s.ends_on >= current_date)
      -- The most generous live plan wins, so an upgrade takes effect without
      -- anybody having to close the old row first.
      order by coalesce(sp.max_active_events, 2147483647) desc, s.starts_on desc
      limit 1
    ),
    (
      select d.id from public.subscription_plans d
      where d.is_default and d.is_active
        and d.audience = case when p_organiser_id is not null then 'organiser' else 'provider' end
    )
  );
$fn$;

/**
 * May this event be published?
 *
 * A purchase naming this event says yes on its own — that is what a coach's
 * per-event fee buys. Otherwise the party's plan decides, counting only
 * events that are published and still to come: a finished tournament does not
 * hold a slot against next season's.
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
    where s.event_id = p_event_id and sp.is_active
  ) then
    return true;
  end if;

  select * into v_plan from public.party_plan(v_event.provider_id, v_event.organiser_id);

  -- No plan at all means nothing is seeded, which is a setup problem and not
  -- this organiser's. See the header on failing open.
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

grant execute on function public.party_plan to authenticated, service_role;
grant execute on function public.may_publish_event to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. the gate
--
-- Beside event_party_is_live, never inside it. Editing a draft, cancelling
-- and marking finished all pass untouched, so a lapsed plan retracts nothing.
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
-- The catalogue is a price list and is public. What a particular company pays
-- is its own business and the admin's, and no competitor's.
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
-- party that could insert its own row could hand itself any plan in the
-- catalogue, which is the entire fee.
drop policy if exists "admins write subscriptions" on public.party_subscriptions;
create policy "admins write subscriptions" on public.party_subscriptions for all
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

grant select on public.subscription_plans to anon, authenticated;
grant select, insert, update, delete on public.subscription_plans to authenticated, service_role;
grant select on public.party_subscriptions to authenticated;
grant select, insert, update, delete on public.party_subscriptions to authenticated, service_role;
