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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: veteran, error: veteranError } = await supabaseServerAdmin
      .from("veterans")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (veteranError) {
      return NextResponse.json({ error: veteranError.message }, { status: 400 });
    }

    const { data: startup, error: startupError } = await supabaseServerAdmin
      .from("startups")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (startupError) {
      return NextResponse.json({ error: startupError.message }, { status: 400 });
    }

    if (!veteran && !startup) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const { data: requestRow, error: requestError } = await supabaseServerAdmin
      .from("association_requests")
      .select("id,startup_id,veteran_id,initiated_by,status")
      .eq("id", id)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json({ error: requestError.message }, { status: 400 });
    }

    if (!requestRow) {
      return NextResponse.json({ error: "Association request not found." }, { status: 404 });
    }

    const canAcceptAsVeteran =
      !!veteran && requestRow.veteran_id === veteran.id && requestRow.initiated_by === "startup";
    const canAcceptAsStartup =
      !!startup && requestRow.startup_id === startup.id && requestRow.initiated_by === "veteran";

    if (!canAcceptAsVeteran && !canAcceptAsStartup) {
      return NextResponse.json({ error: "You are not allowed to accept this request." }, { status: 403 });
    }

    if (requestRow.status === "accepted") {
      return NextResponse.json({ success: true, alreadyAccepted: true });
    }

    const { error: updateError } = await supabaseServerAdmin
      .from("association_requests")
      .update({ status: "accepted" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseServerAdmin
      .from("associations")
      .select("id")
      .eq("startup_id", requestRow.startup_id)
      .eq("veteran_id", requestRow.veteran_id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      const { error: associationError } = await supabaseServerAdmin
        .from("associations")
        .insert({
          startup_id: requestRow.startup_id,
          veteran_id: requestRow.veteran_id,
          association_type: "consulting",
          title: "Advisory Association",
          active: true,
        });

      if (associationError) {
        return NextResponse.json({ error: associationError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to accept request." }, { status: 500 });
  }
}
