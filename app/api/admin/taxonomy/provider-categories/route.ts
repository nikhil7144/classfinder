import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

async function getAuthorizedAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) return null;

  const { data, error } = await supabaseServerAuth.auth.getUser(token);

  if (error || !data.user) return null;

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;

  return data.user;
}

// Reads go straight through the browser's anon-key client — RLS already
// allows public read on this table, no server route needed for that.
// Only writes (admin-only) go through this route, since RLS blocks
// anon-key writes here.
export async function POST(request: Request) {
  const adminUser = await getAuthorizedAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, providerType } = await request.json();

  if (!name || !providerType) {
    return NextResponse.json({ error: "Name and provider type are required." }, { status: 400 });
  }

  const { error } = await supabaseServerAdmin
    .from("provider_category_master")
    .insert({ name, provider_type: providerType });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const adminUser = await getAuthorizedAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, isActive } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const { error } = await supabaseServerAdmin
    .from("provider_category_master")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
