import {
  fetchSeekerLocations,
  fetchTaxonomy,
  type Area,
  type City,
  type ServiceCategory,
} from "@/lib/api/reference";
import { createAnonServerClient } from "@/lib/supabase-anon";
import type { SearchResult } from "@/lib/search";

/**
 * The pages that exist so a stranger can find a coach.
 *
 * /search cannot do this job. It finds coaches in an effect after a form is
 * filled in, and a crawler fills in no forms — so every listing on this site
 * was reachable only by somebody who already had the link. These pages are the
 * other half: one server-rendered page per place, per subject, and per pair of
 * the two, each titled the thing a parent actually types.
 *
 * They are also the only internal links to a coach's profile that a crawler
 * can follow, which matters more than the ranking: a page nothing links to is
 * a page that does not get crawled at all.
 */

/** A name as it appears in a URL. Areas and subjects have no slug column. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    // Strip the accents NFKD just separated out.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SeoReference = {
  cities: City[];
  areas: Area[];
  services: ServiceCategory[];
  /** Whether the fetch actually succeeded, as opposed to degrading to empty. */
  ok: boolean;
};

/**
 * Thrown when the reference data could not be read at all.
 *
 * The distinction this exists to preserve: a page for an area that does not
 * exist must answer 404, and a page that cannot be built because a dependency
 * is down must answer 500. They look identical from inside the page — no city
 * matched the slug — and they mean opposite things to a crawler. A 404 is
 * "this is gone, drop it"; a 5xx is "come back later", and the page keeps its
 * place in the index.
 *
 * Getting this backwards would quietly de-list every landing page the first
 * time the API had a bad minute.
 */
export class ReferenceUnavailable extends Error {
  constructor() {
    super("Reference data could not be loaded.");
    this.name = "ReferenceUnavailable";
  }
}

/**
 * Only live areas.
 *
 * A coach may register in an area before it opens, so `providers` knows about
 * areas that seekers do not. Building a page for one would promise classes in
 * a place the product does not yet serve — and search_providers filters those
 * rows out anyway, so the page would be empty as well as premature.
 */
export async function seoReference(): Promise<SeoReference> {
  const [locations, taxonomy] = await Promise.all([fetchSeekerLocations(), fetchTaxonomy()]);

  return {
    cities: locations.cities,
    areas: locations.areas,
    services: taxonomy.serviceCategories,
    ok: taxonomy.ok && locations.ok,
  };
}

/** The same thing, for callers that cannot sensibly carry on without it. */
export async function requireSeoReference(): Promise<SeoReference> {
  const reference = await seoReference();
  if (!reference.ok) throw new ReferenceUnavailable();
  return reference;
}

export function findCity(cities: City[], slug: string): City | null {
  return cities.find((c) => slugify(c.name) === slug) ?? null;
}

/** Scoped to one city, which is the point of putting the city first: two
 *  cities may both have a Sector 15, and they are different pages. */
export function findArea(areas: Area[], cityId: string, slug: string): Area | null {
  return areas.find((a) => a.cityId === cityId && slugify(a.name) === slug) ?? null;
}

export function findService(services: ServiceCategory[], slug: string): ServiceCategory | null {
  return services.find((s) => slugify(s.name) === slug) ?? null;
}

/**
 * The coaches a landing page lists.
 *
 * The same search_providers the /search page runs, called with the anon key
 * from the server. It is granted to anon and already filters to approved,
 * unsuspended, non-event-planner rows in live areas, so this adds no rule of
 * its own — which is what stops these pages and search disagreeing about who
 * exists.
 *
 * City is filtered here rather than passed down because the function takes no
 * city parameter: without an area it measures from nowhere, returns every live
 * area's coaches, and names the city on each row. Fine at this size; a city
 * parameter belongs in the function the day it is not.
 */
export async function coachesFor(opts: {
  areaId?: string | null;
  serviceId?: string | null;
  cityName?: string | null;
  limit?: number;
}): Promise<SearchResult[]> {
  const supabase = createAnonServerClient();

  const { data, error } = await supabase.rpc("search_providers", {
    p_lat: null,
    p_lng: null,
    p_area_id: opts.areaId ?? null,
    p_service_category_id: opts.serviceId ?? null,
    p_provider_type: null,
    // Without an origin every distance is null, so nothing is excluded by
    // radius; this only has to be large enough not to bite.
    p_radius_km: 100,
    p_limit: opts.limit ?? 200,
  });

  if (error) return [];

  const rows = (data as SearchResult[]) || [];
  if (!opts.cityName) return rows;
  return rows.filter((r) => r.city_name === opts.cityName);
}

/**
 * Which pages are worth offering to a search engine.
 *
 * Only the combinations that have somebody on them. Generating a page for
 * every subject in every area would be 176 times the area count, almost all of
 * them empty — and a site that is mostly empty pages is crawled less, not
 * more. An empty page still renders for anyone who lands on one; it just says
 * so honestly and asks not to be indexed.
 */
export function isWorthIndexing(count: number): boolean {
  return count > 0;
}

/** Subjects that actually have a coach, in the order they should be listed. */
export function subjectsPresent(
  rows: SearchResult[],
  services: ServiceCategory[]
): ServiceCategory[] {
  const ids = new Set(rows.flatMap((r) => r.service_category_ids ?? []));
  return services.filter((s) => ids.has(s.id));
}

/**
 * Which coach is discoverable in which area, and what each of them teaches.
 *
 * Read straight from provider_discoverable_areas rather than inferred from a
 * search. search_providers returns one area per coach — the nearest — which is
 * the right answer for a result card and the wrong one here: a coach who
 * serves four areas belongs on four pages, and using the search would have
 * listed them on one and left the other three looking empty.
 *
 * The view is security_invoker and granted to anon, so an anonymous read
 * already carries the providers policy through it: approved and unsuspended,
 * nothing else. Two queries answer every question these pages ask, which is
 * what keeps the sitemap from running one search per area.
 */
export type Coverage = {
  /** areaId -> the providers discoverable there. */
  byArea: Map<string, Set<string>>;
  /** providerId -> the subjects they teach. */
  subjects: Map<string, string[]>;
};

export async function publicCoverage(): Promise<Coverage> {
  const supabase = createAnonServerClient();

  const [areasRes, providersRes] = await Promise.all([
    supabase.from("provider_discoverable_areas").select("provider_id, area_id"),
    // provider_type is excluded here for the same reason it is everywhere
    // else: an event planner has no teaching page to link to.
    supabase
      .from("providers")
      .select("id, service_category_ids")
      .neq("provider_type", "event_planner"),
  ]);

  const subjects = new Map<string, string[]>();
  for (const row of providersRes.data ?? []) {
    subjects.set(row.id as string, (row.service_category_ids as string[]) ?? []);
  }

  const byArea = new Map<string, Set<string>>();
  for (const row of areasRes.data ?? []) {
    const providerId = row.provider_id as string;
    // The providers read is the gate: a row here for a coach who is not
    // publicly visible simply has no entry in `subjects`.
    if (!subjects.has(providerId)) continue;
    const areaId = row.area_id as string;
    if (!byArea.has(areaId)) byArea.set(areaId, new Set());
    byArea.get(areaId)!.add(providerId);
  }

  return { byArea, subjects };
}

/** How many publicly visible coaches an area page would list. */
export function countInArea(
  coverage: Coverage,
  areaId: string,
  serviceId?: string | null
): number {
  const providers = coverage.byArea.get(areaId);
  if (!providers) return 0;
  if (!serviceId) return providers.size;

  let n = 0;
  for (const id of providers) {
    if ((coverage.subjects.get(id) ?? []).includes(serviceId)) n += 1;
  }
  return n;
}

/** The areas of one city that have somebody to show. */
export function areasWithCoaches(coverage: Coverage, areas: Area[], cityId: string): Area[] {
  return areas.filter((a) => a.cityId === cityId && countInArea(coverage, a.id) > 0);
}

/** The subjects taught across a set of areas — what a hub page links to. */
export function subjectsAcross(
  coverage: Coverage,
  services: ServiceCategory[],
  areas: Area[]
): ServiceCategory[] {
  const taught = new Set<string>();
  for (const area of areas) {
    for (const providerId of coverage.byArea.get(area.id) ?? []) {
      for (const s of coverage.subjects.get(providerId) ?? []) taught.add(s);
    }
  }
  return services.filter((s) => taught.has(s.id));
}

/** "3 coaches", "1 coach" — used in headings and descriptions alike. */
export function coachCount(n: number): string {
  return n === 1 ? "1 coach" : `${n} coaches`;
}
