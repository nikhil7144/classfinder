import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * The public reads: what is on in a city, and one event's page.
 *
 * No Supabase import on purpose, exactly like ./client — these are the reads
 * a guest makes, so a server component renders them into HTML and the event
 * page is crawlable. Anything needing the caller's token lives in
 * ./my-events instead.
 */

export type Event = components["schemas"]["EventDto"];
export type EventCategory = components["schemas"]["EventCategoryDto"];

/**
 * Throwing variants, for callers that cache.
 *
 * Same lesson as the city feed: `unstable_cache` remembers a resolved empty
 * array and would serve "no events in Pune" for the full revalidate window
 * after one unreachable moment. A rejection is not cached.
 */
export async function fetchCityEventsOrThrow(cityId: string): Promise<Event[]> {
  const { data, error } = await api.GET("/api/v1/events/city/{cityId}", {
    params: { path: { cityId } },
  });
  if (error || !data) throw new Error("events unavailable");
  return data;
}

export async function fetchEventOrThrow(id: string): Promise<Event | null> {
  const { data, error, response } = await api.GET("/api/v1/events/{id}", {
    params: { path: { id } },
  });
  // A draft, a deleted event and a typed-in id are all 404 by design — the
  // API refuses to confirm that somebody else's draft exists. That is a
  // notFound() for the page, not a failure to reach the server.
  if (response.status === 404) return null;
  if (error || !data) throw new Error("event unavailable");
  return data;
}

/**
 * Whether the fetch worked, separately from whether it found anything.
 *
 * The listing page has to tell a reader "nothing on in Pune this month" apart
 * from "we could not ask" — the reference-data lesson, which told providers
 * to go and see an admin about cities that were there all along.
 */
export async function fetchCityEvents(
  cityId: string,
): Promise<{ events: Event[]; ok: boolean }> {
  try {
    return { events: await fetchCityEventsOrThrow(cityId), ok: true };
  } catch {
    return { events: [], ok: false };
  }
}
