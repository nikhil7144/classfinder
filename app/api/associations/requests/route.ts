import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

async function getAuthorizedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) return null;

  const { data, error } = await supabaseServerAuth.auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthorizedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "startup") {
      const { data: startup, error: startupError } = await supabaseServerAdmin
        .from("startups")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (startupError) {
        return NextResponse.json({ error: startupError.message }, { status: 400 });
      }

      if (!startup) {
        return NextResponse.json({ requests: [] });
      }

      const { data, error } = await supabaseServerAdmin
        .from("association_requests")
        .select("*, veterans(name, photo_url, headline), founder_problems(problem_text)")
        .eq("startup_id", startup.id)
        .eq("initiated_by", "veteran")
        .or("status.eq.pending,status.is.null")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ requests: data || [] });
    }

    if (view === "veteran") {
      const { data: veteran, error: veteranError } = await supabaseServerAdmin
        .from("veterans")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (veteranError) {
        return NextResponse.json({ error: veteranError.message }, { status: 400 });
      }

      if (!veteran) {
        return NextResponse.json({ requests: [] });
      }

      const { data, error } = await supabaseServerAdmin
        .from("association_requests")
        .select("*, startups(startup_name)")
        .eq("veteran_id", veteran.id)
        .eq("initiated_by", "startup")
        .or("status.eq.pending,status.is.null")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ requests: data || [] });
    }

    return NextResponse.json({ error: "Invalid requests view." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unable to load requests." }, { status: 500 });
  }
}
