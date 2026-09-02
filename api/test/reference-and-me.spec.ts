import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { MeController } from "../src/me/me.controller";
import { MeService } from "../src/me/me.service";
import { ReferenceController } from "../src/reference/reference.controller";
import { ReferenceService } from "../src/reference/reference.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const ROWS: Record<string, unknown[]> = {
  cities: [{ id: "c1", name: "Indore", state: "Madhya Pradesh" }],
  areas: [
    { id: "a1", city_id: "c1", name: "Vijay Nagar", lat: 22.7, lng: 75.9, is_live: true },
    { id: "a2", city_id: "c1", name: "Not Open Yet", lat: null, lng: null, is_live: false },
  ],
  service_category_master: [{ id: "s1", name: "Kathak", group: "dance" }],
  provider_category_master: [{ id: "p1", name: "Dance Teacher", provider_type: "individual" }],
  teaching_place_master: [
    { id: "individual_classes", label: "One-to-one", description: null, sort_order: 1 },
  ],
};

describe("GET /api/v1/reference", () => {
  let app: INestApplication;
  const from = jest.fn();

  const builder = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ from }) as never,
      userFromToken: async () => null,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReferenceController],
      providers: [ReferenceService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
    from.mockImplementation((table: string) => builder(ROWS[table] ?? []));
  });

  afterAll(async () => app.close());

  it("serves without a token, and maps to the contract's names", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/reference").expect(200);

    expect(res.body.cities[0]).toEqual({ id: "c1", name: "Indore", state: "Madhya Pradesh" });
    expect(res.body.areas[0].cityId).toBe("c1");
    expect(res.body.teachingPlaces[0].sortOrder).toBe(1);
    expect(res.body.serviceCategories[0].group).toBe("dance");
  });

  it("returns areas that are not live, with the flag rather than omitting them", async () => {
    // is_live gates seekers only. A provider signing up must be able to pick
    // an area that has not opened, so filtering here would break signup.
    const res = await request(app.getHttpServer()).get("/api/v1/reference").expect(200);

    expect(res.body.areas).toHaveLength(2);
    expect(res.body.areas.map((a: { isLive: boolean }) => a.isLive)).toEqual([true, false]);
  });

  it("does not re-query while the cache is warm", async () => {
    from.mockClear();
    await request(app.getHttpServer()).get("/api/v1/reference").expect(200);
    await request(app.getHttpServer()).get("/api/v1/reference").expect(200);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/me", () => {
  let app: INestApplication;
  const from = jest.fn();

  const single = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data });
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [MeService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => from.mockReset());

  it("refuses without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/me").expect(401);
  });

  it("reports a verified account with no role as role: null, not an error", async () => {
    from.mockImplementation(() => single(null));

    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(res.body).toEqual({
      id: "user-1",
      role: null,
      profileComplete: false,
      phone: null,
    });
  });

  it("includes the seeker block for a seeker, and no provider block", async () => {
    from.mockImplementation((table: string) =>
      single(
        table === "profiles"
          ? { role: "seeker", profile_complete: true, phone: "99" }
          : { name: "A parent", photo_url: null, area_id: "a1", looking_for: ["s1"], open_to_offers: true },
      ),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(res.body.role).toBe("seeker");
    expect(res.body.seeker.lookingFor).toEqual(["s1"]);
    expect(res.body.provider).toBeUndefined();
  });

  it("distinguishes an unapproved provider from a suspended one", async () => {
    from.mockImplementation((table: string) =>
      single(
        table === "profiles"
          ? { role: "provider", profile_complete: true, phone: null }
          : {
              id: "prov-1",
              display_name: "Krishna",
              photo_url: null,
              provider_type: "individual",
              approved: false,
              is_suspended: true,
            },
      ),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(res.body.provider.approved).toBe(false);
    expect(res.body.provider.isSuspended).toBe(true);
    expect(res.body.seeker).toBeUndefined();
  });

  it("survives a role set but the role's row missing", async () => {
    from.mockImplementation((table: string) =>
      single(table === "profiles" ? { role: "seeker", profile_complete: false, phone: null } : null),
    );

    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(res.body.seeker).toBeNull();
  });
});
