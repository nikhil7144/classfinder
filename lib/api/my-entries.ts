import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Entries, from both sides: a family's own, and an organiser's register.
 *
 * Browser-only, like ./my-events — every call needs the caller's token, and
 * 3K's functions decide what each side may do with it. Nothing here fails
 * soft: a family told nothing happened, when the entry actually went
 * through, will enter twice.
 */

export type Entry = components["schemas"]["EntryDto"];
export type NewEntry = components["schemas"]["CreateEntryDto"];
export type PaymentStatus = components["schemas"]["SetEntryPaymentDto"]["status"];
export type PaymentMode = NonNullable<components["schemas"]["SetEntryPaymentDto"]["mode"]>;

export type EntryResult = { entry: Entry | null; error: string | null };

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The API's own sentence, wherever it wrote one.
 *
 * 3K raises in words meant for a person — "That category is full", "The
 * deadline for withdrawing from this event has passed" — and the service
 * passes them through. Replacing them here would throw away the only precise
 * thing anybody knows about the refusal.
 */
function apiMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string | string[] } | undefined)?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message[0] : message;
}

export async function fetchMyEntries(): Promise<{ entries: Entry[]; error: string | null }> {
  const token = await accessToken();
  if (!token) return { entries: [], error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/entries/mine", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { entries: [], error: "Couldn't load your entries." };
    return { entries: data, error: null };
  } catch {
    return { entries: [], error: "Couldn't reach the server. Try again." };
  }
}

/** The register for one event. Empty for anybody but its owner, by policy. */
export async function fetchEventEntries(
  eventId: string,
): Promise<{ entries: Entry[]; error: string | null }> {
  const token = await accessToken();
  if (!token) return { entries: [], error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/events/{id}/entries", {
      params: { path: { id: eventId } },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { entries: [], error: "Couldn't load the entries." };
    return { entries: data, error: null };
  } catch {
    return { entries: [], error: "Couldn't reach the server. Try again." };
  }
}

export async function enterEvent(body: NewEntry): Promise<EntryResult> {
  const token = await accessToken();
  if (!token) return { entry: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/entries", {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) return { entry: null, error: apiMessage(error, "Couldn't enter that.") };
    return { entry: data, error: null };
  } catch {
    return { entry: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function cancelEntry(
  id: string,
  body: { reason?: string; refund?: boolean } = {},
): Promise<EntryResult> {
  const token = await accessToken();
  if (!token) return { entry: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/entries/{id}/cancel", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      // Stated rather than left out: the DTO documents a default of true, and
      // a body that omits it types as incomplete against the generated
      // contract. Sending it also means the request says what it wants.
      body: { reason: body.reason, refund: body.refund ?? true },
    });
    if (error || !data) return { entry: null, error: apiMessage(error, "Couldn't cancel that.") };
    return { entry: data, error: null };
  } catch {
    return { entry: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function setEntryPayment(
  id: string,
  body: { status: PaymentStatus; mode?: PaymentMode; reference?: string },
): Promise<EntryResult> {
  const token = await accessToken();
  if (!token) return { entry: null, error: "Log in again." };

  try {
    const { data, error } = await api.PATCH("/api/v1/entries/{id}/payment", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) return { entry: null, error: apiMessage(error, "Couldn't record that.") };
    return { entry: data, error: null };
  } catch {
    return { entry: null, error: "Couldn't reach the server. Try again." };
  }
}
