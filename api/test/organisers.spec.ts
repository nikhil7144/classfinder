import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { OrganisersController } from "../src/organisers/organisers.controller";
import { OrganisersService } from "../src/organisers/organisers.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Indore Sports Events",
  about: null,
  logo_url: null,
  contact_email: "hello@example.test",
  contact_phone: "9876543210",
  website_url: null,
  area_id: null,
  venue_name: "Nehru Stadium",
  venue_address: null,
  approved: false,
  is_suspended: false,
};

describe("/api/v1/organisers/me", () => {
  let app: INestApplication;
  const maybeSingle = jest.fn();
  const single = jest.fn();
  const insert = jest.fn();
  const update = jest.fn();

  // A query builder stub that records what was asked and resolves what the
  // test set. Chainable, because the service chains.
  const builder = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = maybeSingle;
    chain.single = single;
    chain.insert = (...args: unknown[]) => {
      insert(...args);
      return chain;
    };
    chain.update = (...args: unknown[]) => {
      update(...args);
      return chain;
    };
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from: builder }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrganisersController],
      providers: [OrganisersService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    maybeSingle.mockReset();
    single.mockReset();
    insert.mockReset();
    update.mockReset();
  });

  const auth = (r: request.Test) => r.set("Authorization", "Bearer good");

  it("refuses both verbs without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/organisers/me").expect(401);
    await request(app.getHttpServer()).put("/api/v1/organisers/me").send({}).expect(401);
  });

  it("returns null before a listing exists, rather than 404", async () => {
    // A role chosen and the form not filled in yet is an ordinary state the
    // client branches on, not an error it has to catch.
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/organisers/me")).expect(200);
    expect(res.body).toEqual({});
  });

  it("maps snake_case to the contract, unapproved included", async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/organisers/me")).expect(200);

    expect(res.body.venueName).toBe("Nehru Stadium");
    expect(res.body.contactEmail).toBe("hello@example.test");
    // Both reported: waiting on approval and being taken down are different
    // things and the dashboard says so differently.
    expect(res.body.approved).toBe(false);
    expect(res.body.isSuspended).toBe(false);
  });

  it("inserts when there is no listing, and stamps the caller as owner", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    single.mockResolvedValue({ data: ROW, error: null });

    await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ name: "Indore Sports Events" }),
    ).expect(200);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Indore Sports Events", user_id: "user-1" }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("updates when one already exists", async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    single.mockResolvedValue({ data: { ...ROW, venue_name: "New Ground" }, error: null });

    const res = await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ venueName: "New Ground" }),
    ).expect(200);

    expect(update).toHaveBeenCalledWith({ venue_name: "New Ground" });
    expect(insert).not.toHaveBeenCalled();
    expect(res.body.venueName).toBe("New Ground");
  });

  it("refuses an attempt to approve yourself", async () => {
    // Rejected by the DTO before any query. phase3e's column grant would
    // refuse it too — two layers, deliberately.
    await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ approved: true }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a privilege error from Postgres as a refusal, not a fault", async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    single.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });

    await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ name: "Anything" }),
    ).expect(403);
  });

  it("rejects a malformed email and a bad website before querying", async () => {
    await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ contactEmail: "not-an-email" }),
    ).expect(400);

    await auth(
      request(app.getHttpServer()).put("/api/v1/organisers/me").send({ websiteUrl: "example.com" }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts an Indian phone number in the forms people actually type", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    single.mockResolvedValue({ data: ROW, error: null });

    for (const phone of ["9876543210", "+91 98765 43210", "+91-98765-43210"]) {
      await auth(
        request(app.getHttpServer()).put("/api/v1/organisers/me").send({ contactPhone: phone }),
      ).expect(200);
    }
  });
});
