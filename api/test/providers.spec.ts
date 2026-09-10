import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { ProvidersController } from "../src/providers/providers.controller";
import { ProvidersService, toProfile, toSearchResult } from "../src/providers/providers.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const AREA = "44444444-4444-4444-8444-444444444444";
const PROVIDER = "55555555-5555-4555-8555-555555555555";

/** A row exactly as search_providers() returns it. */
const searchRow = {
  id: PROVIDER,
  display_name: "Krishna Sports Academy",
  bio: "Cricket and athletics.",
  provider_type: "institution",
  provider_category_id: "66666666-6666-4666-8666-666666666666",
  photo_url: null,
  is_featured: false,
  service_category_ids: ["77777777-7777-4777-8777-777777777777"],
  nearest_area_id: AREA,
  nearest_area_name: "Indirapuram",
  city_name: "Ghaziabad",
  // ST_Distance comes back as a double; PostgREST can still hand it over as a
  // string. The mapper has to cope with either.
  distance_km: "2.4" as unknown as number,
};

/** The jsonb get_provider_profile() builds, nested objects and all. */
const profileJson = {
  id: PROVIDER,
  display_name: "Krishna Sports Academy",
  bio: "Cricket and athletics.",
  help_statement: "Beginners welcome.",
  provider_type: "institution",
  photo_url: null,
  is_featured: false,
  age: null,
  experience_years: 12,
  fee_min: "1500.00",
  fee_max: "3000.00",
  fee_period: "month",
  fees_note: null,
  teaching_places: ["own_centre"],
  certifications: [{ name: "NIS", issuer: "SAI", year: "2014" }],
  availability: [{ day: "mon", place: "own_centre", start: "16:00", end: "18:00" }],
  category_name: "Academy",
  services: [{ id: "77777777-7777-4777-8777-777777777777", name: "Cricket", group: "sport" }],
  branches: [
    { label: "Main", address: "Plot 4", area_name: "Indirapuram", city_name: "Ghaziabad" },
  ],
  service_areas: [{ area_name: "Vaishali", city_name: "Ghaziabad" }],
};

describe("provider row mapping", () => {
  it("converts a search row to the contract's camelCase", () => {
    const row = toSearchResult(searchRow);
    expect(row.displayName).toBe("Krishna Sports Academy");
    expect(row.providerType).toBe("institution");
    expect(row.nearestAreaName).toBe("Indirapuram");
    expect(row.serviceCategoryIds).toEqual(["77777777-7777-4777-8777-777777777777"]);
  });

  it("coerces a distance that arrived as a string", () => {
    expect(toSearchResult(searchRow).distanceKm).toBe(2.4);
    expect(typeof toSearchResult(searchRow).distanceKm).toBe("number");
  });

  it("keeps a null distance null rather than turning it into zero", () => {
    // No origin means no radius, and zero would read as "right here".
    expect(toSearchResult({ ...searchRow, distance_km: null }).distanceKm).toBeNull();
  });

  it("defaults a null service list to an empty array", () => {
    expect(toSearchResult({ ...searchRow, service_category_ids: null }).serviceCategoryIds).toEqual(
      [],
    );
  });

  it("maps the profile, nested objects included", () => {
    const profile = toProfile(profileJson);
    expect(profile.helpStatement).toBe("Beginners welcome.");
    expect(profile.branches[0].areaName).toBe("Indirapuram");
    expect(profile.serviceAreas[0].cityName).toBe("Ghaziabad");
    expect(profile.services[0].group).toBe("sport");
    expect(profile.availability[0].start).toBe("16:00");
    expect(profile.certifications[0].issuer).toBe("SAI");
  });

  it("coerces numeric fees, which PostgREST serialises as strings", () => {
    const profile = toProfile(profileJson);
    expect(profile.feeMin).toBe(1500);
    expect(profile.feeMax).toBe(3000);
    expect(typeof profile.feeMin).toBe("number");
  });

  it("survives a profile whose optional arrays are missing entirely", () => {
    const profile = toProfile({ id: PROVIDER, provider_type: "individual" });
    expect(profile.services).toEqual([]);
    expect(profile.branches).toEqual([]);
    expect(profile.teachingPlaces).toEqual([]);
    expect(profile.feeMin).toBeNull();
  });
});

describe("GET /api/v1/providers", () => {
  let app: INestApplication;
  const rpc = jest.fn();

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ rpc }) as never,
      asUser: () => ({ rpc }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProvidersController],
      providers: [
        ProvidersService,
        Reflector,
        { provide: SupabaseService, useValue: supabase },
      ],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabase)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => rpc.mockReset());

  it("searches without a token, because a family looks before it joins", async () => {
    rpc.mockResolvedValue({ data: [searchRow], error: null });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/providers/search?areaId=${AREA}&radiusKm=10`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].distanceKm).toBe(2.4);
    expect(rpc).toHaveBeenCalledWith(
      "search_providers",
      expect.objectContaining({ p_area_id: AREA, p_radius_km: 10 }),
    );
  });

  it("applies the documented defaults when nothing is asked for", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await request(app.getHttpServer()).get("/api/v1/providers/search").expect(200);

    expect(rpc).toHaveBeenCalledWith(
      "search_providers",
      expect.objectContaining({ p_radius_km: 15, p_limit: 50 }),
    );
  });

  it("reads /search as the route and not as a coach id", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await request(app.getHttpServer()).get("/api/v1/providers/search").expect(200);
    expect(rpc).toHaveBeenCalledWith("search_providers", expect.anything());
  });

  it("rejects an undeclared query parameter", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/providers/search?orderBy=fee")
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a radius beyond the documented maximum", async () => {
    await request(app.getHttpServer()).get("/api/v1/providers/search?radiusKm=5000").expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an areaId that is not a uuid before touching the database", async () => {
    await request(app.getHttpServer()).get("/api/v1/providers/search?areaId=nope").expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serves a profile without a token", async () => {
    rpc.mockResolvedValue({ data: profileJson, error: null });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/providers/${PROVIDER}`)
      .expect(200);

    expect(res.body.displayName).toBe("Krishna Sports Academy");
    expect(rpc).toHaveBeenCalledWith("get_provider_profile", { p_id: PROVIDER });
  });

  it("turns an invisible coach into a 404, not an empty body", async () => {
    // The function returns null for unapproved, suspended and event-planner
    // rows alike. A stranger must not be able to tell those apart from an id
    // that was never real.
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/providers/${PROVIDER}`)
      .expect(404);

    expect(res.body.message).toBe("No such coach.");
  });

  it("rejects a coach id that is not a uuid", async () => {
    await request(app.getHttpServer()).get("/api/v1/providers/not-a-uuid").expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
