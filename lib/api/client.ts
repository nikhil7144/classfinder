import createClient from "openapi-fetch";
import type { paths, components } from "@/lib/api/schema";

/**
 * The typed client, generated from api/openapi.json.
 *
 * Nothing here is hand-written: `lib/api/schema.d.ts` comes from
 * `npm run gen:api`, which reads the document the API emits from its own
 * DTOs. A response field that changes shape becomes a TypeScript error here
 * rather than undefined at runtime, which is the whole reason for the tier.
 *
 * This module imports no Supabase client on purpose, so a server component
 * can use it. `lib/supabase.ts` is createBrowserClient and throws outside the
 * browser; anything needing the caller's token lives in ./my-feed instead.
 */

export type FeedPost = components["schemas"]["FeedPostDto"];
export type City = components["schemas"]["CityDto"];

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000";

export const api = createClient<paths>({ baseUrl });

/**
 * Every read here fails soft, returning an empty list.
 *
 * The API is a second service now, and both feeds render nothing when empty.
 * So a sidecar that is restarting costs a section on a page rather than the
 * page — the homepage falls back to the brochure it was before 3B, which is
 * the right failure for a shop window.
 */
export async function fetchCities(): Promise<City[]> {
  const { data, error } = await api.GET("/api/v1/feeds/cities", {});
  if (error || !data) return [];
  return data;
}

export async function fetchCityFeed(cityId: string, limit = 12): Promise<FeedPost[]> {
  const { data, error } = await api.GET("/api/v1/feeds/cities/{cityId}", {
    params: { path: { cityId }, query: { limit } },
  });
  if (error || !data) return [];
  return data;
}
