import { supabase } from "@/lib/supabase";

/**
 * Demand, as a coach sees it.
 *
 * One row is one family wanting something — a single parent who has published
 * a requirement, or a group of neighbours who have got together. The coach's
 * screen treats them the same on purpose: the question a coach is answering
 * ("is there work here I want?") does not change with the shape of the row,
 * and splitting them across two screens is how the Groups tab came to look
 * empty while there was demand sitting next to it.
 *
 * A parent is never named here. See students_for_provider in
 * db/2026-09-03-phase2r-find-students.sql for why the row carries an area and
 * a requirement and nothing else.
 */
export type DemandKind = "student" | "group";

export type Demand = {
  kind: DemandKind;
  /** A group's id, or the parent's profile id. Never shown; used to contact. */
  id: string;
  service_category_ids: string[];
  service_names: string[];
  service_groups: string[];
  area_id: string;
  area_name: string;
  city_name: string;
  distance_km: number | null;
  learner_age: number | null;
  level: string | null;
  preferred_modes: string[] | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_period: string | null;
  notes: string | null;
  student_count: number;
  member_count: number | null;
  expires_at: string | null;
  created_at: string;
  /**
   * Where this coach's approach stands, if they've made one.
   * group: pending | accepted | declined. student: pending | open | declined.
   */
  contact_status: string | null;
  thread_id: string | null;
};

export type DemandFilters = {
  serviceCategoryId?: string | null;
  areaId?: string | null;
  radiusKm?: number;
  limit?: number;
};

/** Same soft radius as parent-side search, widenable from the UI. */
export const DEFAULT_RADIUS_KM = 15;
export const RADIUS_OPTIONS = [5, 15, 30, 50];

/** The shortest a cold approach can be. Matches the group pitch minimum. */
export const MIN_APPROACH = 20;

export async function fetchDemand(providerId: string, filters: DemandFilters = {}) {
  const { data, error } = await supabase.rpc("students_for_provider", {
    p_provider_id: providerId,
    p_service_category_id: filters.serviceCategoryId ?? null,
    p_area_id: filters.areaId ?? null,
    p_radius_km: filters.radiusKm ?? DEFAULT_RADIUS_KM,
    p_limit: filters.limit ?? 60,
  });

  if (error) return { demand: [] as Demand[], error: error.message };
  return { demand: (data as Demand[]) || [], error: null };
}

/** A stable key for a row — kind and id together, since ids come from two tables. */
export const demandKey = (d: Demand) => `${d.kind}:${d.id}`;

/** How the card is titled. A family is described, never named. */
export function demandTitle(d: Demand): string {
  const what = d.service_names.join(", ") || "Classes";
  if (d.kind === "group") return `${what} group`;
  return what;
}

export function demandSubtitle(d: Demand): string {
  const where = `${d.area_name}, ${d.city_name}`;
  if (d.kind === "group") {
    return `${d.student_count} students · ${d.member_count ?? 0} families · ${where}`;
  }
  return `A parent in ${where}`;
}

/** What the coach can still do about this row, in their own words. */
export function contactLabel(d: Demand): string | null {
  if (!d.contact_status) return null;

  if (d.kind === "group") {
    if (d.contact_status === "pending") return "Waiting for a reply";
    if (d.contact_status === "accepted") return "They replied";
    return "Not taken up";
  }

  if (d.contact_status === "pending") return "Waiting for a reply";
  if (d.contact_status === "open") return "Conversation open";
  return "Not taken up";
}

export function contactTone(d: Demand): string {
  if (d.contact_status === "accepted" || d.contact_status === "open") return "cf-badge-ok";
  if (d.contact_status === "declined") return "cf-badge-neutral";
  return "cf-badge-warn";
}

/** "1.2 km" / "850 m" — same rounding as parent-side search. */
export function formatDistance(km: number | null): string | null {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ---------------------------------------------------------------------
// AI suggestions
// ---------------------------------------------------------------------

export type Suggestion = {
  /** demandKey() of the row this is about. */
  key: string;
  /** One line, in the coach's terms, on why this one is worth their time. */
  reason: string;
};

/**
 * Ranks the demand this coach can see.
 *
 * The filters are the honest part of the feature — they say exactly what they
 * did. The model's job is the judgement a filter cannot make ("they want an
 * 8-year-old taught at home on Saturdays, and that is the batch you already
 * run"). It gets the same rows the screen is showing, but the route fetches
 * them itself rather than trusting a body: what the model is shown about
 * other people's families should not be something a caller can compose.
 *
 * A failure here degrades to the unranked list, which is why nothing above
 * this waits on it.
 */
export async function fetchSuggestions(providerId: string, filters: DemandFilters = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (!token) return { suggestions: [] as Suggestion[], error: "Log in again." };

  const response = await fetch("/api/students/suggest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      providerId,
      serviceCategoryId: filters.serviceCategoryId ?? null,
      areaId: filters.areaId ?? null,
      radiusKm: filters.radiusKm ?? DEFAULT_RADIUS_KM,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    return { suggestions: [] as Suggestion[], error: result.error || "Couldn't rank these." };
  }

  return { suggestions: (result.suggestions as Suggestion[]) || [], error: null };
}
