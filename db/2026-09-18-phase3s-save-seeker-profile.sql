-- ---------------------------------------------------------------------
-- Phase 3S — a family's profile, saved in one call
--
-- The seeker half of M8. phase3o did this for coaches and left the other side
-- where it was: SeekerProfileForm upserts `seekers`, then updates
-- `profiles.profile_complete` in a second statement. Less dangerous than the
-- provider version — there is no delete-before-insert here, so a failure
-- between the two leaves the profile saved and merely unflagged — but it is
-- still two writes that should be one, and it is still a table write a client
-- that does not write tables cannot do.
--
-- That last part is what makes this the blocker. There is no /seekers/me
-- endpoint at all, so a parent cannot finish onboarding from an app, and
-- nothing downstream of onboarding works without it.
--
-- The shape deliberately matches save_provider_profile(): the whole profile
-- every time, snake_cased by the service, and `profile_complete` decided here
-- rather than by the caller.
--
-- requirement_updated_at is stamped on save rather than by a trigger, because
-- students_for_provider sorts on it: a parent who re-confirms what they want
-- should come back to the top of a coach's list, and a trigger firing on any
-- column change would also do that for a photo swap.
-- ---------------------------------------------------------------------

create or replace function public.save_seeker_profile(p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_seeker_id uuid;
  v_area_id uuid;
  v_area_name text;
  v_city_name text;
begin
  if v_user is null then
    raise exception 'Sign in first.';
  end if;

  -- phase3r's trigger refuses a seekers row for an account that is not a
  -- seeker. Checked here too so the refusal is a sentence rather than a
  -- constraint violation the client has to translate.
  if (select role from public.profiles where id = v_user) is distinct from 'seeker' then
    raise exception 'This account is not a family account.';
  end if;

  v_area_id := (p_profile ->> 'area_id')::uuid;

  -- The legacy text columns. city/area on seekers predate the areas table and
  -- are still read in places, so they are kept roughly in step until they go.
  select a.name, c.name into v_area_name, v_city_name
  from public.areas a join public.cities c on c.id = a.city_id
  where a.id = v_area_id;

  insert into public.seekers (
    user_id, name, relation_to_learner, area_id, lat, lng, city, area,
    photo_url, looking_for, learner_age, level, preferred_modes,
    preferred_days, preferred_time, budget_min, budget_max, budget_period,
    requirement_notes, open_to_offers, marketing_opt_in,
    requirement_updated_at
  )
  values (
    v_user,
    p_profile ->> 'name',
    p_profile ->> 'relation_to_learner',
    v_area_id,
    (p_profile ->> 'lat')::double precision,
    (p_profile ->> 'lng')::double precision,
    v_city_name,
    v_area_name,
    p_profile ->> 'photo_url',
    coalesce(
      (select array_agg(value::uuid)
       from jsonb_array_elements_text(coalesce(p_profile -> 'looking_for', '[]'::jsonb))),
      '{}'
    ),
    (p_profile ->> 'learner_age')::integer,
    p_profile ->> 'level',
    coalesce(
      (select array_agg(value)
       from jsonb_array_elements_text(coalesce(p_profile -> 'preferred_modes', '[]'::jsonb))),
      '{}'
    ),
    coalesce(
      (select array_agg(value)
       from jsonb_array_elements_text(coalesce(p_profile -> 'preferred_days', '[]'::jsonb))),
      '{}'
    ),
    p_profile ->> 'preferred_time',
    (p_profile ->> 'budget_min')::integer,
    (p_profile ->> 'budget_max')::integer,
    p_profile ->> 'budget_period',
    p_profile ->> 'requirement_notes',
    coalesce((p_profile ->> 'open_to_offers')::boolean, true),
    coalesce((p_profile ->> 'marketing_opt_in')::boolean, false),
    now()
  )
  on conflict (user_id) do update set
    name                   = excluded.name,
    relation_to_learner    = excluded.relation_to_learner,
    area_id                = excluded.area_id,
    lat                    = excluded.lat,
    lng                    = excluded.lng,
    city                   = excluded.city,
    area                   = excluded.area,
    photo_url              = excluded.photo_url,
    looking_for            = excluded.looking_for,
    learner_age            = excluded.learner_age,
    level                  = excluded.level,
    preferred_modes        = excluded.preferred_modes,
    preferred_days         = excluded.preferred_days,
    preferred_time         = excluded.preferred_time,
    budget_min             = excluded.budget_min,
    budget_max             = excluded.budget_max,
    budget_period          = excluded.budget_period,
    requirement_notes      = excluded.requirement_notes,
    open_to_offers         = excluded.open_to_offers,
    marketing_opt_in       = excluded.marketing_opt_in,
    requirement_updated_at = excluded.requirement_updated_at
  returning id into v_seeker_id;

  update public.profiles set profile_complete = true where id = v_user;

  return v_seeker_id;
end;
$fn$;

grant execute on function public.save_seeker_profile to authenticated, service_role;
