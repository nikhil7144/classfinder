import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";
import { CoachContext, DemandContext, rankDemandForCoach, recordLlmUsage } from "@/lib/gemini";

/**
 * "Which of these should I write to first?"
 *
 * The eligibility rules — right subject, served area, a parent who agreed to
 * be found — are already settled in students_for_provider, and stay there
 * where they can be audited. This route is only the ranking on top.
 *
 * It re-runs that function itself, as the caller, rather than accepting a
 * list in the body. Two reasons: what gets sent to a third-party model about
 * other people's families must not be something a caller can compose, and the
 * definer function's auth.uid() check is the same boundary the screen uses, so
 * there is no second copy of "may this coach see this row" to keep in step.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Nothing to rank below this — the coach can read four cards themselves. */
const MIN_TO_RANK = 4;
const MAX_TO_RANK = 40;

/** One row of students_for_provider, as this route needs it. */
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
  contact_status: string | null;
};

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

    const body = await request.json();
    const providerId = typeof body.providerId === "string" ? body.providerId : null;
    if (!providerId) {
      return NextResponse.json({ error: "Which listing?" }, { status: 400 });
    }

    // The coach's own row, read with admin rights because an unapproved or
    // suspended listing must still get a straight answer rather than an empty
    // one — students_for_provider will refuse it a moment later either way.
    const { data: provider } = await supabaseServerAdmin
      .from("providers")
      .select("*")
      .eq("id", providerId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!provider) {
      return NextResponse.json({ error: "That listing isn't yours." }, { status: 403 });
    }

    // Same session, so the definer function sees the same auth.uid() the
    // browser's own call to it saw.
    const asUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: rows, error: demandError } = await asUser.rpc("students_for_provider", {
      p_provider_id: providerId,
      p_service_category_id: body.serviceCategoryId ?? null,
      p_area_id: body.areaId ?? null,
      p_radius_km: typeof body.radiusKm === "number" ? body.radiusKm : 15,
      p_limit: MAX_TO_RANK,
    });

    if (demandError) {
      return NextResponse.json({ error: demandError.message }, { status: 400 });
    }

    const demand = (rows as DemandRow[] | null) || [];

    // Untouched rows only. Ranking a family the coach has already written to
    // is spending a model call to tell them something they did.
    const rankable = demand.filter((d) => !d.contact_status);

    if (rankable.length < MIN_TO_RANK) {
      return NextResponse.json({ suggestions: [] });
    }

    const [{ data: serviceRows }, { data: areaRows }, { data: placeRows }] = await Promise.all([
      supabaseServerAdmin
        .from("service_category_master")
        .select("id, name")
        .in("id", provider.service_category_ids || []),
      supabaseServerAdmin.from("provider_discoverable_areas").select("area_id").eq("provider_id", providerId),
      supabaseServerAdmin.from("teaching_place_master").select("id, label"),
    ]);

    const areaIds = (areaRows || []).map((a) => a.area_id);
    const { data: areaNames } = areaIds.length
      ? await supabaseServerAdmin.from("areas").select("name").in("id", areaIds)
      : { data: [] as { name: string }[] };

    const placeLabel = new Map((placeRows || []).map((p) => [p.id, p.label]));

    const coach: CoachContext = {
      displayName: provider.display_name || "This coach",
      providerType: provider.provider_type,
      teaches: (serviceRows || []).map((s) => s.name),
      areas: Array.from(new Set((areaNames || []).map((a) => a.name))),
      teachingPlaces: (provider.teaching_places || []).map(
        (id: string) => placeLabel.get(id) || id
      ),
      experienceYears: provider.experience_years ?? null,
      feeMin: provider.fee_min ?? null,
      feeMax: provider.fee_max ?? null,
      feePeriod: provider.fee_period ?? null,
      helpStatement: provider.help_statement || "",
      bio: provider.bio || "",
      availability: provider.availability || [],
    };

    const context: DemandContext[] = rankable.map((d) => ({
      key: `${d.kind}:${d.id}`,
      kind: d.kind,
      wants: d.service_names || [],
      area: d.area_name,
      distance_km: d.distance_km,
      learner_age: d.learner_age,
      level: d.level,
      preferred_modes: (d.preferred_modes || []).map((id) => placeLabel.get(id) || id),
      preferred_days: d.preferred_days,
      preferred_time: d.preferred_time,
      budget_min: d.budget_min,
      budget_max: d.budget_max,
      budget_period: d.budget_period,
      notes: d.notes,
      students: d.student_count,
    }));

    const { result, usage } = await rankDemandForCoach(coach, context);

    await recordLlmUsage("rank_demand_for_coach", usage, providerId);

    return NextResponse.json({ suggestions: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't rank these right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
