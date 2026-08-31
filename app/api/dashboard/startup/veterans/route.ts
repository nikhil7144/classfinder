import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

type VeteranReview = {
  rating: number;
};

type VeteranDashboardCard = {
  id: string;
  name?: string | null;
  headline?: string | null;
  rating?: number;
  rating_count?: number;
  experience_years?: number | null;
  expertise_ids?: string[] | null;
  association_type?: "consulting" | "equity" | "hybrid" | null;
  expertise?: string[] | null;
  expertise_names?: string[] | null;
  industries?: string[] | null;
  photo_url?: string | null;
  past_companies?: { company: string; years: string }[] | null;
  pricing_model?: {
    consulting?: {
      one_hour?: string | null;
      roadmap?: string | null;
      market_fit?: string | null;
      product_dev?: string | null;
    } | null;
    equity?: {
      minimum_percent?: string | null;
      duration_months?: string | null;
    } | null;
    hybrid?: {
      details?: string | null;
    } | null;
  } | null;
  availability_schedule?: unknown;
  veteran_reviews?: VeteranReview[] | null;
};

type ExpertiseMasterRow = {
  id: string;
  name: string;
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

export async function GET(request: Request) {
  try {
    const user = await getAuthorizedStartup(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const selectedExpertise = searchParams.get("expertise");
    const selectedIndustry = searchParams.get("industry");
    const selectedAssociation = searchParams.get("association");
    const selectedExperience = Number(searchParams.get("experience") || "");
    const minimumExperience = Number.isFinite(selectedExperience) ? selectedExperience : null;

    const [{ data: expertiseMaster, error: expertiseError }, { data: expertiseRecord, error: expertiseRecordError }] =
      await Promise.all([
        supabaseServerAdmin.from("expertise_master").select("id,name"),
        selectedExpertise
          ? supabaseServerAdmin
              .from("expertise_master")
              .select("id")
              .eq("name", selectedExpertise)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (expertiseError || expertiseRecordError) {
      return NextResponse.json(
        {
          error:
            expertiseError?.message ||
            expertiseRecordError?.message ||
            "Unable to load industry experts.",
        },
        { status: 400 }
      );
    }

    const expertiseMap = new Map(
      ((expertiseMaster as ExpertiseMasterRow[] | null) || []).map((item) => [item.id, item.name])
    );

    let veteransQuery = supabaseServerAdmin
      .from("veterans")
      .select(
        `
          *,
          veteran_reviews ( rating )
        `
      )
      .eq("approved", true)
      .order("name");

    if (selectedIndustry) {
      veteransQuery = veteransQuery.contains("industries", [selectedIndustry]);
    }

    if (selectedAssociation) {
      veteransQuery = veteransQuery.eq("association_type", selectedAssociation);
    }

    if (minimumExperience) {
      veteransQuery = veteransQuery.gte("experience_years", minimumExperience);
    }

    if (selectedExpertise) {
      if (!expertiseRecord?.id) {
        return NextResponse.json({ veterans: [] });
      }

      veteransQuery = veteransQuery.contains("expertise_ids", [expertiseRecord.id]);
    }

    const { data: veteransData, error: veteransError } = await veteransQuery;

    if (veteransError) {
      return NextResponse.json({ error: veteransError.message }, { status: 400 });
    }

    const veterans = ((veteransData as VeteranDashboardCard[] | null) || []).map((veteran) => {
      const ratings = veteran.veteran_reviews?.map((review) => review.rating) || [];
      const ratingCount = ratings.length;
      const rating =
        ratingCount > 0
          ? ratings.reduce((total, value) => total + value, 0) / ratingCount
          : 0;

      return {
        ...veteran,
        expertise_names:
          veteran.expertise_ids
            ?.map((id) => expertiseMap.get(id))
            .filter((value): value is string => Boolean(value)) || [],
        rating,
        rating_count: ratingCount,
      };
    });

    return NextResponse.json({ veterans });
  } catch {
    return NextResponse.json({ error: "Unable to load industry experts." }, { status: 500 });
  }
}
