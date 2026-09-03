import { supabase } from "@/lib/supabase";
import { api, type FeedPost } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * The one feed read that needs to know who is asking.
 *
 * Separated from ./client because it imports the browser Supabase client for
 * the access token, which makes this module browser-only. The API verifies
 * that token and then queries Postgres as the caller, so `auth.uid()` inside
 * my_space_feed() still resolves to this person and RLS still applies —
 * nothing about who may see what moved out of the database.
 */
/**
 * Read from the live session every time rather than a stored copy: it is
 * refreshed under us, and a token cached in a module goes stale without ever
 * saying so.
 */
async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchMyFeed(before?: string | null, limit = 24): Promise<FeedPost[]> {
  const token = await accessToken();
  if (!token) return [];

  try {
    const { data, error } = await api.GET("/api/v1/feeds/me", {
      headers: { Authorization: `Bearer ${token}` },
      params: { query: { limit, ...(before ? { before } : {}) } },
    });
    if (error || !data) return [];
    return data;
  } catch {
    // Unreachable API — see the note in ./client. The feed section renders
    // nothing rather than the dashboard failing.
    return [];
  }
}

/**
 * The two suggestion endpoints, which need the caller's token for the same
 * reason the feed does — and a server for one they don't: the model key.
 *
 * Both fail soft. A ranking is an overlay on a list the caller already has,
 * so when it cannot be produced the page shows that list unranked rather than
 * an error. Nothing on screen waits on these.
 */
export async function fetchCoachSuggestions(): Promise<{
  suggestions: components["schemas"]["CoachSuggestionDto"][];
  reason: string | null;
}> {
  const token = await accessToken();
  if (!token) return { suggestions: [], reason: null };

  try {
    const { data, error } = await api.POST("/api/v1/suggestions/coaches", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { suggestions: [], reason: null };
    return { suggestions: data.suggestions, reason: data.reason ?? null };
  } catch {
    return { suggestions: [], reason: null };
  }
}

export async function fetchStudentSuggestions(body: {
  providerId: string;
  serviceCategoryId?: string | null;
  areaId?: string | null;
  radiusKm?: number;
}): Promise<{ suggestions: components["schemas"]["StudentSuggestionDto"][]; error: string | null }> {
  const token = await accessToken();
  if (!token) return { suggestions: [], error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/suggestions/students", {
      headers: { Authorization: `Bearer ${token}` },
      // The generated type treats a documented default as always sent, so the
      // client supplies it rather than relying on the server's copy. Same
      // number, named in one place either way.
      body: { ...body, radiusKm: body.radiusKm ?? 15 },
    });
    if (error || !data) return { suggestions: [], error: "Couldn't rank these." };
    return { suggestions: data.suggestions, error: null };
  } catch {
    return { suggestions: [], error: "Couldn't rank these." };
  }
}
