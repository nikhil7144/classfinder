import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SlackService } from "../notify/slack.service";
import { SupabaseService } from "../supabase/supabase.service";
import {
  ProviderProfileDto,
  ProviderSearchQueryDto,
  ProviderSearchResultDto,
} from "./dto/provider.dto";
import { SaveProviderProfileDto } from "./dto/save-profile.dto";
import { MyListingDto } from "./dto/my-listing.dto";
import { SavedProfileDto } from "./dto/saved-profile.dto";

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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly slack: SlackService,
  ) {}

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
   * The caller's own listing, as they edit it.
   *
   * Three reads of their own rows rather than get_provider_profile(), which
   * answers null while a listing is unapproved — the screen a new coach fills
   * in could never load through it. "owner read own provider row" and the
   * branch and service-area policies cover all three, so nothing here has
   * privilege the browser did not already have.
   *
   * Null when they have not started one. That is a real state, not an error:
   * a coach who has chosen their role but filled nothing in yet.
   */
  async myListing(caller: Caller): Promise<MyListingDto | null> {
    const db = this.supabase.asUser(caller.accessToken);

    const [{ data: provider, error }, { data: profile }] = await Promise.all([
      db.from("providers").select("*").eq("user_id", caller.id).maybeSingle(),
      db.from("profiles").select("profile_complete").eq("id", caller.id).maybeSingle(),
    ]);

    if (error) throw new InternalServerErrorException(error.message);
    if (!provider) return null;

    const row = provider as Record<string, unknown>;
    const id = row.id as string;

    const [{ data: branches }, { data: areas }] = await Promise.all([
      db.from("branches").select("id, label, address, area_id, phone").eq("provider_id", id),
      db.from("provider_service_areas").select("area_id").eq("provider_id", id),
    ]);

    return {
      id,
      providerType: row.provider_type as string,
      providerCategoryId: (row.provider_category_id as string | null) ?? null,
      displayName: (row.display_name as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      helpStatement: (row.help_statement as string | null) ?? null,
      age: num(row.age),
      experienceYears: num(row.experience_years),
      feeMin: num(row.fee_min),
      feeMax: num(row.fee_max),
      feePeriod: (row.fee_period as string | null) ?? null,
      feesNote: (row.fees_note as string | null) ?? null,
      teachingPlaces: list<string>(row.teaching_places),
      travelsToStudents: Boolean(row.travels_to_students),
      certifications: list(row.certifications),
      availability: list(row.availability),
      serviceCategoryIds: list<string>(row.service_category_ids),
      photoUrl: (row.photo_url as string | null) ?? null,
      branches: list<Record<string, unknown>>(branches).map((b) => ({
        id: b.id as string,
        label: (b.label as string | null) ?? null,
        address: (b.address as string | null) ?? null,
        areaId: (b.area_id as string | null) ?? null,
        phone: (b.phone as string | null) ?? null,
      })),
      serviceAreaIds: list<Record<string, unknown>>(areas).map((a) => a.area_id as string),
      approved: Boolean(row.approved),
      isSuspended: Boolean(row.is_suspended),
      profileComplete: Boolean((profile as { profile_complete?: boolean } | null)?.profile_complete),
    };
  }

  /**
   * Save the caller's own listing, whole.
   *
   * One call to save_provider_profile(), which is one transaction. The form on
   * the web does this as four round trips and discards the result of six of
   * them; the delete of branches or service areas runs before the insert that
   * replaces them, so a failure in between leaves a coach discoverable
   * nowhere and tells them it saved.
   *
   * The payload is snake_cased here rather than in the function, so the
   * contract stays camelCase like every other endpoint and the SQL stays
   * readable against the columns it writes.
   *
   * approved is not sent and cannot be. The function decides: false on a first
   * save, untouched on an edit.
   */
  async saveProfile(caller: Caller, body: SaveProviderProfileDto): Promise<SavedProfileDto> {
    const db = this.supabase.asUser(caller.accessToken);

    // Read before the write. save_provider_profile() sets profile_complete, so
    // afterwards there is no way to tell a registration from the fourth edit
    // of a fee — and only the first is worth telling anybody about.
    // Wrapped, because this read exists only to decide whether to tell Slack.
    // It must not be able to fail a save: unknown means no announcement, which
    // is the right way round — a missed message costs the office a glance at
    // the database, and a failed save costs somebody their afternoon's typing.
    const isFirst = await this.isFirstCompletion(db, caller.id);

    const { data, error } = await db.rpc("save_provider_profile", {
      p_profile: {
        provider_type: body.providerType,
        provider_category_id: body.providerCategoryId ?? null,
        display_name: body.displayName,
        bio: body.bio ?? null,
        help_statement: body.helpStatement ?? null,
        age: body.age ?? null,
        experience_years: body.experienceYears ?? null,
        fee_min: body.feeMin ?? null,
        fee_max: body.feeMax ?? null,
        fee_period: body.feePeriod ?? null,
        fees_note: body.feesNote ?? null,
        teaching_places: body.teachingPlaces ?? [],
        travels_to_students: body.travelsToStudents ?? false,
        certifications: body.certifications ?? [],
        availability: body.availability ?? [],
        service_category_ids: body.serviceCategoryIds ?? [],
        photo_url: body.photoUrl ?? null,
        branches: (body.branches ?? []).map((b) => ({
          label: b.label ?? null,
          address: b.address ?? null,
          area_id: b.areaId,
          phone: b.phone ?? null,
        })),
        service_area_ids: body.serviceAreaIds ?? [],
      },
    });

    if (error) {
      // The function raises sentences — "Sign in first.", "Choose what kind of
      // provider this is." — and P0001 carries them. Anything else is ours.
      if (error.code === "P0001") throw new BadRequestException(error.message);
      throw new InternalServerErrorException(error.message);
    }

    // Not through get_provider_profile(): it answers null for an unapproved
    // listing, so reading a first save back through it would 404 the thing
    // that just succeeded. The owner's own row instead — "owner read own
    // provider row" covers it — carrying whether anyone can see them yet.
    const { data: row, error: readError } = await db
      .from("providers")
      .select("id, approved, is_suspended")
      .eq("id", data as string)
      .single();

    if (readError) throw new InternalServerErrorException(readError.message);

    const saved = row as { id: string; approved: boolean; is_suspended: boolean };

    // Deliberately not awaited. The coach is waiting on a save, and a webhook
    // round trip is not theirs to pay for.
    if (isFirst) void this.announce(caller, body);

    return { id: saved.id, approved: saved.approved, isSuspended: saved.is_suspended };
  }

  /**
   * Whether this save is the one that completes the profile.
   *
   * save_provider_profile() sets profile_complete, so after it runs there is no
   * way to tell a registration from the fourth edit — and only the first is
   * worth announcing. Read before, and never allowed to throw.
   */
  private async isFirstCompletion(
    db: ReturnType<SupabaseService["asUser"]>,
    userId: string,
  ): Promise<boolean> {
    try {
      const { data } = await db
        .from("profiles")
        .select("profile_complete")
        .eq("id", userId)
        .maybeSingle();

      return !(data as { profile_complete: boolean } | null)?.profile_complete;
    } catch {
      // Unknown. Say nothing rather than risk saying it twice.
      return false;
    }
  }

  /**
   * Tell the team a listing has arrived for review.
   *
   * Its own method because it does two reads of its own, and none of it may
   * ever reach the caller: a coach finishing their listing must not see an
   * error because Slack was down.
   */
  private async announce(caller: Caller, body: SaveProviderProfileDto): Promise<void> {
    try {
      if (!this.slack.configured) return;
      const db = this.supabase.asUser(caller.accessToken);

      // Where they are: an academy's first branch, an individual's first
      // served area. The same rule save_provider_profile uses for the legacy
      // city/area columns.
      const areaId =
        body.providerType === "institution"
          ? body.branches?.[0]?.areaId
          : body.serviceAreaIds?.[0];

      const [{ data: area }, { data: profile }] = await Promise.all([
        areaId
          ? db.from("areas").select("name, cities(name)").eq("id", areaId).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from("profiles").select("phone").eq("id", caller.id).maybeSingle(),
      ]);

      const row = area as { name: string; cities?: { name: string } | null } | null;

      this.slack.providerRegistered({
        name: body.displayName,
        providerType: body.providerType,
        area: row ? [row.name, row.cities?.name].filter(Boolean).join(", ") : null,
        phone: (profile as { phone: string | null } | null)?.phone ?? null,
      });
    } catch {
      // Swallowed on purpose. See the note above.
    }
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
