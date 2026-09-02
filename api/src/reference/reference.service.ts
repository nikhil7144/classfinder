import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { ReferenceDto } from "./dto/reference.dto";

/**
 * How long the process holds the answer before asking again.
 *
 * Reference data changes when an admin edits the taxonomy or opens an area —
 * rare, and never urgent. A few minutes of staleness costs a new area showing
 * up slightly late; asking Postgres for 176 service categories on every page
 * load costs that on every page load.
 */
const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ReferenceService {
  private cached: { at: number; value: ReferenceDto } | null = null;
  private inFlight: Promise<ReferenceDto> | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async all(): Promise<ReferenceDto> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS) return this.cached.value;

    // One request per expiry, not one per caller. Without this, a cold start
    // under load sends every simultaneous request to Postgres at once —
    // exactly when it can least afford them.
    if (!this.inFlight) {
      this.inFlight = this.load().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async load(): Promise<ReferenceDto> {
    const db = this.supabase.anon();

    const [cities, areas, services, providerCategories, places] = await Promise.all([
      db.from("cities").select("id, name, state").eq("is_active", true).order("name"),
      // Every defined area, live or not, with the flag alongside. is_live
      // gates seekers only — a provider may register in an area that has not
      // opened yet — so filtering here would break the provider signup form.
      db.from("areas").select("id, city_id, name, lat, lng, is_live").order("name"),
      db.from("service_category_master").select('id, name, "group"').eq("is_active", true).order("name"),
      db.from("provider_category_master").select("id, name, provider_type").eq("is_active", true).order("name"),
      db.from("teaching_place_master").select("id, label, description, sort_order").eq("is_active", true).order("sort_order"),
    ]);

    const failed = [cities, areas, services, providerCategories, places].find((r) => r.error);
    if (failed?.error) throw new InternalServerErrorException(failed.error.message);

    const value: ReferenceDto = {
      cities: (cities.data ?? []).map((c) => ({ id: c.id, name: c.name, state: c.state })),
      areas: (areas.data ?? []).map((a) => ({
        id: a.id,
        cityId: a.city_id,
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        isLive: a.is_live,
      })),
      serviceCategories: (services.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        group: s.group,
      })),
      providerCategories: (providerCategories.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        providerType: p.provider_type,
      })),
      teachingPlaces: (places.data ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        sortOrder: p.sort_order,
      })),
    };

    this.cached = { at: Date.now(), value };
    return value;
  }

  /** Drops the cache, for an admin who has just changed the taxonomy. */
  invalidate(): void {
    this.cached = null;
  }
}
