-- Keeps file bytes out of Postgres.
--
-- Media belongs in Supabase Storage, with only its URL in a row. Base64 in a
-- column is ~33% larger than the file, is charged at database rates rather
-- than storage rates, is pulled into memory on every SELECT that touches the
-- row, bloats every backup, and can't be served from a CDN. A single 2 MB
-- photo becomes ~2.7 MB of row data; a thousand providers is ~2.7 GB of
-- database that should have been cheap object storage.
--
-- These constraints make the rule enforced rather than remembered. Run in the
-- Supabase SQL editor. Idempotent.

do $$
begin
  -- Photo columns must hold a real URL, never an inline data: URI.
  if not exists (select 1 from pg_constraint where conname = 'providers_photo_url_is_link') then
    alter table public.providers add constraint providers_photo_url_is_link
      check (photo_url is null or (photo_url ~ '^https?://' and length(photo_url) <= 1000));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'seekers_photo_url_is_link') then
    alter table public.seekers add constraint seekers_photo_url_is_link
      check (photo_url is null or (photo_url ~ '^https?://' and length(photo_url) <= 1000));
  end if;

  -- Free-text fields are for prose. Generous ceilings, but low enough that an
  -- encoded file cannot hide in one.
  if not exists (select 1 from pg_constraint where conname = 'providers_text_size_sane') then
    alter table public.providers add constraint providers_text_size_sane
      check (
        length(coalesce(bio, '')) <= 5000
        and length(coalesce(help_statement, '')) <= 5000
        and length(coalesce(fees_note, '')) <= 1000
      );
  end if;

  -- JSONB holds structured records, not payloads.
  if not exists (select 1 from pg_constraint where conname = 'providers_jsonb_size_sane') then
    alter table public.providers add constraint providers_jsonb_size_sane
      check (
        length(certifications::text) <= 8000
        and length(availability::text) <= 20000
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage limits, so an oversized upload is refused at the door rather than
-- discovered on the bill. Videos arrive with Spaces in Phase 2 and will need
-- their own bucket and a higher, explicit ceiling.
-- ---------------------------------------------------------------------

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id in ('provider-photos', 'seeker-photos');
