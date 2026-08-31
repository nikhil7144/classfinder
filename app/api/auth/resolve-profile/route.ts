import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

// Called right after a successful email-OTP verification or Google OAuth
// callback. Supabase's auth events don't distinguish first-time sign-up
// from a returning login (both just fire SIGNED_IN) — this route is what
// makes that distinction, by checking whether a `profiles` row exists yet.
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseServerAuth.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseServerAdmin
      .from("profiles")
      .select("role, profile_complete")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    if (!profile) {
      return NextResponse.json({ isNew: true });
    }

    return NextResponse.json({
      isNew: false,
      role: profile.role,
      profileComplete: profile.profile_complete,
    });
  } catch {
    return NextResponse.json({ error: "Unable to resolve profile." }, { status: 500 });
  }
}
