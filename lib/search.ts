import { supabase } from "@/lib/supabase";

export type SearchResult = {
  id: string;
  display_name: string | null;
  bio: string | null;
  help_statement: string | null;
  provider_type: string;
  provider_category_id: string | null;
  photo_url: string | null;
  is_featured: boolean;
  service_category_ids: string[] | null;
  experience_years: number | null;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  teaching_places: string[] | null;
  nearest_area_id: string | null;
  nearest_area_name: string | null;
  city_name: string | null;
  distance_km: number | null;
};

export type SearchFilters = {
  areaId?: string | null;
  serviceCategoryId?: string | null;
  providerType?: string | null;
  coords?: { lat: number; lng: number } | null;
  radiusKm?: number;
  limit?: number;
};

/** Default soft radius. Widenable from the UI rather than a hard cutoff. */
export const DEFAULT_RADIUS_KM = 15;
export const RADIUS_OPTIONS = [5, 15, 30, 50];

/**
 * Reads go straight through the anon-key client: search_providers is granted
 * to anon and runs security-invoker, so RLS still applies and guests can
 * browse without an account.
 */
export async function searchProviders(filters: SearchFilters) {
  const { data, error } = await supabase.rpc("search_providers", {
    p_lat: filters.coords?.lat ?? null,
    p_lng: filters.coords?.lng ?? null,
    p_area_id: filters.areaId ?? null,
    p_service_category_id: filters.serviceCategoryId ?? null,
    p_provider_type: filters.providerType ?? null,
    p_radius_km: filters.radiusKm ?? DEFAULT_RADIUS_KM,
    p_limit: filters.limit ?? 50,
  });

  if (error) return { results: [] as SearchResult[], error: error.message };
  return { results: (data as SearchResult[]) || [], error: null };
}

const FEE_PERIOD_LABEL: Record<string, string> = {
  per_hour: "/hour",
  per_session: "/session",
  per_month: "/month",
  per_course: "/course",
};

/** "₹1,500–2,500/month", or null when the provider hasn't published fees. */
export function formatFees(
  min: number | null,
  max: number | null,
  period: string | null
): string | null {
  if (min === null && max === null) return null;

  const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const suffix = period ? FEE_PERIOD_LABEL[period] ?? "" : "";

  if (min !== null && max !== null && min !== max) return `${money(min)}–${money(max)}${suffix}`;
  return `${money((min ?? max) as number)}${suffix}`;
}

/** "1.2 km" / "850 m" — nearby distances read better in metres. */
export function formatDistance(km: number | null): string | null {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatExperience(years: number | null): string | null {
  if (years === null || years === undefined) return null;
  if (years === 0) return "New to teaching";
  return `${years} yr${years === 1 ? "" : "s"} experience`;
}
