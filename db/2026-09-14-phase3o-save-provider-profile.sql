-- ---------------------------------------------------------------------
-- Phase 3O — saving a coach's listing, atomically.
--
-- ProviderProfileForm saves a listing as four separate round trips: upsert
-- providers, then delete-and-reinsert branches or provider_service_areas, then
-- set profiles.profile_complete. Six of those calls discard their result
-- entirely — bare awaits, no error checked.
--
-- The failure that matters is not hypothetical. The delete runs before the
-- insert, so a dropped connection between them leaves neither:
--
--   delete provider_service_areas   succeeds
--   insert provider_service_areas   fails, error discarded
--   profile_complete = true         succeeds, UI says "Saved"
--
-- provider_discoverable_areas is the union of branches and service areas, so a
-- coach with neither is discoverable nowhere: gone from search_providers, and
-- gone from every radius in students_for_provider. Approved, complete, told it
-- saved, and invisible to everybody including themselves.
--
-- One function, one transaction. It lands or it does not.
--
-- The delicate line is `approved`. A first save sets it false and waits for an
-- admin; an edit must not touch it, or a coach changing their fees drops out
-- of search until somebody re-approves them. That is why the UPDATE branch
-- below names its columns rather than upserting the whole row.
-- ---------------------------------------------------------------------

create or replace function public.save_provider_profile(p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_provider_id uuid;
  v_is_first boolean;
  v_type text;
  v_primary_area uuid;
  v_area_name text;
  v_city_name text;
begin
  if v_user is null then
    raise exception 'Sign in first.';
  end if;

  v_type := p_profile ->> 'provider_type';
  if v_type is null or v_type not in ('individual', 'institution', 'event_planner') then
    raise exception 'Choose what kind of provider this is.';
  end if;

  select id into v_provider_id from public.providers where user_id = v_user;
  v_is_first := v_provider_id is null;

  -- The legacy text columns. city/area on providers predate the areas table
  -- and are still read in places, so they are kept roughly in step until they
  -- are dropped. An institution's is its first branch; an individual's is
  -- their first served area.
  v_primary_area := case
    when v_type = 'institution'
      then ((p_profile -> 'branches' -> 0) ->> 'area_id')::uuid
    else (p_profile -> 'service_area_ids' ->> 0)::uuid
  end;

  select a.name, c.name into v_area_name, v_city_name
  from public.areas a join public.cities c on c.id = a.city_id
  where a.id = v_primary_area;

  if v_is_first then
    insert into public.providers (
      user_id, provider_type, provider_category_id, display_name, bio,
      help_statement, age, experience_years, fee_min, fee_max, fee_period,
      fees_note, teaching_places, travels_to_students, certifications,
      availability, city, area, service_category_ids, photo_url, approved
    )
    values (
      v_user,
      v_type,
      nullif(p_profile ->> 'provider_category_id', '')::uuid,
      p_profile ->> 'display_name',
      p_profile ->> 'bio',
      nullif(p_profile ->> 'help_statement', ''),
      nullif(p_profile ->> 'age', '')::integer,
      nullif(p_profile ->> 'experience_years', '')::integer,
      nullif(p_profile ->> 'fee_min', '')::numeric,
      nullif(p_profile ->> 'fee_max', '')::numeric,
      nullif(p_profile ->> 'fee_period', ''),
      nullif(p_profile ->> 'fees_note', ''),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_profile -> 'teaching_places')),
        '{}'
      ),
      coalesce((p_profile ->> 'travels_to_students')::boolean, false),
      coalesce(p_profile -> 'certifications', '[]'::jsonb),
      coalesce(p_profile -> 'availability', '[]'::jsonb),
      v_city_name,
      v_area_name,
      coalesce(
        (select array_agg(value::uuid) from jsonb_array_elements_text(p_profile -> 'service_category_ids')),
        '{}'
      ),
      nullif(p_profile ->> 'photo_url', ''),
      -- Waits for an admin. Every listing is read before families see it.
      false
    )
    returning id into v_provider_id;
  else
    -- `approved` and `is_suspended` are deliberately absent. An edit is not a
    -- re-application, and a coach adjusting their fees must not vanish from
    -- search until somebody notices.
    update public.providers set
      provider_type = v_type,
      provider_category_id = nullif(p_profile ->> 'provider_category_id', '')::uuid,
      display_name = p_profile ->> 'display_name',
      bio = p_profile ->> 'bio',
      help_statement = nullif(p_profile ->> 'help_statement', ''),
      age = nullif(p_profile ->> 'age', '')::integer,
      experience_years = nullif(p_profile ->> 'experience_years', '')::integer,
      fee_min = nullif(p_profile ->> 'fee_min', '')::numeric,
      fee_max = nullif(p_profile ->> 'fee_max', '')::numeric,
      fee_period = nullif(p_profile ->> 'fee_period', ''),
      fees_note = nullif(p_profile ->> 'fees_note', ''),
      teaching_places = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_profile -> 'teaching_places')),
        '{}'
      ),
      travels_to_students = coalesce((p_profile ->> 'travels_to_students')::boolean, false),
      certifications = coalesce(p_profile -> 'certifications', '[]'::jsonb),
      availability = coalesce(p_profile -> 'availability', '[]'::jsonb),
      city = v_city_name,
      area = v_area_name,
      service_category_ids = coalesce(
        (select array_agg(value::uuid) from jsonb_array_elements_text(p_profile -> 'service_category_ids')),
        '{}'
      ),
      photo_url = nullif(p_profile ->> 'photo_url', '')
    where id = v_provider_id;
  end if;

  -- Replace-all, as the form does, but inside the transaction. An institution
  -- is found at its branches and an individual in the areas they serve; the
  -- other table is cleared so a coach who changes type does not stay
  -- discoverable through rows belonging to what they used to be.
  if v_type = 'institution' then
    delete from public.provider_service_areas where provider_id = v_provider_id;
    delete from public.branches where provider_id = v_provider_id;

    insert into public.branches (provider_id, label, address, area_id, city, area, phone)
    select
      v_provider_id,
      b ->> 'label',
      b ->> 'address',
      nullif(b ->> 'area_id', '')::uuid,
      c.name,
      a.name,
      nullif(b ->> 'phone', '')
    from jsonb_array_elements(coalesce(p_profile -> 'branches', '[]'::jsonb)) as b
    left join public.areas a on a.id = nullif(b ->> 'area_id', '')::uuid
    left join public.cities c on c.id = a.city_id;
  else
    delete from public.branches where provider_id = v_provider_id;
    delete from public.provider_service_areas where provider_id = v_provider_id;

    insert into public.provider_service_areas (provider_id, area_id)
    select v_provider_id, value::uuid
    from jsonb_array_elements_text(coalesce(p_profile -> 'service_area_ids', '[]'::jsonb));
  end if;

  update public.profiles set profile_complete = true where id = v_user;

  return v_provider_id;
end;
$fn$;

grant execute on function public.save_provider_profile to authenticated, service_role;
