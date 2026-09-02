import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";
import { CoachOption, SeekerContext, rankCoachesForSeeker, recordLlmUsage } from "@/lib/gemini";

/**
 * "Which of these coaches should I look at first?"
 *
 * Same division as the coach's side: search_providers decides who is eligible
 * — teaches it, serves a live area, approved, unsuspended, within the radius
 * — and the model only orders what came back and says why. With the model off
 * this endpoint still returns a sensible list; it just returns it unranked and
 * unexplained.
 *
 * Unlike the coach's ranking, this one is not asked for. It renders under the
 * requirement on the dashboard and above the results in search, both of which
 * people open without meaning to ask a question — so the answer is cached
 * against a fingerprint of the requirement it was computed for, and only a
 * change to that requirement (or a week passing) pays for a new one.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Below this the parent can read the list themselves; ranking three is noise. */
const MIN_TO_RANK = 4;
/** Above this the prompt gets long and the tail is too far away to matter. */
const MAX_TO_RANK = 25;
/** Coaches join, open new areas and go quiet. A ranking should not outlive that. */
const STALE_AFTER_DAYS = 7;
/** Wide by default: a suggestion may reasonably reach further than a search. */
const RADIUS_KM = 25;

type Pick = { provider_id: string; reason: string };

type ProviderRow = {
  id: string;
  display_name: string | null;
  bio: string | null;
  help_statement: string | null;
  photo_url: string | null;
  is_featured: boolean;
  service_category_ids: string[] | null;
  experience_years: number | null;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  teaching_places: string[] | null;
  provider_category_id: string | null;
  provider_type: string;
  nearest_area_id: string | null;
  nearest_area_name: string | null;
  city_name: string | null;
  distance_km: number | null;
};

/**
 * What the ranking was computed for.
 *
 * Everything the model was told about the parent, plus the candidate set's own
 * identity — because a coach being approved into their area changes the right
 * answer just as much as the parent changing their mind, and the parent has no
 * way to know that happened.
 */
function fingerprint(parts: (string | number | null | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseServerAuth.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const [{ data: profile }, { data: seeker }] = await Promise.all([
      supabaseServerAdmin.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabaseServerAdmin.from("seekers").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    // A coach who lands on the parent's search page must not be invited to
    // fill in a requirement — reported separately from "hasn't said yet",
    // because the caller shows those two very different things.
    if ((profile?.role || "") !== "seeker") {
      return NextResponse.json({ suggestions: [], reason: "not_a_seeker" });
    }

    const wantedIds: string[] = seeker?.looking_for || [];

    // Nothing to suggest against. Not an error — most of the product works
    // without a requirement, and this is the state the invitation exists for.
    if (!seeker || wantedIds.length === 0 || !seeker.area_id) {
      return NextResponse.json({ suggestions: [], reason: "no_requirement" });
    }

    // Eligibility, entirely in SQL, as the caller's own session so the live-area
    // gate and RLS apply exactly as they do to the parent's own search.
    const asUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Origin, but not a fence. search_providers restricts candidates to
    // p_area_id when it is given — right for a search where the parent picked
    // that area, wrong here, where the point is to look a little wider than
    // they would have themselves. So the area's centroid is passed as
    // coordinates instead and the radius does the limiting.
    const { data: origin } = await supabaseServerAdmin
      .from("areas")
      .select("lat, lng")
      .eq("id", seeker.area_id)
      .maybeSingle();

    const lat = seeker.lat ?? origin?.lat ?? null;
    const lng = seeker.lng ?? origin?.lng ?? null;

    // Without an origin there is no radius, and no radius over every live area
    // is not a suggestion, it is the whole database.
    if (lat === null || lng === null) {
      return NextResponse.json({ suggestions: [], reason: "no_origin" });
    }

    const { data: found, error: searchError } = await asUser.rpc("search_providers", {
      p_lat: lat,
      p_lng: lng,
      p_area_id: null,
      // One call, then filtered on the overlap: search_providers takes a single
      // subject and a parent may want three.
      p_service_category_id: null,
      p_provider_type: null,
      p_radius_km: RADIUS_KM,
      p_limit: 100,
    });

    if (searchError) {
      return NextResponse.json({ error: searchError.message }, { status: 400 });
    }

    const wanted = new Set(wantedIds);
    const candidates = ((found as ProviderRow[] | null) || []).filter((p) =>
      (p.service_category_ids || []).some((id) => wanted.has(id))
    );

    if (candidates.length === 0) {
      return NextResponse.json({ suggestions: [], reason: "nothing_nearby" });
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
      (seeker.preferred_modes || []).join(","),
      (seeker.preferred_days || []).join(","),
      seeker.preferred_time,
      seeker.budget_min,
      seeker.budget_max,
      seeker.budget_period,
      seeker.requirement_notes,
      RADIUS_KM,
      // the candidate set itself
      shortlist.map((p) => p.id).sort().join(","),
    ]);

    const { data: cached } = await supabaseServerAdmin
      .from("seeker_suggestions")
      .select("fingerprint, picks, created_at")
      .eq("seeker_id", userId)
      .maybeSingle();

    const fresh =
      cached?.fingerprint === print &&
      Date.now() - new Date(cached.created_at).getTime() < STALE_AFTER_DAYS * 86_400_000;

    // Too few to be worth a ranking. The caller still gets the list, in
    // search's own distance order — a shortlist of three coaches does not need
    // a machine to put it in order.
    if (!fresh && shortlist.length < MIN_TO_RANK) {
      return NextResponse.json({
        suggestions: shortlist.map((p) => ({ provider: p, reason: null })),
        ranked: false,
      });
    }

    let picks: Pick[] = fresh ? ((cached!.picks as Pick[]) || []) : [];

    if (!fresh) {
      const [{ data: serviceRows }, { data: placeRows }] = await Promise.all([
        supabaseServerAdmin.from("service_category_master").select("id, name"),
        supabaseServerAdmin.from("teaching_place_master").select("id, label"),
      ]);

      const serviceName = new Map((serviceRows || []).map((s) => [s.id, s.name]));
      const placeLabel = new Map((placeRows || []).map((p) => [p.id, p.label]));

      const context: SeekerContext = {
        wants: wantedIds.map((id) => serviceName.get(id) || id),
        area: seeker.area || "their area",
        learnerAge: seeker.learner_age ?? null,
        level: seeker.level ?? null,
        preferredModes: (seeker.preferred_modes || []).map(
          (id: string) => placeLabel.get(id) || id
        ),
        preferredDays: seeker.preferred_days || [],
        preferredTime: seeker.preferred_time ?? null,
        budgetMin: seeker.budget_min ?? null,
        budgetMax: seeker.budget_max ?? null,
        budgetPeriod: seeker.budget_period ?? null,
        notes: seeker.requirement_notes || "",
      };

      const options: CoachOption[] = shortlist.map((p) => ({
        id: p.id,
        name: p.display_name || "A coach",
        // Only what this parent asked about — a maths tutor who also teaches
        // chess is not more relevant to a football requirement for it.
        teaches: (p.service_category_ids || [])
          .filter((id) => wanted.has(id))
          .map((id) => serviceName.get(id) || id),
        area: p.nearest_area_name || seeker.area || "nearby",
        distanceKm: p.distance_km,
        experienceYears: p.experience_years,
        feeMin: p.fee_min,
        feeMax: p.fee_max,
        feePeriod: p.fee_period,
        teachingPlaces: (p.teaching_places || []).map((id) => placeLabel.get(id) || id),
        helpStatement: p.help_statement || "",
        bio: p.bio || "",
      }));

      const { result, usage } = await rankCoachesForSeeker(context, options);
      await recordLlmUsage("rank_coaches_for_seeker", usage, userId);

      picks = result.map((r) => ({ provider_id: r.providerId, reason: r.reason }));

      await supabaseServerAdmin
        .from("seeker_suggestions")
        .upsert(
          { seeker_id: userId, fingerprint: print, picks, created_at: new Date().toISOString() },
          { onConflict: "seeker_id" }
        );
    }

    // Resolve against this request's candidates, never against what was cached:
    // a coach suspended since the ranking was written must drop out of it.
    const byId = new Map(shortlist.map((p) => [p.id, p]));
    const suggestions = picks
      .filter((p) => byId.has(p.provider_id))
      .map((p) => ({ provider: byId.get(p.provider_id)!, reason: p.reason }));

    return NextResponse.json({ suggestions, ranked: true, cached: fresh });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't work out suggestions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
