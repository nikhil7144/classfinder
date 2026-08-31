import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

const ROLES = ["seeker", "provider"] as const;
type SwitchableRole = (typeof ROLES)[number];

// Switching is only allowed while the profile is still incomplete — at that
// point nothing has been published, so there is nothing to lose. Once a
// profile is complete the listing, branches and approval state are real, and
// switching would silently destroy them.
//
// Enforced here rather than in the client so it holds regardless of what the
// browser sends.
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseServerAuth.auth.getUser(token);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.user.id;
  const { role } = await request.json();

  if (!ROLES.includes(role as SwitchableRole)) {
    return NextResponse.json({ error: "Choose either seeker or provider." }, { status: 400 });
  }

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("role, profile_complete")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "No profile to switch." }, { status: 400 });
  }

  if (profile.role === "admin") {
    return NextResponse.json({ error: "Admin accounts cannot change type." }, { status: 400 });
  }

  if (profile.profile_complete) {
    return NextResponse.json(
      { error: "Your profile is already complete, so the account type can't be changed. Contact support if this is wrong." },
      { status: 400 }
    );
  }

  if (profile.role === role) {
    return NextResponse.json({ success: true, role });
  }

  // Drop the half-finished row for the role being left. branches and
  // provider_service_areas cascade off providers, so they go with it.
  const staleTable = profile.role === "provider" ? "providers" : "seekers";
  const { error: cleanupError } = await supabaseServerAdmin
    .from(staleTable)
    .delete()
    .eq("user_id", userId);

  if (cleanupError) {
    return NextResponse.json({ error: cleanupError.message }, { status: 400 });
  }

  const { error: updateError } = await supabaseServerAdmin
    .from("profiles")
    .update({ role, profile_complete: false })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, role });
}
