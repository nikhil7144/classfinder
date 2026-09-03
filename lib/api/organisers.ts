import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * The organiser's own listing, through the API.
 *
 * Browser-only, like ./my-feed — it reads the session for a token. The reads
 * here deliberately do NOT fail soft: a form that silently shows nothing is
 * worse than one that says it could not load, which is the lesson from the
 * profile form telling providers to go and ask an admin about cities that
 * were there all along.
 */

export type Organiser = components["schemas"]["OrganiserDto"];
export type OrganiserPatch = components["schemas"]["UpdateOrganiserDto"];

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Null means no listing yet, which is a normal state for an account that has
 * chosen the role and not filled the form in. An error means we could not
 * find out, and the caller must not treat the two the same.
 */
export async function fetchMyOrganiser(): Promise<
  { organiser: Organiser | null; error: null } | { organiser: null; error: string }
> {
  const token = await accessToken();
  if (!token) return { organiser: null, error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/organisers/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) return { organiser: null, error: "Couldn't load your listing." };
    // The endpoint returns null for "none yet"; openapi-fetch gives us an
    // empty object for a JSON null body, so an absent id means absent row.
    return { organiser: data && (data as Organiser).id ? (data as Organiser) : null, error: null };
  } catch {
    return { organiser: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function saveMyOrganiser(
  patch: OrganiserPatch,
): Promise<{ organiser: Organiser | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { organiser: null, error: "Log in again." };

  try {
    const { data, error } = await api.PUT("/api/v1/organisers/me", {
      headers: { Authorization: `Bearer ${token}` },
      body: patch,
    });
    if (error || !data) {
      // The API's own message where there is one — it says which field, and
      // that is more use than a generic failure.
      const message =
        (error as { message?: string | string[] } | undefined)?.message ?? "Couldn't save that.";
      return { organiser: null, error: Array.isArray(message) ? message[0] : message };
    }
    return { organiser: data as Organiser, error: null };
  } catch {
    return { organiser: null, error: "Couldn't reach the server. Try again." };
  }
}
