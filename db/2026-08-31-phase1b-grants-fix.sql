-- Tables created via the SQL editor don't automatically get the baseline
-- grants Supabase's dashboard table editor normally sets up. Grants and
-- RLS are two separate layers: a grant says a role may attempt an
-- operation at all; RLS (already in place from the previous migration)
-- says which rows it actually sees/affects. Without this, even the
-- service-role key gets "permission denied."

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.profiles,
  public.seekers,
  public.providers,
  public.branches,
  public.provider_category_master,
  public.service_category_master
to anon, authenticated, service_role;
