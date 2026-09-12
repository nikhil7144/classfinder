-- ---------------------------------------------------------------------
-- Phase 3T — tell Slack when somebody verifies their email
--
-- The API is blind to signup. It only ever sees a person when a client makes
-- an authenticated call, so the two alerts it already sends fire at role
-- choice and at profile completion. Anybody who verifies an email and then
-- abandons onboarding is invisible — which is exactly the number worth
-- watching, and nothing anywhere records it.
--
-- So this one has to live in the database, next to the only table that knows.
--
-- WHAT IT CAN SAY: an email address, and nothing else. The intended role is
-- not sent to Supabase at signup — AuthForm carries it in the redirect URL and
-- applies it client-side after verification — so raw_user_meta_data does not
-- have it. A coach and a family look identical at this moment. That is the
-- honest limit of an alert this early, and the reason the other two exist.
--
-- ---------------------------------------------------------------------
-- BEFORE RUNNING THIS, put the webhook in Vault. Once, in the SQL editor:
--
--   select vault.create_secret(
--     'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
--     'slack_webhook_url',
--     'Incoming webhook for #registrations'
--   );
--
-- The URL is a secret — anyone holding it can post into the channel — so it
-- goes there and never into this file. With no secret set, the trigger below
-- quietly does nothing, which is also how a branch database behaves.
-- ---------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.tg_notify_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url text;
begin
  -- Only the moment of confirmation, and only once.
  --
  -- An OTP signup arrives already confirmed, so the INSERT is the event; an
  -- emailed link confirms later, so the UPDATE is. Without the second guard
  -- every later write to the row would announce the same person again.
  if new.email_confirmed_at is null then
    return null;
  end if;

  -- Nested rather than `and`-ed: OLD is unassigned on an INSERT, and relying
  -- on boolean short-circuit to avoid touching it is not a guarantee worth
  -- resting a signup on.
  if tg_op = 'UPDATE' then
    if old.email_confirmed_at is not null then
      return null;
    end if;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'slack_webhook_url';

  if v_url is null or length(trim(v_url)) = 0 then
    return null;
  end if;

  -- pg_net queues the request and returns immediately, so a slow or dead
  -- Slack cannot hold up a signup.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'text',
      'New sign-up: ' || coalesce(new.email, 'no email on file') ||
      ' — email verified, not onboarded yet.'
    )
  );

  return null;
exception
  when others then
    -- The same rule the API's Slack service holds to, and it matters more
    -- here: a failed webhook must never be able to fail a signup.
    return null;
end;
$fn$;

drop trigger if exists notify_signup on auth.users;
create trigger notify_signup
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.tg_notify_signup();
