import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { Event } from "@/lib/api/events";

/**
 * The owner's side of an event: their own list, and every write.
 *
 * Browser-only — it reads the session for a token, like ./organisers. None of
 * these fail soft: an organiser who is told nothing happened, when in fact
 * the save failed, will publish an event with last week's date on it.
 *
 * Nothing here re-checks who owns what. 3J's policies decide, and the service
 * turns a policy that matched no row into a 404 with a sentence in it; a
 * second opinion in TypeScript would be a copy of a rule that already holds.
 */

export type CreateEvent = components["schemas"]["CreateEventDto"];
export type UpdateEvent = components["schemas"]["UpdateEventDto"];
export type CategoryInput = components["schemas"]["EventCategoryInputDto"];
export type EventStatus = components["schemas"]["SetEventStatusDto"]["status"];

export type Result = { event: Event | null; error: string | null };

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The API's own sentence wherever it wrote one.
 *
 * The service translates check-constraint violations into things like "Check
 * the dates: booking has to open before it closes" and explains a refused
 * publish as approval rather than a missing event. Replacing those with
 * "Couldn't save that" would throw away the most precise thing anyone knows
 * about what went wrong.
 */
function apiMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string | string[] } | undefined)?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message[0] : message;
}

export async function fetchMyEvents(): Promise<{ events: Event[]; error: string | null }> {
  const token = await accessToken();
  if (!token) return { events: [], error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/events/mine", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { events: [], error: "Couldn't load your events." };
    return { events: data, error: null };
  } catch {
    return { events: [], error: "Couldn't reach the server. Try again." };
  }
}

/**
 * One event, as its owner — the edit screen's load.
 *
 * Separate from the public read because a draft is a 404 to everyone else,
 * and the owner's own screen must not fall into the guest's copy of that.
 */
export async function fetchMyEvent(id: string): Promise<Result> {
  const token = await accessToken();
  if (!token) return { event: null, error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/events/{id}", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { event: null, error: apiMessage(error, "No such event.") };
    return { event: data, error: null };
  } catch {
    return { event: null, error: "Couldn't reach the server. Try again." };
  }
}

/** Always a draft — the API refuses anything else, and so does 3J. */
export async function createEvent(body: CreateEvent): Promise<Result> {
  const token = await accessToken();
  if (!token) return { event: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/events", {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) return { event: null, error: apiMessage(error, "Couldn't create that.") };
    return { event: data, error: null };
  } catch {
    return { event: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function updateEvent(id: string, patch: UpdateEvent): Promise<Result> {
  const token = await accessToken();
  if (!token) return { event: null, error: "Log in again." };

  try {
    const { data, error } = await api.PATCH("/api/v1/events/{id}", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      body: patch,
    });
    if (error || !data) return { event: null, error: apiMessage(error, "Couldn't save that.") };
    return { event: data, error: null };
  } catch {
    return { event: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function setEventStatus(id: string, status: EventStatus): Promise<Result> {
  const token = await accessToken();
  if (!token) return { event: null, error: "Log in again." };

  try {
    const { data, error } = await api.PATCH("/api/v1/events/{id}/status", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      body: { status },
    });
    if (error || !data) {
      return { event: null, error: apiMessage(error, "Couldn't change that.") };
    }
    return { event: data, error: null };
  } catch {
    return { event: null, error: "Couldn't reach the server. Try again." };
  }
}

/**
 * The whole set, in the order the form shows.
 *
 * The API numbers `sortOrder` from the array index, so the client never
 * numbers its own rows — moving one up is a splice here, not a column to
 * keep consistent.
 */
export async function replaceCategories(
  id: string,
  categories: CategoryInput[],
): Promise<Result> {
  const token = await accessToken();
  if (!token) return { event: null, error: "Log in again." };

  try {
    const { data, error } = await api.PUT("/api/v1/events/{id}/categories", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      body: { categories },
    });
    if (error || !data) {
      return { event: null, error: apiMessage(error, "Couldn't save those categories.") };
    }
    return { event: data, error: null };
  } catch {
    return { event: null, error: "Couldn't reach the server. Try again." };
  }
}
