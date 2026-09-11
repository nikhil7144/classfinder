-- ---------------------------------------------------------------------
-- Phase 3R — a party row may only exist for the role that owns it
--
-- `profiles.role` decides which of the three party tables a person belongs
-- in, and nothing enforced it. `save_provider_profile()` is security definer
-- and checks `provider_type` but never the caller's role, so an organiser
-- calling PUT /api/v1/providers/me would have a `providers` row written while
-- their profile still said organiser. `seekers` is written straight from
-- SeekerProfileForm with only RLS in the way, and RLS says "your own row" —
-- not "your own row, if you are a seeker".
--
-- Found while taking organisers out of the coach app: four of its five tabs
-- were empty for them and the fifth offered a coach listing. The app no longer
-- reaches that endpoint, but the endpoint was never the boundary.
--
-- The rule belongs here rather than in three callers. One function, three
-- triggers, and it holds for the API, the web, a future client and psql alike.
--
-- Note what this does NOT do: it does not stop somebody changing role. That is
-- switch_role()'s job, and it already deletes the row for the role being left
-- before setting the new one — so the delete happens while the old role is
-- still in place and this never sees it.
-- ---------------------------------------------------------------------

-- Anything already wrong is reported rather than silently blessed. A trigger
-- only guards new writes, so an existing mismatch would sit there invisibly.
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad from (
    select p.user_id from public.providers p
      join public.profiles pr on pr.id = p.user_id where pr.role <> 'provider'
    union all
    select s.user_id from public.seekers s
      join public.profiles pr on pr.id = s.user_id where pr.role <> 'seeker'
    union all
    select o.user_id from public.organisers o
      join public.profiles pr on pr.id = o.user_id where pr.role <> 'organiser'
  ) mismatched;

  if v_bad > 0 then
    raise warning
      'phase3r: % party row(s) already disagree with profiles.role. The trigger '
      'below guards new writes only — these need looking at by hand.', v_bad;
  else
    raise notice 'phase3r: no existing mismatches.';
  end if;
end;
$$;

create or replace function public.tg_party_role_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- Which role this table belongs to. Taken from the trigger argument so one
  -- function serves all three rather than three near-identical copies.
  v_wanted text := tg_argv[0];
  v_role text;
begin
  select role into v_role from public.profiles where id = new.user_id;

  -- No profile row yet is not this trigger's argument to have. The foreign key
  -- on user_id already decides whether the account exists, and inventing a
  -- refusal here would break any order-of-writes that works today.
  if v_role is null then
    return new;
  end if;

  if v_role <> v_wanted then
    raise exception
      'This account is a %, so it cannot have a % profile.', v_role, v_wanted
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

-- BEFORE INSERT OR UPDATE OF user_id: the insert is the hole, and re-pointing
-- an existing row at somebody else would be the same hole by another route.
drop trigger if exists party_role_matches on public.providers;
create trigger party_role_matches
  before insert or update of user_id on public.providers
  for each row execute function public.tg_party_role_matches('provider');

drop trigger if exists party_role_matches on public.seekers;
create trigger party_role_matches
  before insert or update of user_id on public.seekers
  for each row execute function public.tg_party_role_matches('seeker');

drop trigger if exists party_role_matches on public.organisers;
create trigger party_role_matches
  before insert or update of user_id on public.organisers
  for each row execute function public.tg_party_role_matches('organiser');
