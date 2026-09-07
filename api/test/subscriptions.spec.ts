import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SubscriptionsController } from "../src/subscriptions/subscriptions.controller";
import { SubscriptionsService } from "../src/subscriptions/subscriptions.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const ORGANISER_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";

const PRO = {
  id: PLAN_ID,
  audience: "organiser",
  kind: "subscription",
  name: "Pro",
  blurb: null,
  // numeric(10,2) comes back as a string.
  price_amount: "4999.00",
  period_months: 12,
  max_active_events: 5,
  is_default: false,
  is_active: true,
  sort_order: 2,
};

describe("/api/v1/subscriptions", () => {
  let app: INestApplication;

  const results: Record<string, unknown> = {};
  const rpc = jest.fn();
  const insert = jest.fn();

  const builder = (table: string) => {
    const chain: Record<string, unknown> = { table };
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.gte = self;
    chain.lte = self;
    chain.is = self;
    chain.limit = self;
    chain.order = (...args: unknown[]) => {
      // The last .order() in a chain is what the caller awaits, so the
      // builder stays thenable rather than resolving here.
      void args;
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve(results[`${table}:one`] ?? { data: null, error: null });
    chain.single = () => Promise.resolve(results[`${table}:one`] ?? { data: null, error: null });
    chain.insert = (...args: unknown[]) => {
      insert(table, ...args);
      return chain;
    };
    chain.update = self;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(results[`${table}:list`] ?? { data: [], error: null, count: 0 }).then(resolve);
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from: builder, rpc }) as never,
      anon: () => ({ from: builder, rpc }) as never,
      userFromToken: async (token: string) =>
        token === "good" || token === "admin" ? { id: `user-${token}` } : null,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [SubscriptionsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    for (const key of Object.keys(results)) delete results[key];
    rpc.mockReset();
    insert.mockReset();
  });

  const asAdmin = (r: request.Test) => {
    results["profiles:one"] = { data: { role: "admin" }, error: null };
    return r.set("Authorization", "Bearer admin");
  };
  const asUser = (r: request.Test) => r.set("Authorization", "Bearer good");

  /** The caller owns a company and no coach row. */
  const owningOrganiser = () => {
    results["organisers:one"] = { data: { id: ORGANISER_ID }, error: null };
    results["providers:one"] = { data: null, error: null };
  };

  it("serves the price list without an account", async () => {
    results["subscription_plans:list"] = { data: [PRO], error: null };

    const res = await request(app.getHttpServer())
      .get("/api/v1/subscriptions/plans?audience=organiser")
      .expect(200);

    expect(res.body[0].name).toBe("Pro");
    // A price a client has to parse is a price two clients will parse
    // differently.
    expect(res.body[0].priceAmount).toBe(4999);
    expect(res.body[0].maxActiveEvents).toBe(5);
  });

  it("counts what is left on a tier", async () => {
    owningOrganiser();
    rpc.mockResolvedValue({ data: PRO, error: null });
    results["events:list"] = { data: null, error: null, count: 2 };
    results["party_subscriptions:list"] = {
      data: [{ starts_on: "2026-09-01", ends_on: "2027-08-31" }],
      error: null,
    };

    const res = await asUser(request(app.getHttpServer()).get("/api/v1/subscriptions/mine")).expect(
      200,
    );

    expect(res.body.plan.name).toBe("Pro");
    expect(res.body.liveEvents).toBe(2);
    expect(res.body.remaining).toBe(3);
    expect(res.body.canPublishAnother).toBe(true);
    expect(res.body.endsOn).toBe("2027-08-31");
  });

  it("reports an uncapped plan as no limit rather than a big number", async () => {
    owningOrganiser();
    rpc.mockResolvedValue({ data: { ...PRO, name: "Super", max_active_events: null }, error: null });
    results["events:list"] = { data: null, error: null, count: 9 };

    const res = await asUser(request(app.getHttpServer()).get("/api/v1/subscriptions/mine")).expect(
      200,
    );

    expect(res.body.remaining).toBeNull();
    expect(res.body.canPublishAnother).toBe(true);
  });

  it("says a full tier is full", async () => {
    owningOrganiser();
    rpc.mockResolvedValue({ data: PRO, error: null });
    results["events:list"] = { data: null, error: null, count: 5 };

    const res = await asUser(request(app.getHttpServer()).get("/api/v1/subscriptions/mine")).expect(
      200,
    );

    expect(res.body.remaining).toBe(0);
    expect(res.body.canPublishAnother).toBe(false);
  });

  it("treats a listing plan as no event rights at all", async () => {
    // max_active_events = 0 is how a coach's plan says "findable, buy the
    // event separately".
    results["organisers:one"] = { data: null, error: null };
    results["providers:one"] = { data: { id: ORGANISER_ID }, error: null };
    rpc.mockResolvedValue({
      data: { ...PRO, audience: "provider", name: "Free listing", max_active_events: 0 },
      error: null,
    });
    results["events:list"] = { data: null, error: null, count: 0 };

    const res = await asUser(request(app.getHttpServer()).get("/api/v1/subscriptions/mine")).expect(
      200,
    );

    expect(res.body.partyKind).toBe("provider");
    expect(res.body.remaining).toBe(0);
    expect(res.body.canPublishAnother).toBe(false);
  });

  it("refuses the admin half to somebody who is not one", async () => {
    results["profiles:one"] = { data: { role: "organiser" }, error: null };

    await asUser(
      request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .send({ organiserId: ORGANISER_ID, planId: PLAN_ID }),
    ).expect(403);

    expect(insert).not.toHaveBeenCalled();
  });

  it("stamps who recorded a payment, rather than believing the body", async () => {
    results["party_subscriptions:one"] = {
      data: {
        id: "sub-1",
        provider_id: null,
        organiser_id: ORGANISER_ID,
        plan_id: PLAN_ID,
        event_id: null,
        starts_on: "2026-09-07",
        ends_on: null,
        amount_paid: "4999.00",
        payment_mode: "upi",
        payment_reference: "4471",
        paid_on: "2026-09-07",
        note: null,
        subscription_plans: { name: "Pro" },
        organisers: { name: "Deccan Sports Events" },
      },
      error: null,
    };

    const res = await asAdmin(
      request(app.getHttpServer()).post("/api/v1/subscriptions").send({
        organiserId: ORGANISER_ID,
        planId: PLAN_ID,
        amountPaid: 4999,
        paymentMode: "upi",
        paymentReference: "4471",
      }),
    ).expect(201);

    // Taken from the token, never from the body — the same rule every
    // ownership id in this API follows.
    expect(insert.mock.calls[0][1].recorded_by).toBe("user-admin");
    expect(res.body.partyName).toBe("Deccan Sports Events");
    expect(res.body.amountPaid).toBe(4999);
  });

  it("refuses a body that tries to nominate who recorded it", async () => {
    await asAdmin(
      request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .send({ organiserId: ORGANISER_ID, planId: PLAN_ID, recordedBy: "somebody-else" }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a purchase that names both parties or neither", async () => {
    await asAdmin(
      request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .send({ organiserId: ORGANISER_ID, providerId: ORGANISER_ID, planId: PLAN_ID }),
    ).expect(400);

    await asAdmin(
      request(app.getHttpServer()).post("/api/v1/subscriptions").send({ planId: PLAN_ID }),
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("carries an event id through as a per-event purchase", async () => {
    results["party_subscriptions:one"] = {
      data: {
        id: "sub-2",
        provider_id: ORGANISER_ID,
        organiser_id: null,
        plan_id: PLAN_ID,
        event_id: EVENT_ID,
        starts_on: "2026-09-07",
        ends_on: null,
        amount_paid: "999.00",
        payment_mode: "cash",
        payment_reference: null,
        paid_on: null,
        note: null,
        subscription_plans: { name: "Event pass" },
        providers: { display_name: "Rahul's Cricket Academy" },
      },
      error: null,
    };

    const res = await asAdmin(
      request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .send({ providerId: ORGANISER_ID, planId: PLAN_ID, eventId: EVENT_ID, amountPaid: 999 }),
    ).expect(201);

    expect(insert.mock.calls[0][1].event_id).toBe(EVENT_ID);
    expect(res.body.eventId).toBe(EVENT_ID);
    expect(res.body.partyKind).toBe("provider");
  });

  it("requires a token for everything except the price list", async () => {
    await request(app.getHttpServer()).get("/api/v1/subscriptions/plans").expect(200);
    await request(app.getHttpServer()).get("/api/v1/subscriptions/mine").expect(401);
    await request(app.getHttpServer()).get("/api/v1/subscriptions").expect(401);
    await request(app.getHttpServer()).post("/api/v1/subscriptions").send({}).expect(401);
  });
});
