import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * The coach's own listing.
 *
 * Browser-only: it reads the session for a token, like ./my-events and
 * ./my-feed. Kept apart from ./client so a server component can import the
 * public fetchers without pulling the Supabase browser client in.
 */

export type SaveProviderProfile = components["schemas"]["SaveProviderProfileDto"];
export type SavedProfile = components["schemas"]["SavedProfileDto"];

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The API's own sentence wherever it wrote one.
 *
 * save_provider_profile() raises things like "Choose what kind of provider
 * this is." and validation arrives as a list. Replacing either with "Couldn't
 * save that" throws away the most precise thing anyone knows about what went
 * wrong.
 */
function apiMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string | string[] } | undefined)?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message[0] : message;
}

/**
 * Save the whole listing in one call.
 *
 * The whole thing every time, not a patch: the service replaces branches and
 * service areas wholesale, so anything omitted is cleared.
 *
 * This replaces four separate writes that used to happen here — upsert
 * providers, delete-and-reinsert branches or service areas, then set
 * profile_complete — six of which discarded their result. The delete ran
 * before the insert, so a failure between them left a coach in neither table,
 * which is to say discoverable nowhere, while the form said "Saved". The
 * endpoint does the lot in one transaction.
 *
 * Nothing about approval is sent. A first save waits for review; an edit does
 * not disturb it.
 */
export async function saveProviderProfile(
  body: SaveProviderProfile,
): Promise<{ saved: SavedProfile | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { saved: null, error: "Log in again." };

  try {
    const { data, error } = await api.PUT("/api/v1/providers/me", {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });

    if (error || !data) {
      return { saved: null, error: apiMessage(error, "Unable to save profile.") };
    }
    return { saved: data, error: null };
  } catch {
    return { saved: null, error: "Couldn't reach the server. Try again." };
  }
}
