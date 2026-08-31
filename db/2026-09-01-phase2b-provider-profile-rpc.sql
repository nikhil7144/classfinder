-- The public provider profile, as one callable API.
--
-- Two reasons this is a function rather than page code:
--
-- 1. A mobile app is coming and will talk to Supabase directly. Anything only
--    a Next.js server component can do is logic the app cannot reuse. RPCs and
--    RLS-governed reads transfer; server components do not.
--
-- 2. app/provider/[id] read providers with the SERVICE ROLE — bypassing RLS —
--    and then re-checked approved/suspended/event_planner in TypeScript. That
--    is the same security rule written twice, and if the copies ever drift an
--    unapproved provider leaks. Here the rule exists once, in SQL.
--
-- Run in the Supabase SQL editor. Idempotent.

create or replace function public.get_provider_profile(p_id uuid)
returns jsonb
language sql
stable
security invoker   -- RLS still applies; this adds no privilege
as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'bio', p.bio,
    'help_statement', p.help_statement,
    'provider_type', p.provider_type,
    'photo_url', p.photo_url,
    'is_featured', p.is_featured,
    'age', p.age,
    'experience_years', p.experience_years,
    'fee_min', p.fee_min,
    'fee_max', p.fee_max,
    'fee_period', p.fee_period,
    'fees_note', p.fees_note,
    'teaching_places', p.teaching_places,
    'certifications', p.certifications,
    'availability', p.availability,
    'category_name', (
      select name from public.provider_category_master
      where id = p.provider_category_id
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name, 'group', sc."group")
             order by sc.name)
      from public.service_category_master sc
      where sc.id = any(p.service_category_ids)
    ), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', b.label, 'address', b.address,
               'area_name', a.name, 'city_name', c.name) order by b.label)
      from public.branches b
      left join public.areas a on a.id = b.area_id
      left join public.cities c on c.id = a.city_id
      where b.provider_id = p.id
    ), '[]'::jsonb),
    'service_areas', coalesce((
      select jsonb_agg(jsonb_build_object('area_name', a.name, 'city_name', c.name)
             order by a.name)
      from public.provider_service_areas psa
      join public.areas a on a.id = psa.area_id
      join public.cities c on c.id = a.city_id
      where psa.provider_id = p.id
    ), '[]'::jsonb)
  )
  from public.providers p
  where p.id = p_id
    -- The visibility rule, stated once. A profile that fails it returns null
    -- and the caller — web or mobile — shows a not-found.
    and p.approved = true
    and p.is_suspended = false
    and p.provider_type <> 'event_planner';
$$;

grant execute on function public.get_provider_profile to anon, authenticated, service_role;
