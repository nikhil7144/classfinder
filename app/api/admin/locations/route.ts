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

/** Latitude/longitude must be real numbers in range, or explicitly absent. */
function parseCoordinate(value: unknown, kind: "lat" | "lng") {
  if (value === null || value === undefined || value === "") return { value: null as number | null };

  const parsed = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(parsed)) {
    return { error: `${kind === "lat" ? "Latitude" : "Longitude"} must be a number.` };
  }

  const limit = kind === "lat" ? 90 : 180;

  if (parsed < -limit || parsed > limit) {
    return { error: `${kind === "lat" ? "Latitude" : "Longitude"} must be between -${limit} and ${limit}.` };
  }

  return { value: parsed };
}

// Reads go through the browser's anon-key client (RLS allows public read on
// cities/areas). Writes come here because RLS has no insert/update policy for
// anon — only the service-role client may change reference data.
export async function POST(request: Request) {
  const adminUser = await getAuthorizedAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { entity } = body;

  if (entity === "city") {
    const name = String(body.name || "").trim();
    const state = String(body.state || "").trim();

    if (!name) {
      return NextResponse.json({ error: "City name is required." }, { status: 400 });
    }

    const { error } = await supabaseServerAdmin
      .from("cities")
      .insert({ name, state: state || null });

    if (error) {
      const message = error.code === "23505" ? "That city already exists." : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  if (entity === "area") {
    const cityId = body.cityId;
    const name = String(body.name || "").trim();

    if (!cityId || !name) {
      return NextResponse.json({ error: "City and area name are required." }, { status: 400 });
    }

    const lat = parseCoordinate(body.lat, "lat");
    const lng = parseCoordinate(body.lng, "lng");

    if (lat.error || lng.error) {
      return NextResponse.json({ error: lat.error || lng.error }, { status: 400 });
    }

    const { error } = await supabaseServerAdmin
      .from("areas")
      .insert({ city_id: cityId, name, lat: lat.value, lng: lng.value });

    if (error) {
      const message = error.code === "23505" ? "That area already exists in this city." : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const adminUser = await getAuthorizedAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { entity, id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  if (entity === "city") {
    const updates: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") updates.is_active = body.isActive;
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.state === "string") updates.state = body.state.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { error } = await supabaseServerAdmin.from("cities").update(updates).eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  }

  if (entity === "area") {
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();

    if ("lat" in body) {
      const lat = parseCoordinate(body.lat, "lat");
      if (lat.error) return NextResponse.json({ error: lat.error }, { status: 400 });
      updates.lat = lat.value;
    }

    if ("lng" in body) {
      const lng = parseCoordinate(body.lng, "lng");
      if (lng.error) return NextResponse.json({ error: lng.error }, { status: 400 });
      updates.lng = lng.value;
    }

    if (typeof body.isLive === "boolean") {
      // An area with no centroid can't rank results or act as a GPS fallback,
      // so going live without coordinates is refused rather than half-working.
      if (body.isLive) {
        const { data: area } = await supabaseServerAdmin
          .from("areas")
          .select("lat, lng")
          .eq("id", id)
          .maybeSingle();

        const nextLat = "lat" in updates ? updates.lat : area?.lat;
        const nextLng = "lng" in updates ? updates.lng : area?.lng;

        if (nextLat === null || nextLat === undefined || nextLng === null || nextLng === undefined) {
          return NextResponse.json(
            { error: "Add latitude and longitude before making this area live." },
            { status: 400 }
          );
        }
      }

      updates.is_live = body.isLive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { error } = await supabaseServerAdmin.from("areas").update(updates).eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const adminUser = await getAuthorizedAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entity, id } = await request.json();

  if (!id || (entity !== "city" && entity !== "area")) {
    return NextResponse.json({ error: "entity and id are required." }, { status: 400 });
  }

  if (entity === "area") {
    // Refuse to delete an area that providers or branches still point at —
    // deleting would silently remove them from search.
    const [{ count: serviceAreaCount }, { count: branchCount }] = await Promise.all([
      supabaseServerAdmin
        .from("provider_service_areas")
        .select("area_id", { count: "exact", head: true })
        .eq("area_id", id),
      supabaseServerAdmin
        .from("branches")
        .select("area_id", { count: "exact", head: true })
        .eq("area_id", id),
    ]);

    const inUse = (serviceAreaCount || 0) + (branchCount || 0);

    if (inUse > 0) {
      return NextResponse.json(
        { error: `${inUse} provider(s) or branch(es) still use this area. Turn it off instead of deleting.` },
        { status: 400 }
      );
    }

    const { error } = await supabaseServerAdmin.from("areas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  const { count: areaCount } = await supabaseServerAdmin
    .from("areas")
    .select("id", { count: "exact", head: true })
    .eq("city_id", id);

  if ((areaCount || 0) > 0) {
    return NextResponse.json(
      { error: `This city still has ${areaCount} area(s). Remove them first.` },
      { status: 400 }
    );
  }

  const { error } = await supabaseServerAdmin.from("cities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
