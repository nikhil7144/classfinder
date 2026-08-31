import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";
import { classifyFounderProblem, recordLlmUsage } from "@/lib/gemini";

type VeteranReview = { rating: number };

type VeteranRow = {
  id: string;
  name?: string | null;
  headline?: string | null;
  experience_years?: number | null;
  expertise_ids?: string[] | null;
  association_type?: string | null;
  industries?: string[] | null;
  photo_url?: string | null;
  past_companies?: { company: string; years: string }[] | null;
  pricing_model?: unknown;
  function_ids?: string[] | null;
  stage_ids?: string[] | null;
  function_proof?: { function_id: string; proof: string }[] | null;
  veteran_reviews?: VeteranReview[] | null;
};

async function getAuthorizedStartup(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) return null;

  const { data, error } = await supabaseServerAuth.auth.getUser(token);

  if (error || !data.user) return null;

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if ((profile?.role || "").toLowerCase() !== "startup") {
    return null;
  }

  return data.user;
}

const FUNCTION_MATCH_SCORE = 100;
const STAGE_SAME_SCORE = 40;
const STAGE_ADJACENT_SCORE = 20;
const INDUSTRY_MATCH_SCORE = 15;
const MAX_RESULTS = 20;

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedStartup(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { problem } = await request.json();
    if (typeof problem !== "string" || !problem.trim()) {
      return NextResponse.json({ error: "Describe your problem first." }, { status: 400 });
    }

    const { data: startup, error: startupError } = await supabaseServerAdmin
      .from("startups")
      .select("id, stage_id, industry_ids")
      .eq("user_id", user.id)
      .maybeSingle();

    if (startupError) {
      return NextResponse.json({ error: startupError.message }, { status: 400 });
    }
    if (!startup) {
      return NextResponse.json(
        { error: "Complete your startup profile first before matching with experts." },
        { status: 403 }
      );
    }

    const [
      { data: functionMaster, error: functionError },
      { data: allStages, error: stagesError },
      { data: industryMaster, error: industryError },
    ] = await Promise.all([
      supabaseServerAdmin.from("function_master").select("id, name").eq("is_active", true),
      supabaseServerAdmin.from("startup_stages").select("id, name, order_index"),
      supabaseServerAdmin.from("industry_master").select("id, name"),
    ]);

    if (functionError) return NextResponse.json({ error: functionError.message }, { status: 400 });
    if (stagesError) return NextResponse.json({ error: stagesError.message }, { status: 400 });
    if (industryError) return NextResponse.json({ error: industryError.message }, { status: 400 });

    const stageOrderById = new Map((allStages || []).map((s) => [s.id, s.order_index]));
    const founderStageOrder = startup.stage_id ? stageOrderById.get(startup.stage_id) ?? null : null;
    const founderStageName =
      (allStages || []).find((s) => s.id === startup.stage_id)?.name || "unknown";

    // veterans.industries stores industry NAMES, startups.industry_ids stores
    // industry IDS — resolve the founder's ids to names before comparing.
    const industryNameById = new Map((industryMaster || []).map((i) => [i.id, i.name]));
    const founderIndustryNames = new Set(
      (startup.industry_ids || [])
        .map((id: string) => industryNameById.get(id))
        .filter((name: string | undefined): name is string => Boolean(name))
    );

    const { result: classification, usage } = await classifyFounderProblem(
      { problem: problem.trim(), companyStageName: founderStageName },
      { functions: functionMaster || [] }
    );

    await recordLlmUsage("classify_founder_problem", usage, startup.id);

    await supabaseServerAdmin.from("founder_problems").insert({
      startup_id: startup.id,
      problem_text: problem.trim(),
      function_id: classification.functionId,
      confidence: classification.confidence,
    });

    const { data: veteransData, error: veteransError } = await supabaseServerAdmin
      .from("veterans")
      .select("*, veteran_reviews ( rating )")
      .eq("approved", true);

    if (veteransError) {
      return NextResponse.json({ error: veteransError.message }, { status: 400 });
    }

    const expertiseIds = new Set(
      ((veteransData as VeteranRow[] | null) || []).flatMap((v) => v.expertise_ids || [])
    );
    const { data: expertiseMaster } = expertiseIds.size
      ? await supabaseServerAdmin.from("expertise_master").select("id, name").in("id", [...expertiseIds])
      : { data: [] as { id: string; name: string }[] };
    const expertiseNameById = new Map((expertiseMaster || []).map((e) => [e.id, e.name]));

    const scored = ((veteransData as VeteranRow[] | null) || []).map((veteran) => {
      const ratings = veteran.veteran_reviews?.map((r) => r.rating) || [];
      const ratingCount = ratings.length;
      const rating = ratingCount > 0 ? ratings.reduce((sum, v) => sum + v, 0) / ratingCount : 0;

      const matchedFunction = (veteran.function_ids || []).includes(classification.functionId);
      const functionScore = matchedFunction ? FUNCTION_MATCH_SCORE : 0;

      let stageScore = 0;
      if (founderStageOrder !== null && veteran.stage_ids?.length) {
        const distances = veteran.stage_ids
          .map((id) => stageOrderById.get(id))
          .filter((order): order is number => typeof order === "number")
          .map((order) => Math.abs(order - founderStageOrder));
        const minDistance = distances.length ? Math.min(...distances) : null;
        if (minDistance === 0) stageScore = STAGE_SAME_SCORE;
        else if (minDistance === 1) stageScore = STAGE_ADJACENT_SCORE;
      }

      const industryScore = (veteran.industries || []).some((name) => founderIndustryNames.has(name))
        ? INDUSTRY_MATCH_SCORE
        : 0;

      const proofLine = matchedFunction
        ? veteran.function_proof?.find((p) => p.function_id === classification.functionId)?.proof
        : undefined;

      return {
        ...veteran,
        expertise_names:
          veteran.expertise_ids?.map((id) => expertiseNameById.get(id)).filter(Boolean) || [],
        rating,
        rating_count: ratingCount,
        matchScore: functionScore + stageScore + industryScore,
        matchedFunctionName: matchedFunction ? classification.functionName : null,
        matchedFunctionProof: proofLine || null,
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      classification,
      veterans: scored.slice(0, MAX_RESULTS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to match experts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
