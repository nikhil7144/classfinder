import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

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

    const [{ data: expertiseMaster, error: expertiseError }, { data: industryMaster, error: industryError }] =
      await Promise.all([
        supabaseServerAdmin.from("expertise_master").select("name").order("name"),
        supabaseServerAdmin.from("industry_master").select("name").order("name"),
      ]);

    if (expertiseError || industryError) {
      return NextResponse.json(
        { error: expertiseError?.message || industryError?.message || "Unable to load filters." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      expertise: (expertiseMaster || []).map((item) => item.name).filter(Boolean),
      industries: (industryMaster || []).map((item) => item.name).filter(Boolean),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load filters." }, { status: 500 });
  }
}
