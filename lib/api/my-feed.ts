import { supabase } from "@/lib/supabase";
import { api, type FeedPost } from "@/lib/api/client";

/**
 * The one feed read that needs to know who is asking.
 *
 * Separated from ./client because it imports the browser Supabase client for
 * the access token, which makes this module browser-only. The API verifies
 * that token and then queries Postgres as the caller, so `auth.uid()` inside
 * my_space_feed() still resolves to this person and RLS still applies —
 * nothing about who may see what moved out of the database.
 */
export async function fetchMyFeed(before?: string | null, limit = 24): Promise<FeedPost[]> {
  // Read from the live session rather than a stored copy: it is refreshed
  // under us, and a token cached in a module goes stale without saying so.
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return [];

  const { data, error } = await api.GET("/api/v1/feeds/me", {
    headers: { Authorization: `Bearer ${token}` },
    params: { query: { limit, ...(before ? { before } : {}) } },
  });
  if (error || !data) return [];
  return data;
}
