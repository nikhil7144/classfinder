import { createServerClient } from "@supabase/ssr";

/**
 * A server-side client with no session at all.
 *
 * For the pages a stranger reads — the sitemap and the coach landing pages.
 * Deliberately cookie-free: those pages are cached and shared between every
 * visitor, so reading a session would mean one person's view of the site being
 * served to the next.
 *
 * It also means Postgres decides what they contain. Every table these pages
 * touch carries a public-read policy holding the real visibility rule, so an
 * anonymous read returns exactly the set a logged-out visitor may see — which
 * is the definition of what belongs on a public landing page.
 */
export function createAnonServerClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}
