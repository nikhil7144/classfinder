import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  ProviderProfileDto,
  ProviderSearchQueryDto,
  ProviderSearchResultDto,
} from "./dto/provider.dto";

/** A row as search_providers() returns it. */
export type SearchRow = {
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

/** The jsonb object get_provider_profile() builds. */
export type ProfileJson = Record<string, unknown>;

/**
 * numeric columns arrive from PostgREST as strings, because a 64-bit number
 * does not survive JSON. Coerced once here rather than in each client — the
 * same reasoning as the count() helper in feeds.service.
 */
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const toSearchResult = (row: SearchRow): ProviderSearchResultDto => ({
  id: row.id,
  displayName: row.display_name,
  bio: row.bio,
  helpStatement: row.help_statement,
  providerType: row.provider_type,
  providerCategoryId: row.provider_category_id,
  photoUrl: row.photo_url,
  isFeatured: row.is_featured,
  serviceCategoryIds: row.service_category_ids ?? [],
  experienceYears: num(row.experience_years),
  feeMin: num(row.fee_min),
  feeMax: num(row.fee_max),
  feePeriod: row.fee_period,
  teachingPlaces: row.teaching_places ?? [],
  nearestAreaId: row.nearest_area_id,
  nearestAreaName: row.nearest_area_name,
  cityName: row.city_name,
  distanceKm: num(row.distance_km),
});

export const toProfile = (row: ProfileJson): ProviderProfileDto => ({
  id: row.id as string,
  displayName: (row.display_name as string | null) ?? null,
  bio: (row.bio as string | null) ?? null,
  helpStatement: (row.help_statement as string | null) ?? null,
  providerType: row.provider_type as string,
  photoUrl: (row.photo_url as string | null) ?? null,
  isFeatured: Boolean(row.is_featured),
  age: num(row.age),
  experienceYears: num(row.experience_years),
  feeMin: num(row.fee_min),
  feeMax: num(row.fee_max),
  feePeriod: (row.fee_period as string | null) ?? null,
  feesNote: (row.fees_note as string | null) ?? null,
  teachingPlaces: list<string>(row.teaching_places),
  certifications: list(row.certifications),
  availability: list(row.availability),
  categoryName: (row.category_name as string | null) ?? null,
  services: list(row.services),
  branches: list<Record<string, unknown>>(row.branches).map((b) => ({
    label: (b.label as string | null) ?? null,
    address: (b.address as string | null) ?? null,
    areaName: (b.area_name as string | null) ?? null,
    cityName: (b.city_name as string | null) ?? null,
  })),
  serviceAreas: list<Record<string, unknown>>(row.service_areas).map((a) => ({
    areaName: (a.area_name as string | null) ?? null,
    cityName: (a.city_name as string | null) ?? null,
  })),
});

@Injectable()
export class ProvidersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * The directory search.
   *
   * Read as anon even when a caller is present. search_providers() takes no
   * account of who is asking — it filters on approved, unsuspended, and the
   * area-wise launch gate — so the answer is identical for everybody and can
   * be cached in front of. Same reasoning as the guest city feed.
   */
  async search(query: ProviderSearchQueryDto): Promise<ProviderSearchResultDto[]> {
    const { data, error } = await this.supabase.anon().rpc("search_providers", {
      p_lat: query.lat ?? null,
      p_lng: query.lng ?? null,
      p_area_id: query.areaId ?? null,
      p_service_category_id: query.serviceCategoryId ?? null,
      p_provider_type: query.providerType ?? null,
      p_radius_km: query.radiusKm ?? 15,
      p_limit: query.limit ?? 50,
    });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as SearchRow[]) ?? []).map(toSearchResult);
  }

  /**
   * One coach's public profile.
   *
   * Read as the caller when there is one so RLS resolves for them, and as anon
   * otherwise: a family can read a profile before signing up, which is what
   * the landing page promises.
   *
   * get_provider_profile() is security invoker and states the visibility rule
   * itself — approved, not suspended, not an event planner — returning null
   * when it fails. That null becomes a 404 here and is not re-checked, because
   * a copy of that rule in TypeScript is a copy that can disagree with the one
   * actually enforcing it.
   */
  async one(id: string, caller: Caller | null): Promise<ProviderProfileDto> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();
    const { data, error } = await db.rpc("get_provider_profile", { p_id: id });

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("No such coach.");
    return toProfile(data as ProfileJson);
  }
}
