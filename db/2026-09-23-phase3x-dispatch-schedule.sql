-- Phase 3X — something has to call the workers.
--
-- THE GAP, AND IT IS OLDER THAN IT LOOKS
--
-- 2N built the queue and a worker to drain it. 3W built the push leg and a
-- second worker. Neither phase built the thing that calls either one, and
-- nothing else ever did: there is no `crons` block in either vercel.json and
-- no pg_cron job anywhere in db/.
--
-- On 2026-09-17 the table read 16 unsent against 2 sent — the 2 being a hand
-- fired test, not a schedule. So every notification since 2N has been queued
-- correctly, addressed correctly, and delivered to nobody. The triggers were
-- never the problem; the last mile was simply never built.
--
-- This is also why the 24-hour freshness rule in pending_push_notifications()
-- matters more than it looked at the time. Without a scheduler, the first
-- successful pass would otherwise buzz phones about conversations from weeks
-- ago. Push skips them. Email does not — see the runbook at the bottom, which
-- is a decision to make before the first run, not after.
--
-- WHY pg_cron RATHER THAN THE HOST'S SCHEDULER
--
-- Vercel Cron would work and is one dashboard field. It is not used because
-- the schedule would then live somewhere the repo cannot see, which is the
-- condition that produced this gap: the worker existed, the config was set,
-- the call was nobody's job. A migration is reviewable, greppable, and
-- arrives with the phase that needs it.
--
-- It also keeps one scheduler for two workers on two different deployments —
-- the email leg on the Next app, the push leg on the API — rather than a cron
-- configured per host.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2n, phase3t
-- (private.app_settings) and phase3w.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. what it needs to know
--
-- Three rows in the schema phase3T created: no grants to anon or
-- authenticated, no policies, unreachable through PostgREST. Its header
-- records why this rather than Supabase Vault — decrypted_secrets read back
-- empty on this project, and a scheduler that silently never fires is the
-- failure this whole file exists to correct.
--
-- The dispatch secret is a real credential, unlike 3T's webhook. It is the
-- only authentication in front of two endpoints that read email addresses, so
-- it belongs nowhere but here and the two deployments' environments.
--
-- Nothing in this file contains any of the three values. The runbook is at
-- the bottom.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 2. one pass over both workers
--
-- pg_net queues each request and returns immediately, so neither deployment
-- being slow or down can hold a transaction open. Responses land in
-- net._http_response, which is where to look when a pass appears to have done
-- nothing.
--
-- Each call is guarded separately: the email leg must keep running when the
-- API is mid-deploy, and the push leg must keep running when the web app is.
-- A single exception block around both would let either outage stop the
-- other, which is the coupling that having two deployments is meant to avoid.
-- ---------------------------------------------------------------------

create or replace function public.dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
  v_site text;
  v_api text;
begin
  select value into v_secret from private.app_settings where key = 'dispatch_secret';

  -- No secret, no calls. Both endpoints would answer 401 and the only result
  -- would be a schedule that looks alive in cron.job_run_details while
  -- delivering nothing — the exact failure this file is correcting.
  if v_secret is null or length(trim(v_secret)) = 0 then
    return;
  end if;

  select value into v_site from private.app_settings where key = 'site_url';
  select value into v_api from private.app_settings where key = 'api_url';

  -- The email leg, on the Next app.
  if v_site is not null and length(trim(v_site)) > 0 then
    begin
      perform net.http_post(
        url := rtrim(v_site, '/') || '/api/notifications/dispatch',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_secret,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then
      null;
    end;
  end if;

  -- The push leg, on the API. Also queues any callback reminders that have
  -- come due — see queue_callback_reminders() in 3W, which the endpoint calls
  -- before it sends.
  if v_api is not null and length(trim(v_api)) > 0 then
    begin
      perform net.http_post(
        url := rtrim(v_api, '/') || '/api/v1/notify/dispatch',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_secret,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then
      null;
    end;
  end if;
end;
$fn$;

revoke all on function public.dispatch_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_notifications to service_role;

-- ---------------------------------------------------------------------
-- 3. the schedule
--
-- Five minutes, and the number is argued rather than picked. The email
-- worker holds a row back for its first minute so a burst debounces before
-- anything is sent; chat mail is debounced to one per thread per half hour;
-- and 3W's callback reminder has a thirty-minute lead. A five-minute cadence
-- makes all three accurate to within what anybody notices, and costs two HTTP
-- requests that mostly find an empty queue.
--
-- Unscheduled first, because cron.schedule on an existing job name updates it
-- but leaves a duplicate if the name ever changed.
-- ---------------------------------------------------------------------

select cron.unschedule('dispatch-notifications')
where exists (select 1 from cron.job where jobname = 'dispatch-notifications');

select cron.schedule(
  'dispatch-notifications',
  '*/5 * * * *',
  $cron$select public.dispatch_notifications();$cron$
);

-- ---------------------------------------------------------------------
-- 4. after running this
--
-- A. Put the three values in. Until all three exist the function returns
--    without calling anything, which is also how a branch database should
--    behave.
--
--      insert into private.app_settings (key, value) values
--        ('dispatch_secret', 'THE SAME SECRET BOTH DEPLOYMENTS HOLD'),
--        ('site_url',        'https://www.aspire91.com'),
--        ('api_url',         'https://api.aspire91.com')
--      on conflict (key) do update
--        set value = excluded.value, updated_at = now();
--
--    site_url must be the canonical host. The email worker refuses to send
--    while NEXT_PUBLIC_SITE_URL points at localhost, because a row marked
--    sent is never retried — the same reasoning applies to pointing this at
--    anything but the live site.
--
-- B. DECIDE WHAT HAPPENS TO THE BACKLOG, BEFORE THE FIRST PASS.
--
--    There are unsent rows going back to whenever the queue started. Push
--    ignores anything over 24 hours old; email has no such rule, so the first
--    successful pass will mail every one of them.
--
--    Look first:
--
--      select kind, count(*), min(created_at), max(created_at)
--      from public.notifications
--      where emailed_at is null
--      group by kind order by 2 desc;
--
--    If they are days old, send them — somebody genuinely was messaged and
--    never told, and a late notification is better than none. If they are
--    weeks old, "New message from a parent" about a conversation that has
--    gone cold does more harm than good, and suppressing them is honest:
--
--      update public.notifications
--         set emailed_at = now(), last_error = 'suppressed backlog, phase3x'
--       where emailed_at is null
--         and created_at < now() - interval '7 days';
--
--    Either way it is a decision made once, deliberately, with the numbers in
--    front of you. Not something a migration should make on anybody's behalf.
--
-- C. Check it is running.
--
--      select jobname, schedule, active from cron.job;
--
--      select status, return_message, start_time
--      from cron.job_run_details
--      where jobname = 'dispatch-notifications'
--      order by start_time desc limit 5;
--
--    A job that ran but delivered nothing shows here as succeeded — pg_net is
--    fire and forget, so the HTTP result is not the job's result. For that:
--
--      select status_code, content, created
--      from net._http_response order by created desc limit 10;
--
--    401 means the secret does not match what the deployment holds. 503 from
--    the API means FIREBASE_SERVICE_ACCOUNT or SUPABASE_SERVICE_ROLE_KEY is
--    missing there — GET /api/v1/notify/status says which.
--
-- D. To stop it, without dropping anything:
--
--      select cron.unschedule('dispatch-notifications');
-- ---------------------------------------------------------------------
