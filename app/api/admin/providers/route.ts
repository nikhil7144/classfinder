import { NextResponse } from "next/server";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";

// Admin reads AND writes for providers must come through here.
//
// RLS exposes providers publicly only when approved and unsuspended, and
// permits updates only by the owning provider. An admin is neither, so the
// admin screens reading through the browser's anon client saw zero rows and
// their approve/suspend updates matched nothing — returning 200 while changing
// nothing, which looked like success.
async function requireAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseServerAuth.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return profile?.role === "admin" ? data.user : null;
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    const { data: provider, error } = await supabaseServerAdmin
      .from("providers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [{ data: category }, { data: services }, { data: branches }, { data: areaLinks }] =
      await Promise.all([
        provider.provider_category_id
          ? supabaseServerAdmin
              .from("provider_category_master")
              .select("name")
              .eq("id", provider.provider_category_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        provider.service_category_ids?.length
          ? supabaseServerAdmin
              .from("service_category_master")
              .select("name")
              .in("id", provider.service_category_ids)
          : Promise.resolve({ data: [] }),
        supabaseServerAdmin.from("branches").select("*").eq("provider_id", provider.id),
        supabaseServerAdmin
          .from("provider_service_areas")
          .select("area_id")
          .eq("provider_id", provider.id),
      ]);

    const areaIds = [
      ...((areaLinks as { area_id: string }[]) || []).map((a) => a.area_id),
      ...((branches as { area_id: string | null }[]) || []).map((b) => b.area_id).filter(Boolean),
    ] as string[];

    const { data: areas } = areaIds.length
      ? await supabaseServerAdmin.from("areas").select("id, name").in("id", areaIds)
      : { data: [] };

    return NextResponse.json({
      provider,
      categoryName: category?.name ?? null,
      serviceNames: ((services as { name: string }[]) || []).map((s) => s.name),
      branches: branches || [],
      areaNames: ((areas as { name: string }[]) || []).map((a) => a.name),
    });
  }

  // The list exists to action what is waiting, so pending sorts to the top.
  const { data, error } = await supabaseServerAdmin
    .from("providers")
    .select("id, display_name, provider_type, city, approved, is_suspended, is_featured, created_at")
    .order("approved")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ providers: data || [] });
}

const ALLOWED = ["approved", "is_suspended", "is_featured"] as const;

export async function PATCH(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const updates: Record<string, boolean> = {};
  for (const field of ALLOWED) {
    if (typeof body[field] === "boolean") updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseServerAdmin
    .from("providers")
    .update(updates)
    .eq("id", id)
    .select("id, approved, is_suspended, is_featured")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

  return NextResponse.json({ provider: data });
}
