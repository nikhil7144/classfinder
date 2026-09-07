-- Phase 3M — receipts say Aspire91.
--
-- The platform is Aspire91 now, on aspire91.com, and a receipt number is one
-- of the few strings a family keeps: it goes in a wallet, gets read out at a
-- gate, and comes back weeks later in a message asking about a refund. CF-
-- was the working title's.
--
-- RECEIPTS ALREADY ISSUED KEEP THEIR NUMBER
--
-- Nothing here rewrites event_entries. A receipt is the identifier of a
-- payment that has already happened, and renumbering one would break the only
-- link between a row and whatever an organiser wrote in their own book. The
-- two prefixes coexist, the old ones age out, and the sequence keeps counting
-- so no number is ever issued twice under either.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3k.

create or replace function public.next_receipt_no()
returns text
language sql
volatile
as $fn$
  select 'A91-'
      || to_char(now() at time zone 'Asia/Kolkata', 'YYMM')
      || '-'
      || lpad(nextval('public.event_receipt_seq')::text, 5, '0');
$fn$;

revoke execute on function public.next_receipt_no from public;
