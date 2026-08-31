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

    const canRejectAsVeteran =
      !!veteran && requestRow.veteran_id === veteran.id && requestRow.initiated_by === "startup";
    const canRejectAsStartup =
      !!startup && requestRow.startup_id === startup.id && requestRow.initiated_by === "veteran";

    if (!canRejectAsVeteran && !canRejectAsStartup) {
      return NextResponse.json({ error: "You are not allowed to reject this request." }, { status: 403 });
    }

    if (requestRow.status === "rejected") {
      return NextResponse.json({ success: true, alreadyRejected: true });
    }

    const { error } = await supabaseServerAdmin
      .from("association_requests")
      .update({ status: "rejected" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to reject request." }, { status: 500 });
  }
}
