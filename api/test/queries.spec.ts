import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { QueriesController } from "../src/queries/queries.controller";
import { QueriesService } from "../src/queries/queries.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PROVIDER = "22222222-2222-4222-8222-222222222222";
const QUERY_ID = "33333333-3333-4333-8333-333333333333";

const ROW = {
  id: QUERY_ID,
  provider_id: PROVIDER,
  seeker_id: "user-1",
  contact_name: "Nikhil",
  contact_phone: "+91 98765 43210",
  service_category_id: null,
  details: "My son is 9 and has never played before.",
  status: "new",
  callback_at: null,
  created_at: "2026-09-07T10:00:00.000Z",
  responded_at: null,
  providers: { display_name: "Krishna" },
  service_category_master: { name: "Cricket" },
  enquiries: [],
};

describe("/api/v1/queries", () => {
  let app: INestApplication;
  const insert = jest.fn();
  const rpc = jest.fn();
  const result = jest.fn();

  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.insert = (...args: unknown[]) => {
      insert(...args);
      return chain;
    };
    chain.single = () => result();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result());
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from: builder, rpc }) as never,
      userFromToken: async (t: string) => (t === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [QueriesController],
      providers: [QueriesService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    insert.mockReset();
    rpc.mockReset();
    result.mockReset();
  });

  const auth = (r: request.Test) => r.set("Authorization", "Bearer good");

  it("refuses every route without a token", async () => {
    const s = app.getHttpServer();
    await request(s).get("/api/v1/queries").expect(401);
    await request(s).post("/api/v1/queries").send({}).expect(401);
    await request(s).patch(`/api/v1/queries/${QUERY_ID}/status`).send({ status: "new" }).expect(401);
    await request(s).post(`/api/v1/queries/${QUERY_ID}/answer`).send({ message: "hi" }).expect(401);
  });

  it("maps a row to the contract, joins included", async () => {
    result.mockReturnValue({ data: [ROW], error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/queries")).expect(200);

    expect(res.body[0].providerName).toBe("Krishna");
    expect(res.body[0].serviceName).toBe("Cricket");
    expect(res.body[0].contactPhone).toBe("+91 98765 43210");
    // No conversation yet — the field exists so the client can branch on it.
    expect(res.body[0].enquiryId).toBeNull();
  });

  it("reports the conversation once one exists", async () => {
    result.mockReturnValue({ data: [{ ...ROW, enquiries: [{ id: "enq-1" }] }], error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/queries")).expect(200);
    expect(res.body[0].enquiryId).toBe("enq-1");
  });

  it("raises one, stamping the caller as the seeker", async () => {
    result.mockReturnValue({ data: ROW, error: null });

    await auth(
      request(app.getHttpServer())
        .post("/api/v1/queries")
        .send({ providerId: PROVIDER, contactName: "Nikhil", contactPhone: "9876543210" }),
    ).expect(201);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ seeker_id: "user-1", provider_id: PROVIDER }),
    );
  });

  it("turns a duplicate into a sentence rather than a unique-index error", async () => {
    result.mockReturnValue({ data: null, error: { code: "23505", message: "duplicate key" } });

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/queries")
        .send({ providerId: PROVIDER, contactName: "Nikhil", contactPhone: "9876543210" }),
    ).expect(400);

    expect(res.body.message).toMatch(/already asked/i);
  });

  it("explains a policy refusal as an incomplete profile", async () => {
    result.mockReturnValue({ data: null, error: { code: "42501", message: "permission denied" } });

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/queries")
        .send({ providerId: PROVIDER, contactName: "Nikhil", contactPhone: "9876543210" }),
    ).expect(403);

    expect(res.body.message).toMatch(/finish your profile/i);
  });

  it("requires a phone number, because being called is the point", async () => {
    await auth(
      request(app.getHttpServer())
        .post("/api/v1/queries")
        .send({ providerId: PROVIDER, contactName: "Nikhil" }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a name that is not one, and a phone that is not one", async () => {
    const s = app.getHttpServer();
    await auth(
      request(s).post("/api/v1/queries").send({ providerId: PROVIDER, contactName: "N", contactPhone: "9876543210" }),
    ).expect(400);

    await auth(
      request(s).post("/api/v1/queries").send({ providerId: PROVIDER, contactName: "Nikhil", contactPhone: "call me" }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a scheduled callback with no time", async () => {
    // The DTO catches it, and a check constraint catches it again — a status
    // that says a call is booked without saying when says nothing.
    await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/queries/${QUERY_ID}/status`)
        .send({ status: "callback_scheduled" }),
    ).expect(400);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a scheduled callback with one", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    result.mockReturnValue({ data: { ...ROW, status: "callback_scheduled" }, error: null });

    await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/queries/${QUERY_ID}/status`)
        .send({ status: "callback_scheduled", callbackAt: "2026-09-10T05:30:00.000Z" }),
    ).expect(200);

    expect(rpc).toHaveBeenCalledWith(
      "set_query_status",
      expect.objectContaining({ p_status: "callback_scheduled" }),
    );
  });

  it("rejects a status the product does not have", async () => {
    await auth(
      request(app.getHttpServer()).patch(`/api/v1/queries/${QUERY_ID}/status`).send({ status: "maybe" }),
    ).expect(400);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the conversation to open when answering", async () => {
    rpc.mockResolvedValue({ data: "enq-9", error: null });

    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/v1/queries/${QUERY_ID}/answer`)
        .send({ message: "Happy to help — free on Saturdays." }),
    ).expect(201);

    expect(res.body).toEqual({ enquiryId: "enq-9" });
  });

  it("passes a refusal from answer_query through as a refusal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "That query is not yours." } });

    await auth(
      request(app.getHttpServer()).post(`/api/v1/queries/${QUERY_ID}/answer`).send({ message: "hi" }),
    ).expect(403);
  });

  it("will not answer with an empty message", async () => {
    await auth(
      request(app.getHttpServer()).post(`/api/v1/queries/${QUERY_ID}/answer`).send({ message: "" }),
    ).expect(400);

    expect(rpc).not.toHaveBeenCalled();
  });
});
