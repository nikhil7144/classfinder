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
 * Both feed sections render nothing when empty, so an API that is down or
 * unreachable costs a section rather than the page — the homepage falls back
 * to the brochure it was before 3B, which is the right failure for a shop
 * window.
 *
 * try/catch, not just the error field. openapi-fetch returns `{ error }` for
 * an HTTP error but lets a *network* failure reject, so a refused connection
 * throws straight past that check. That is exactly what an unset
 * NEXT_PUBLIC_API_URL produces in production — the server dials localhost:4000
 * and gets ECONNREFUSED — and it took down the whole page rather than one
 * section of it.
 */
/**
 * The strict variants throw instead of degrading.
 *
 * Failing soft and caching the result are each reasonable and together they
 * are a trap: unstable_cache stored the empty list a failed fetch returned
 * and served it for the next hour, so one unreachable moment kept the
 * homepage feed missing long after the API came back. A thrown error is not
 * cached, which is the whole reason these exist — the caller catches and
 * degrades, and only success is remembered.
 */
export async function fetchCitiesOrThrow(): Promise<City[]> {
  const { data, error } = await api.GET("/api/v1/feeds/cities", {});
  if (error || !data) throw new Error("cities unavailable");
  return data;
}

export async function fetchCityFeedOrThrow(cityId: string, limit = 12): Promise<FeedPost[]> {
  const { data, error } = await api.GET("/api/v1/feeds/cities/{cityId}", {
    params: { path: { cityId }, query: { limit } },
  });
  if (error || !data) throw new Error("feed unavailable");
  return data;
}

export async function fetchCities(): Promise<City[]> {
  try {
    return await fetchCitiesOrThrow();
  } catch {
    return [];
  }
}

export async function fetchCityFeed(cityId: string, limit = 12): Promise<FeedPost[]> {
  try {
    return await fetchCityFeedOrThrow(cityId, limit);
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------
   Published groups.

   Live and public are different things: live means the families are here and
   it is looking for a coach, public means the creator chose to showcase it.
   Only published ones are readable here, and only while still live — the API
   enforces both, so these pages cannot show a group that has quietly lapsed.
   --------------------------------------------------------------------- */

export type DiscoverGroup = components["schemas"]["DiscoverGroupDto"];
export type PublicGroup = components["schemas"]["PublicGroupDto"];
export type ProviderGroup = components["schemas"]["ProviderGroupDto"];

/** Fails soft like every other read here: an empty list costs a section. */
export async function fetchGroupsIn(opts: {
  cityId?: string | null;
  areaId?: string | null;
  serviceCategoryId?: string | null;
  limit?: number;
}): Promise<DiscoverGroup[]> {
  try {
    const { data, error } = await api.GET("/api/v1/groups/discover", {
      params: {
        query: {
          cityId: opts.cityId ?? undefined,
          areaId: opts.areaId ?? undefined,
          serviceCategoryId: opts.serviceCategoryId ?? undefined,
          limit: opts.limit ?? 24,
        },
      },
    });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** The groups one coach trains, for their public page. */
export async function fetchGroupsForCoach(providerId: string): Promise<ProviderGroup[]> {
  try {
    const { data, error } = await api.GET("/api/v1/groups/by-coach/{providerId}", {
      params: { path: { providerId } },
    });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** One published group, as a stranger sees it. Null when it is not public. */
export async function fetchPublicGroup(groupId: string): Promise<PublicGroup | null> {
  try {
    const { data, error } = await api.GET("/api/v1/groups/{id}/public", {
      params: { path: { id: groupId } },
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * The posts a stranger may read.
 *
 * Only what authors opened to the showcase, and only while the group is
 * published — the API decides both, so this cannot show more than it should
 * by forgetting a filter.
 */
export async function fetchPublicGroupPosts(
  groupId: string,
): Promise<components["schemas"]["GroupPostDto"][]> {
  try {
    const { data, error } = await api.GET("/api/v1/groups/{id}/posts", {
      params: { path: { id: groupId } },
    });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
