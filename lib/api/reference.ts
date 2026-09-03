import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Cities, areas and the taxonomy — fetched once, shared by everything.
 *
 * These five tables used to be read from nine screens, each fetching its own
 * slice on mount: the search page pulled all five, both profile forms pulled
 * three, and a parent opening search and then their profile paid for the same
 * 176 service categories twice. They are public, small, identical for
 * everyone, and change only when an admin edits them.
 *
 * No Supabase import, so a server component can use this too. The API caches
 * on its side as well; this one stops the same tab asking twice.
 */

export type City = components["schemas"]["CityRefDto"];
export type Area = components["schemas"]["AreaRefDto"];
export type ServiceCategory = components["schemas"]["ServiceCategoryRefDto"];
export type ProviderCategory = components["schemas"]["ProviderCategoryRefDto"];
export type TeachingPlace = components["schemas"]["TeachingPlaceRefDto"];
export type Reference = components["schemas"]["ReferenceDto"];

/**
 * Whether the fetch actually succeeded.
 *
 * Failing soft is right for a feed — a missing section is better than a
 * broken page. It is wrong for reference data a form depends on, because an
 * empty taxonomy is indistinguishable from a real one, and the profile form
 * told providers "No cities have been set up yet. Ask an admin" when the truth
 * was that the API was unreachable. A form that lies about why it is empty
 * sends people to support for a problem support cannot see.
 *
 * So the data still degrades to empty, and callers that need to tell the
 * difference now can.
 */
export type ReferenceResult = Reference & { ok: boolean };

const EMPTY: Reference = {
  cities: [],
  areas: [],
  serviceCategories: [],
  providerCategories: [],
  teachingPlaces: [],
};

/**
 * The in-flight or settled promise, not the value — so ten components
 * mounting at once make one request between them rather than ten.
 *
 * A failed fetch is not cached: it resolves to empty and clears, so the next
 * screen tries again rather than inheriting a blank taxonomy for the life of
 * the page.
 */
let inFlight: Promise<ReferenceResult> | null = null;

export function fetchReference(): Promise<ReferenceResult> {
  if (inFlight) return inFlight;

  inFlight = api
    .GET("/api/v1/reference", {})
    .then(({ data, error }) => {
      if (error || !data) {
        inFlight = null;
        return { ...EMPTY, ok: false };
      }
      return { ...data, ok: true };
    })
    .catch(() => {
      // A rejected fetch, not an HTTP error — an unreachable API. Same
      // outcome, and the same need to say so rather than show an empty form.
      inFlight = null;
      return { ...EMPTY, ok: false };
    });

  return inFlight;
}

/**
 * Areas a seeker may choose from.
 *
 * `isLive` is the area-wise launch gate and it applies to seekers only —
 * providers register in areas before they open, which is how supply is built
 * up quietly. So the endpoint returns every area with the flag, and the two
 * sides filter differently: this for seekers, the raw list for provider
 * signup.
 */
export async function fetchSeekerLocations(): Promise<{
  cities: City[];
  areas: Area[];
  ok: boolean;
}> {
  const ref = await fetchReference();
  const areas = ref.areas.filter((a) => a.isLive);
  // A city with no live area is a city a seeker cannot pick anything in.
  const liveCityIds = new Set(areas.map((a) => a.cityId));
  return { cities: ref.cities.filter((c) => liveCityIds.has(c.id)), areas, ok: ref.ok };
}

/** Every defined area, for provider signup. See fetchSeekerLocations. */
export async function fetchAllLocations(): Promise<{
  cities: City[];
  areas: Area[];
  ok: boolean;
}> {
  const ref = await fetchReference();
  return { cities: ref.cities, areas: ref.areas, ok: ref.ok };
}

export async function fetchTaxonomy(): Promise<{
  serviceCategories: ServiceCategory[];
  providerCategories: ProviderCategory[];
  teachingPlaces: TeachingPlace[];
  ok: boolean;
}> {
  const { serviceCategories, providerCategories, teachingPlaces, ok } = await fetchReference();
  return { serviceCategories, providerCategories, teachingPlaces, ok };
}
