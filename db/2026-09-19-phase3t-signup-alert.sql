-- ---------------------------------------------------------------------
-- Phase 3T — tell Slack when somebody verifies their email
--
-- The API is blind to signup. It only ever sees a person when a client makes
-- an authenticated call, so its own alert fires at profile completion — and
-- anybody who verifies an email and then abandons onboarding is invisible.
-- That is the number worth watching, and nothing anywhere recorded it.
--
-- So this one lives next to the only table that knows: a trigger on
-- auth.users, posting through pg_net.
--
-- WHAT IT CAN SAY: an email address, and nothing else. The intended role is
-- not sent to Supabase at signup — AuthForm carries it in the redirect URL and
-- applies it client-side after verification — so raw_user_meta_data does not
-- have it, and a coach and a family look identical at this moment. That is the
-- honest limit of an alert this early, and the reason the API's own alert
-- exists as well.
--
-- WHERE THE SECRET LIVES: private.app_settings, created below. Supabase Vault
-- would be the tidier home, but vault.decrypted_secrets read back empty on
-- this project and a webhook that silently never fires is worse than a plain
-- row in a locked-down schema. The URL is a webhook, not a credential to user
-- data: the worst it permits is posting into one Slack channel.
--
-- Nothing in this file contains the URL. See the runbook at the bottom.
-- ---------------------------------------------------------------------

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. somewhere to keep it
--
-- Its own schema, with no grants to anon or authenticated. Only a definer
-- function and the service role can see it, and PostgREST does not expose
-- schemas outside its search path — so this is not reachable over the API at
-- all, with or without a policy.
-- ---------------------------------------------------------------------

create schema if not exists private;

create table if not exists private.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table private.app_settings enable row level security;

-- No policies, deliberately. RLS with no policy denies everybody; the trigger
-- below reads it as a definer, which bypasses RLS by design.
revoke all on schema private from anon, authenticated;
revoke all on private.app_settings from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. the trigger
-- ---------------------------------------------------------------------

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

  select value into v_url
  from private.app_settings
  where key = 'slack_webhook_url';

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

-- ---------------------------------------------------------------------
-- 3. after running this, put the webhook in
--
--   insert into private.app_settings (key, value)
--   values ('slack_webhook_url', 'https://hooks.slack.com/services/YOUR/URL')
--   on conflict (key) do update
--     set value = excluded.value, updated_at = now();
--
-- Until that row exists the trigger quietly does nothing, which is also how a
-- branch database should behave.
-- ---------------------------------------------------------------------
