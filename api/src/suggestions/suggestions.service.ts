import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  CoachContext,
  CoachOption,
  DemandContext,
  LlmUsage,
  MODEL,
  SeekerContext,
  rankCoachesForSeeker,
  rankDemandForCoach,
} from "../ai/gemini";
import {
  CoachSuggestionsDto,
  StudentSuggestionsDto,
  StudentSuggestionsQueryDto,
} from "./dto/suggestions.dto";

/** Below this the reader can order the list themselves; ranking three is noise. */
const MIN_TO_RANK = 4;
/** Above this the prompt gets long and the tail is too far away to matter. */
const MAX_TO_RANK = 25;
/** Coaches join, open new areas and go quiet. A ranking should not outlive that. */
const STALE_AFTER_DAYS = 7;
/** Wide by default: a suggestion may reasonably reach further than a search. */
const RADIUS_KM = 25;

type Pick = { provider_id: string; reason: string };

/** A row as students_for_provider() returns it. */
type DemandRow = {
  kind: string;
  id: string;
  service_names: string[] | null;
  area_name: string;
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
  /** Set once the coach has written to them. Those are not re-ranked. */
  contact_status: string | null;
};

type ProviderRow = {
  id: string;
  display_name: string | null;
  bio: string | null;
  help_statement: string | null;
  service_category_ids: string[] | null;
  experience_years: number | null;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  teaching_places: string[] | null;
  nearest_area_name: string | null;
  distance_km: number | null;
};

/**
 * What a ranking was computed for.
 *
 * Everything the model was told, plus the candidate set's own identity —
 * because a coach being approved into an area changes the right answer just
 * as much as the parent changing their mind, and the parent has no way to
 * know that happened.
 */
const fingerprint = (parts: (string | number | null | undefined)[]): string =>
  createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 32);

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Metering, as the caller.
   *
   * The route this replaced wrote llm_usage_log with the service role. This
   * service has none, so the write goes through record_llm_usage(), a definer
   * function. Failing to meter must never fail the answer the user asked for
   * — a missing cost row is an operator's problem, not theirs.
   */
  private async meter(
    db: SupabaseClient,
    purpose: "rank_coaches_for_seeker" | "rank_demand_for_coach",
    usage: LlmUsage,
    relatedId: string | null,
  ): Promise<void> {
    const { error } = await db.rpc("record_llm_usage", {
      p_purpose: purpose,
      p_model: MODEL,
      p_prompt_tokens: usage.promptTokens,
      p_completion_tokens: usage.completionTokens,
      p_total_tokens: usage.totalTokens,
      p_related_id: relatedId,
    });
    if (error) this.logger.warn(`Usage not recorded (${purpose}): ${error.message}`);
  }

  /** Reference tables both endpoints need. Public data, readable by anyone. */
  private async lookups(db: SupabaseClient) {
    const [{ data: services }, { data: places }] = await Promise.all([
      db.from("service_category_master").select("id, name"),
      db.from("teaching_place_master").select("id, label"),
    ]);
    return {
      serviceName: new Map(((services as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name])),
      placeLabel: new Map(((places as { id: string; label: string }[]) ?? []).map((p) => [p.id, p.label])),
    };
  }

  /**
   * "Which of these coaches should I look at first?"
   *
   * search_providers decides who is eligible — teaches it, serves a live area,
   * approved, unsuspended, within the radius — and the model only orders what
   * came back and says why. With the model off this still returns a sensible
   * list; it just returns it unranked.
   */
  async coachesForSeeker(caller: Caller): Promise<CoachSuggestionsDto> {
    const db = this.supabase.asUser(caller.accessToken);

    // Own rows, read as the caller. The route this replaced used the service
    // role for both, though "read own profile" and "read own seeker row" have
    // always covered them.
    const [{ data: profile }, { data: seeker }] = await Promise.all([
      db.from("profiles").select("role").eq("id", caller.id).maybeSingle(),
      db.from("seekers").select("*").eq("user_id", caller.id).maybeSingle(),
    ]);

    // A coach landing on the parent's search page must not be invited to fill
    // in a requirement — reported separately from "hasn't said yet", because
    // the caller shows those two very different things.
    if ((profile?.role ?? "") !== "seeker") {
      return { suggestions: [], ranked: false, reason: "not_a_seeker" };
    }

    const wantedIds: string[] = seeker?.looking_for ?? [];
    if (!seeker || wantedIds.length === 0 || !seeker.area_id) {
      return { suggestions: [], ranked: false, reason: "no_requirement" };
    }

    // Origin, but not a fence. search_providers restricts candidates to
    // p_area_id when given — right for a search the parent aimed themselves,
    // wrong here, where the point is to look a little wider. So the area's
    // centroid goes in as coordinates and the radius does the limiting.
    const { data: origin } = await db
      .from("areas")
      .select("lat, lng")
      .eq("id", seeker.area_id)
      .maybeSingle();

    const lat = seeker.lat ?? origin?.lat ?? null;
    const lng = seeker.lng ?? origin?.lng ?? null;

    // Without an origin there is no radius, and no radius over every live area
    // is not a suggestion, it is the whole database.
    if (lat === null || lng === null) {
      return { suggestions: [], ranked: false, reason: "no_origin" };
    }

    const { data: found, error: searchError } = await db.rpc("search_providers", {
      p_lat: lat,
      p_lng: lng,
      p_area_id: null,
      // One call, then filtered on the overlap: search_providers takes a
      // single subject and a parent may want three.
      p_service_category_id: null,
      p_provider_type: null,
      p_radius_km: RADIUS_KM,
      p_limit: 100,
    });
    if (searchError) throw new Error(searchError.message);

    const wanted = new Set(wantedIds);
    const candidates = ((found as ProviderRow[]) ?? []).filter((p) =>
      (p.service_category_ids ?? []).some((id) => wanted.has(id)),
    );
    if (candidates.length === 0) {
      return { suggestions: [], ranked: false, reason: "nothing_nearby" };
    }

    const shortlist = candidates.slice(0, MAX_TO_RANK);

    const print = fingerprint([
      [...wantedIds].sort().join(","),
      seeker.area_id,
      // Moving house changes the right answer as surely as changing subject.
      lat.toFixed(3),
      lng.toFixed(3),
      seeker.learner_age,
      seeker.level,
      (seeker.preferred_modes ?? []).join(","),
      (seeker.preferred_days ?? []).join(","),
      seeker.preferred_time,
      seeker.budget_min,
      seeker.budget_max,
      seeker.budget_period,
      seeker.requirement_notes,
      RADIUS_KM,
      shortlist.map((p) => p.id).sort().join(","),
    ]);

    const { data: cached } = await db
      .from("seeker_suggestions")
      .select("fingerprint, picks, created_at")
      .eq("seeker_id", caller.id)
      .maybeSingle();

    const fresh =
      cached?.fingerprint === print &&
      Date.now() - new Date(cached.created_at).getTime() < STALE_AFTER_DAYS * 86_400_000;

    // Too few to be worth a ranking. The caller still gets the list, in
    // search's own distance order.
    if (!fresh && shortlist.length < MIN_TO_RANK) {
      return {
        suggestions: shortlist.map((p) => ({ provider: p, reason: null })),
        ranked: false,
      };
    }

    let picks: Pick[] = fresh ? ((cached?.picks as Pick[]) ?? []) : [];

    if (!fresh) {
      const { serviceName, placeLabel } = await this.lookups(db);

      const context: SeekerContext = {
        wants: wantedIds.map((id) => serviceName.get(id) ?? id),
        area: seeker.area ?? "their area",
        learnerAge: seeker.learner_age ?? null,
        level: seeker.level ?? null,
        preferredModes: (seeker.preferred_modes ?? []).map((id: string) => placeLabel.get(id) ?? id),
        preferredDays: seeker.preferred_days ?? [],
        preferredTime: seeker.preferred_time ?? null,
        budgetMin: seeker.budget_min ?? null,
        budgetMax: seeker.budget_max ?? null,
        budgetPeriod: seeker.budget_period ?? null,
        notes: seeker.requirement_notes ?? "",
      };

      const options: CoachOption[] = shortlist.map((p) => ({
        id: p.id,
        name: p.display_name ?? "A coach",
        // Only what this parent asked about — a maths tutor who also teaches
        // chess is not more relevant to a football requirement for it.
        teaches: (p.service_category_ids ?? [])
          .filter((id) => wanted.has(id))
          .map((id) => serviceName.get(id) ?? id),
        area: p.nearest_area_name ?? seeker.area ?? "nearby",
        distanceKm: p.distance_km,
        experienceYears: p.experience_years,
        feeMin: p.fee_min,
        feeMax: p.fee_max,
        feePeriod: p.fee_period,
        teachingPlaces: (p.teaching_places ?? []).map((id) => placeLabel.get(id) ?? id),
        helpStatement: p.help_statement ?? "",
        bio: p.bio ?? "",
      }));

      const { result, usage } = await rankCoachesForSeeker(context, options);
      await this.meter(db, "rank_coaches_for_seeker", usage, caller.id);

      picks = result.map((r) => ({ provider_id: r.providerId, reason: r.reason }));

      const { error: saveError } = await db.rpc("save_seeker_suggestions", {
        p_fingerprint: print,
        p_picks: picks,
      });
      // A cache that failed to save costs the next request a model call. It
      // does not cost this one its answer.
      if (saveError) this.logger.warn(`Suggestions not cached: ${saveError.message}`);
    }

    // Resolved against this request's candidates, never against what was
    // cached: a coach suspended since the ranking was written must drop out.
    const byId = new Map(shortlist.map((p) => [p.id, p]));
    return {
      suggestions: picks
        .filter((p) => byId.has(p.provider_id))
        .map((p) => ({ provider: byId.get(p.provider_id)!, reason: p.reason })),
      ranked: true,
      cached: fresh,
    };
  }

  /**
   * The other direction: which families on a coach's demand feed are worth
   * their attention first.
   *
   * Not cached, unlike the parent's — this one is asked for deliberately
   * rather than rendered on arrival, so a stale answer would be a worse
   * failure than a repeated call.
   *
   * The filters come in as a body but the rows do not: the route this
   * replaced fetched them itself, on the grounds that what the model is shown
   * about other people's families should never be something a caller can
   * compose. That reasoning is unchanged and is why only the four filter
   * values are accepted here.
   */
  async studentsForProvider(
    caller: Caller,
    query: StudentSuggestionsQueryDto,
  ): Promise<StudentSuggestionsDto> {
    const db = this.supabase.asUser(caller.accessToken);

    // Their own listing, read as themselves. "owner read own provider row"
    // is unconditional on approval, so an unapproved or suspended coach still
    // gets a straight answer — students_for_provider decides that a moment
    // later either way.
    const { data: provider } = await db
      .from("providers")
      .select("*")
      .eq("id", query.providerId)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!provider) {
      return { suggestions: [], reason: "not_a_provider" };
    }

    const { data: rows, error: demandError } = await db.rpc("students_for_provider", {
      p_provider_id: query.providerId,
      p_service_category_id: query.serviceCategoryId ?? null,
      p_area_id: query.areaId ?? null,
      p_radius_km: query.radiusKm ?? 15,
      p_limit: MAX_TO_RANK,
    });
    if (demandError) throw new Error(demandError.message);

    const demand = (rows as DemandRow[]) ?? [];

    // Untouched rows only. Ranking a family the coach has already written to
    // spends a model call telling them something they did.
    const rankable = demand.filter((d) => !d.contact_status);

    if (rankable.length < MIN_TO_RANK) {
      return { suggestions: [], reason: "no_demand" };
    }

    const { placeLabel } = await this.lookups(db);
    const { data: serviceRows } = await db
      .from("service_category_master")
      .select("id, name")
      .in("id", provider.service_category_ids ?? []);
    const { data: areaRows } = await db
      .from("provider_discoverable_areas")
      .select("area_id")
      .eq("provider_id", query.providerId);

    const areaIds = ((areaRows as { area_id: string }[]) ?? []).map((a) => a.area_id);
    const { data: areaNames } = areaIds.length
      ? await db.from("areas").select("name").in("id", areaIds)
      : { data: [] as { name: string }[] };

    const coach: CoachContext = {
      displayName: provider.display_name || "This coach",
      providerType: provider.provider_type,
      teaches: ((serviceRows as { name: string }[]) ?? []).map((s) => s.name),
      areas: Array.from(new Set(((areaNames as { name: string }[]) ?? []).map((a) => a.name))),
      teachingPlaces: (provider.teaching_places ?? []).map(
        (id: string) => placeLabel.get(id) ?? id,
      ),
      experienceYears: provider.experience_years ?? null,
      feeMin: provider.fee_min ?? null,
      feeMax: provider.fee_max ?? null,
      feePeriod: provider.fee_period ?? null,
      helpStatement: provider.help_statement || "",
      bio: provider.bio || "",
      availability: provider.availability ?? [],
    };

    const context: DemandContext[] = rankable.map((d) => ({
      key: `${d.kind}:${d.id}`,
      kind: d.kind,
      wants: d.service_names ?? [],
      area: d.area_name,
      distance_km: d.distance_km,
      learner_age: d.learner_age,
      level: d.level,
      preferred_modes: (d.preferred_modes ?? []).map((id) => placeLabel.get(id) ?? id),
      preferred_days: d.preferred_days,
      preferred_time: d.preferred_time,
      budget_min: d.budget_min,
      budget_max: d.budget_max,
      budget_period: d.budget_period,
      notes: d.notes,
      students: d.student_count,
    }));

    const { result, usage } = await rankDemandForCoach(coach, context);
    await this.meter(db, "rank_demand_for_coach", usage, query.providerId);

    // Keys, not rows. The caller already has the demand list on screen and
    // joins on `kind:id` itself — sending the families back would be shipping
    // the same rows twice.
    return { suggestions: result };
  }
}
