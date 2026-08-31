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

type ProfileRow = {
  id: string;
  role: string | null;
  profile_complete: boolean | null;
};

type StartupRow = {
  id: string;
};

type VeteranRow = {
  id: string;
  approved?: boolean | null;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthorizedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { veteranId, startupId, message, problemId } = await request.json();

    const { data: profile, error: profileError } = await supabaseServerAdmin
      .from("profiles")
      .select("id, role, profile_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const currentProfile = profile as ProfileRow | null;

    const { data: startup, error: startupError } = await supabaseServerAdmin
      .from("startups")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (startupError) {
      return NextResponse.json({ error: startupError.message }, { status: 400 });
    }

    const { data: veteran, error: veteranError } = await supabaseServerAdmin
      .from("veterans")
      .select("id, approved")
      .eq("user_id", user.id)
      .maybeSingle();

    if (veteranError) {
      return NextResponse.json({ error: veteranError.message }, { status: 400 });
    }

    const startupRecord = startup as StartupRow | null;
    const veteranRecord = veteran as VeteranRow | null;

    if (!currentProfile?.profile_complete) {
      return NextResponse.json(
        { error: "Complete your profile first before sending association requests." },
        { status: 403 }
      );
    }

    if (currentProfile?.role === "veteran" && !veteranRecord) {
      return NextResponse.json(
        { error: "Complete your industry expert profile first before sending association requests." },
        { status: 403 }
      );
    }

    if (currentProfile?.role === "startup" && !startupRecord) {
      return NextResponse.json(
        { error: "Complete your startup profile first before sending association requests." },
        { status: 403 }
      );
    }

    if (currentProfile?.role === "veteran" && veteranRecord?.approved !== true) {
      return NextResponse.json(
        { error: "Your industry expert profile must be approved before you can send association requests." },
        { status: 403 }
      );
    }

    let sourceStartupId = startupRecord?.id || null;
    let sourceVeteranId = veteranRecord?.id || null;
    let initiator: "startup" | "veteran" | null = null;

    if (startupRecord && veteranId) {
      initiator = "startup";
      sourceVeteranId = veteranId;
    } else if (veteranRecord && startupId) {
      initiator = "veteran";
      sourceStartupId = startupId;
    } else {
      return NextResponse.json(
        { error: "A valid startup or industry expert association request target is required." },
        { status: 400 }
      );
    }

    if (!sourceStartupId || !sourceVeteranId || !initiator) {
      return NextResponse.json({ error: "Unable to resolve association participants." }, { status: 400 });
    }

    const { data: existingRequest, error: existingRequestError } = await supabaseServerAdmin
      .from("association_requests")
      .select("id,status")
      .eq("startup_id", sourceStartupId)
      .eq("veteran_id", sourceVeteranId)
      .maybeSingle();

    if (existingRequestError) {
      return NextResponse.json({ error: existingRequestError.message }, { status: 400 });
    }

    if (existingRequest?.status === "pending") {
      return NextResponse.json({ error: "Association request already pending." }, { status: 409 });
    }

    if (existingRequest?.status === "accepted") {
      return NextResponse.json({ error: "Association already exists." }, { status: 409 });
    }

    if (existingRequest) {
      const { error: updateError } = await supabaseServerAdmin
        .from("association_requests")
        .update({
          status: "pending",
          message: message || "",
          initiated_by: initiator,
          problem_id: problemId || null,
        })
        .eq("id", existingRequest.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, reused: true });
    }

    const { error } = await supabaseServerAdmin.from("association_requests").insert({
      startup_id: sourceStartupId,
      veteran_id: sourceVeteranId,
      status: "pending",
      message: message || "",
      initiated_by: initiator,
      problem_id: problemId || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to send request." }, { status: 500 });
  }
}
