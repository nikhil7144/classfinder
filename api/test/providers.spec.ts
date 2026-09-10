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
  help_statement: "Beginners welcome.",
  provider_type: "institution",
  provider_category_id: "66666666-6666-4666-8666-666666666666",
  photo_url: null,
  is_featured: false,
  service_category_ids: ["77777777-7777-4777-8777-777777777777"],
  experience_years: 12,
  // numeric over PostgREST, same as the profile's fees.
  fee_min: "1500.00" as unknown as number,
  fee_max: "3000.00" as unknown as number,
  fee_period: "per_month",
  teaching_places: ["own_centre"],
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

  it("carries every column phase1f added, not just phase1e's twelve", () => {
    // search_providers was redefined once and grew six columns. The cards on
    // the search page render fees and experience, so dropping them here would
    // quietly empty half of each result.
    const row = toSearchResult(searchRow);
    expect(row.helpStatement).toBe("Beginners welcome.");
    expect(row.experienceYears).toBe(12);
    expect(row.feeMin).toBe(1500);
    expect(row.feeMax).toBe(3000);
    expect(row.feePeriod).toBe("per_month");
    expect(row.teachingPlaces).toEqual(["own_centre"]);
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
  const from = jest.fn();

  beforeAll(async () => {
    const client = { rpc, from };
    const supabase: Partial<SupabaseService> = {
      anon: () => client as never,
      asUser: () => client as never,
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
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  const query = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain);
    chain.single = jest.fn(async () => result);
    return chain;
  };

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

  describe("PUT /me", () => {
    const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

    const listing = {
      providerType: "individual",
      displayName: "Krishna",
      serviceAreaIds: [AREA],
      serviceCategoryIds: ["77777777-7777-4777-8777-777777777777"],
    };

    it("saves in one call and answers with the owner's own row", async () => {
      rpc.mockResolvedValue({ data: PROVIDER, error: null });
      from.mockReturnValue(
        query({ data: { id: PROVIDER, approved: false, is_suspended: false }, error: null }),
      );

      const res = await auth(
        request(app.getHttpServer()).put("/api/v1/providers/me").send(listing),
      ).expect(200);

      // A first save is unapproved, and get_provider_profile() answers null
      // for that — reading it back through the public path would 404 the thing
      // that just succeeded. The owner's row says so instead.
      expect(res.body).toEqual({ id: PROVIDER, approved: false, isSuspended: false });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("save_provider_profile", expect.anything());
    });

    it("sends the whole listing as one snake_cased payload", async () => {
      rpc.mockResolvedValue({ data: PROVIDER, error: null });
      from.mockReturnValue(
        query({ data: { id: PROVIDER, approved: true, is_suspended: false }, error: null }),
      );

      await auth(
        request(app.getHttpServer())
          .put("/api/v1/providers/me")
          .send({ ...listing, branches: [{ areaId: AREA, label: "Main" }] }),
      ).expect(200);

      const payload = rpc.mock.calls[0][1].p_profile;
      expect(payload.provider_type).toBe("individual");
      expect(payload.display_name).toBe("Krishna");
      expect(payload.service_area_ids).toEqual([AREA]);
      expect(payload.branches[0].area_id).toBe(AREA);
      // approved is the function's decision and is never sent.
      expect("approved" in payload).toBe(false);
    });

    it("refuses to let a caller set their own approval", async () => {
      await auth(
        request(app.getHttpServer())
          .put("/api/v1/providers/me")
          .send({ ...listing, approved: true }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer()).put("/api/v1/providers/me").send(listing).expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a provider type that is not one of the three", async () => {
      await auth(
        request(app.getHttpServer())
          .put("/api/v1/providers/me")
          .send({ ...listing, providerType: "wizard" }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a branch with no area, because that is what makes it findable", async () => {
      await auth(
        request(app.getHttpServer())
          .put("/api/v1/providers/me")
          .send({ ...listing, providerType: "institution", branches: [{ label: "Main" }] }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("turns the function's own sentence into a 400, not a 500", async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", message: "Choose what kind of provider this is." },
      });

      const res = await auth(
        request(app.getHttpServer()).put("/api/v1/providers/me").send(listing),
      ).expect(400);

      expect(res.body.message).toBe("Choose what kind of provider this is.");
    });
  });
});
