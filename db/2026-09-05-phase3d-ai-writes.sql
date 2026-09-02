-- Phase 3D — the two writes the AI endpoints need, as definer functions.
--
-- /api/coaches/suggest and /api/students/suggest are the last two surfaces a
-- mobile client cannot reach: both hold the Gemini key, and both use the
-- service role. Moving them to api/ solves the key — a server is exactly what
-- a secret needs — but not the service role, because api/ deliberately does
-- not have one. Every request there runs as the caller so RLS stays the last
-- word, and smuggling a service key in to make two writes work would undo the
-- only thing that posture is for.
--
-- Almost everything those routes read with the service role, the caller could
-- always have read itself: its own profiles row, its own seekers or providers
-- row, and the public reference tables. Only two writes genuinely cannot be
-- expressed as the caller, and they are here.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2r and phase2s.

-- ---------------------------------------------------------------------
-- 1. metering
--
-- llm_usage_log is written by the service role today and read by admins, so
-- `authenticated` has no way to add a row. It needs one now.
--
-- The honest trade: granting this to every signed-in user means a determined
-- one can write plausible-looking rows and distort the cost estimate on the
-- admin page. That is annoyance, not a breach — there is nothing to read back
-- and nothing to escalate — and the alternative was giving a second service
-- the service role key, which is a far worse thing to be wrong about.
--
-- The blast radius is narrowed rather than left open: purpose must be one the
-- product actually uses, and the token counts are capped near the largest
-- plausible call, so the log cannot be inflated by orders of magnitude in one
-- row.
-- ---------------------------------------------------------------------

create or replace function public.record_llm_usage(
  p_purpose text,
  p_model text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_total_tokens integer,
  p_related_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not permitted.';
  end if;

  -- A purpose the product does not have is a caller inventing one.
  if p_purpose not in ('rank_coaches_for_seeker', 'rank_demand_for_coach') then
    raise exception 'Unknown purpose: %', p_purpose;
  end if;

  insert into public.llm_usage_log
    (purpose, model, prompt_tokens, completion_tokens, total_tokens, related_id)
  values (
    p_purpose,
    left(coalesce(p_model, 'unknown'), 100),
    least(greatest(coalesce(p_prompt_tokens, 0), 0), 1000000),
    least(greatest(coalesce(p_completion_tokens, 0), 0), 1000000),
    least(greatest(coalesce(p_total_tokens, 0), 0), 2000000),
    p_related_id
  );
end;
$fn$;

grant execute on function public.record_llm_usage to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. the suggestion cache
--
-- phase2s granted `select` on seeker_suggestions and nothing else, because
-- the only writer was the service role. The row is keyed on seeker_id and
-- upserted, so a caller writing their own is writing over their own — there
-- is no row here belonging to anyone else to damage.
--
-- Still a function rather than an insert policy: the seeker_id must be the
-- caller's, and a policy cannot stop an UPDATE from touching a column it did
-- not mean to. Same reasoning as every other definer write in db/.
-- ---------------------------------------------------------------------

create or replace function public.save_seeker_suggestions(
  p_fingerprint text,
  p_picks jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not permitted.';
  end if;

  insert into public.seeker_suggestions (seeker_id, fingerprint, picks, created_at)
  values (auth.uid(), p_fingerprint, coalesce(p_picks, '[]'::jsonb), now())
  on conflict (seeker_id) do update
    set fingerprint = excluded.fingerprint,
        picks = excluded.picks,
        created_at = excluded.created_at;
end;
$fn$;

grant execute on function public.save_seeker_suggestions to authenticated, service_role;
