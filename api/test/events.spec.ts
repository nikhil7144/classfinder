import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { EventsController } from "../src/events/events.controller";
import { EventsService } from "../src/events/events.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const CITY_ID = "33333333-3333-4333-8333-333333333333";
const ORGANISER_ID = "44444444-4444-4444-8444-444444444444";
const CAT_ONE = "77777777-7777-4777-8777-777777777777";
const CAT_TWO = "88888888-8888-4888-8888-888888888888";
// A well-formed id that belongs to some other event.
const FOREIGN_CAT = "99999999-9999-4999-8999-999999999999";

const ROW = {
  id: EVENT_ID,
  provider_id: null,
  organiser_id: ORGANISER_ID,
  title: "Winter Badminton Open",
  about: null,
  service_category_id: null,
  banner_url: null,
  city_id: CITY_ID,
  venue_name: "Nehru Stadium",
  venue_address: null,
  booking_mode: "platform",
  external_booking_url: null,
  booking_opens_at: null,
  booking_closes_at: null,
  starts_at: "2026-12-01T04:00:00.000Z",
  ends_at: null,
  status: "draft",
  created_at: "2026-09-09T10:00:00.000Z",
  event_categories: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Under-14 Team",
      entry_type: "team",
      team_size: 4,
      capacity: 16,
      // PostgREST hands numeric back as a string. The DTO must not.
      fee_amount: "750.00",
      min_age: null,
      max_age: 14,
      sort_order: 1,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Under-10 Singles",
      entry_type: "individual",
      team_size: null,
      capacity: null,
      fee_amount: null,
      min_age: null,
      max_age: 10,
      sort_order: 0,
    },
  ],
};

describe("/api/v1/events", () => {
  let app: INestApplication;

  // What each table's terminal call resolves to, set per test.
  const results: Record<string, unknown> = {};
  const insert = jest.fn();
  const inList = jest.fn();
  const update = jest.fn();
  const del = jest.fn();

  /**
   * A query-builder stub that remembers which table it was asked for, so one
   * test can answer "who am I" from organisers and "the event" from events
   * without the service having to be told about the test.
   */
  const builder = (table: string) => {
    const chain: Record<string, unknown> = { table };
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.in = (...args: unknown[]) => {
      inList(table, ...args);
      return chain;
    };
    chain.order = () => Promise.resolve(results[`${table}:list`] ?? { data: [], error: null });
    chain.maybeSingle = () =>
      Promise.resolve(results[`${table}:one`] ?? { data: null, error: null });
    chain.single = () => Promise.resolve(results[`${table}:one`] ?? { data: null, error: null });
    chain.insert = (...args: unknown[]) => {
      insert(table, ...args);
      const outcome = results[`${table}:insert`];
      // event_categories inserts are awaited directly; events inserts chain
      // into .select().single().
      return outcome !== undefined ? Promise.resolve(outcome) : chain;
    };
    chain.update = (...args: unknown[]) => {
      update(table, ...args);
      return chain;
    };
    // The service chains .eq() onto delete and then awaits the builder, which
    // is how supabase-js behaves: the builder is itself thenable. Returning a
    // bare Promise here would break on the .eq().
    // `select().eq()` is awaited directly by the category diff, so the builder
    // resolves as a list when nothing terminal was called on it.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(results[`${table}:list`] ?? { data: [], error: null }).then(resolve);
    chain.delete = () => {
      del(table);
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(results[`${table}:delete`] ?? { error: null }).then(resolve);
      return chain;
    };
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from: builder }) as never,
      anon: () => ({ from: builder }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [EventsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    for (const key of Object.keys(results)) delete results[key];
    insert.mockReset();
    inList.mockReset();
    update.mockReset();
    del.mockReset();
  });

  const auth = (r: request.Test) => r.set("Authorization", "Bearer good");
  /** The caller owns an organiser row and no provider row. */
  const asOrganiser = () => {
    results["organisers:one"] = { data: { id: ORGANISER_ID }, error: null };
    results["providers:one"] = { data: null, error: null };
  };

  it("reads one event without an account", async () => {
    results["events:one"] = { data: ROW, error: null };

    const res = await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}`).expect(200);

    expect(res.body.title).toBe("Winter Badminton Open");
    expect(res.body.venueName).toBe("Nehru Stadium");
  });

  it("reports the owner as a kind and an id, not two nullable columns", async () => {
    results["events:one"] = { data: ROW, error: null };

    const res = await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}`).expect(200);

    expect(res.body.ownerKind).toBe("organiser");
    expect(res.body.ownerId).toBe(ORGANISER_ID);
    expect(res.body.providerId).toBeUndefined();
  });

  it("names the owner from whichever of the two rows came back embedded", async () => {
    results["events:one"] = {
      data: { ...ROW, organisers: { name: "Deccan Sports Events" } },
      error: null,
    };

    const company = await request(app.getHttpServer())
      .get(`/api/v1/events/${EVENT_ID}`)
      .expect(200);
    expect(company.body.ownerName).toBe("Deccan Sports Events");

    // A coach-owned event carries the other one, under a different column
    // name, and the DTO must not care which.
    results["events:one"] = {
      data: {
        ...ROW,
        organiser_id: null,
        provider_id: ORGANISER_ID,
        providers: { display_name: "Rahul's Cricket Academy" },
      },
      error: null,
    };

    const coach = await request(app.getHttpServer())
      .get(`/api/v1/events/${EVENT_ID}`)
      .expect(200);
    expect(coach.body.ownerKind).toBe("provider");
    expect(coach.body.ownerName).toBe("Rahul's Cricket Academy");
  });

  it("reports a hidden owner as no name rather than guessing one", async () => {
    // RLS returns null for an embedded row the caller may not read. A page
    // that cannot say who is running an event must say nothing, not invent.
    results["events:one"] = { data: ROW, error: null };

    const res = await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}`).expect(200);
    expect(res.body.ownerName).toBeNull();
  });

  it("returns categories in sortOrder, with the fee as a number", async () => {
    results["events:one"] = { data: ROW, error: null };

    const res = await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}`).expect(200);

    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual([
      "Under-10 Singles",
      "Under-14 Team",
    ]);
    // numeric(10,2) arrives as "750.00"; a client should never have to know that.
    expect(res.body.categories[1].feeAmount).toBe(750);
    expect(res.body.categories[0].feeAmount).toBeNull();
  });

  it("404s an event the policy hides, rather than admitting it exists", async () => {
    results["events:one"] = { data: null, error: null };

    await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}`).expect(404);
  });

  it("creates as a draft and stamps the caller's own party", async () => {
    asOrganiser();
    results["events:one"] = { data: ROW, error: null };

    await auth(
      request(app.getHttpServer())
        .post("/api/v1/events")
        .send({ title: "Winter Badminton Open", cityId: CITY_ID, startsAt: ROW.starts_at }),
    ).expect(201);

    expect(insert).toHaveBeenCalledWith(
      "events",
      expect.objectContaining({ organiser_id: ORGANISER_ID, status: "draft" }),
    );
  });

  it("ignores an owner supplied by the client", async () => {
    asOrganiser();
    results["events:one"] = { data: ROW, error: null };

    await auth(
      request(app.getHttpServer()).post("/api/v1/events").send({
        title: "Winter Badminton Open",
        cityId: CITY_ID,
        startsAt: ROW.starts_at,
        organiserId: "99999999-9999-4999-8999-999999999999",
      }),
      // forbidNonWhitelisted: naming a field that is not in the contract is an
      // error, not something quietly dropped and appearing to have worked.
    ).expect(400);

    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses to create an event for somebody with no coach or company row", async () => {
    results["organisers:one"] = { data: null, error: null };
    results["providers:one"] = { data: null, error: null };

    await auth(
      request(app.getHttpServer())
        .post("/api/v1/events")
        .send({ title: "Winter Badminton Open", cityId: CITY_ID, startsAt: ROW.starts_at }),
    ).expect(403);

    expect(insert).not.toHaveBeenCalled();
  });

  it("turns a check-constraint violation into a sentence about dates", async () => {
    results["events:one"] = {
      data: null,
      error: {
        code: "23514",
        message: 'new row violates check constraint "events_dates_ordered"',
      },
    };

    const res = await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/events/${EVENT_ID}`)
        .send({ endsAt: "2026-11-01T04:00:00.000Z" }),
    ).expect(400);

    expect(res.body.message).toMatch(/booking has to open before it closes/i);
  });

  it("explains a failed publish as approval, not as a missing event", async () => {
    // The policy refuses the row, so the update matches nothing and returns null.
    results["events:one"] = { data: null, error: null };

    const res = await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/events/${EVENT_ID}/status`)
        .send({ status: "published" }),
    ).expect(404);

    expect(res.body.message).toMatch(/waiting for approval/i);
    expect(update).toHaveBeenCalledWith("events", { status: "published" });
  });

  it("rejects a status that is not one of the four", async () => {
    await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/events/${EVENT_ID}/status`)
        .send({ status: "live" }),
    ).expect(400);

    expect(update).not.toHaveBeenCalled();
  });

  it("adds a category without an id and leaves the others alone", async () => {
    results["events:one"] = { data: ROW, error: null };
    results["event_categories:list"] = { data: [{ id: CAT_ONE }], error: null };
    results["event_categories:insert"] = { error: null };

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({
          categories: [
            { id: CAT_ONE, name: "Under-10 Singles", entryType: "individual" },
            { name: "Under-14 Team", entryType: "team", teamSize: 4, feeAmount: 750 },
          ],
        }),
    ).expect(200);

    // The existing row is edited in place — it keeps its id, and therefore
    // whatever has been entered into it.
    expect(update).toHaveBeenCalledWith(
      "event_categories",
      expect.objectContaining({ name: "Under-10 Singles", sort_order: 0 }),
    );
    // Only the new one is inserted, and the array's order is its sort order.
    expect(insert).toHaveBeenCalledWith("event_categories", [
      expect.objectContaining({ name: "Under-14 Team", sort_order: 1, team_size: 4 }),
    ]);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes only the categories the form no longer shows", async () => {
    results["events:one"] = { data: ROW, error: null };
    results["event_categories:list"] = { data: [{ id: CAT_ONE }, { id: CAT_TWO }], error: null };

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({ categories: [{ id: CAT_ONE, name: "Under-10 Singles", entryType: "individual" }] }),
    ).expect(200);

    expect(del).toHaveBeenCalledWith("event_categories");
    expect(inList).toHaveBeenCalledWith("event_categories", "id", [CAT_TWO]);
  });

  it("explains a category that cannot be removed because it has entries", async () => {
    results["events:one"] = { data: ROW, error: null };
    results["event_categories:list"] = { data: [{ id: CAT_ONE }], error: null };
    // 23503 is the entry's foreign key refusing the delete, which is the
    // whole reason this endpoint is a diff.
    results["event_categories:delete"] = { error: { code: "23503", message: "fk" } };

    const res = await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({ categories: [] }),
    ).expect(400);

    expect(res.body.message).toContain("entries in it");
  });

  it("treats an id from somewhere else as a new row rather than trusting it", async () => {
    results["events:one"] = { data: ROW, error: null };
    results["event_categories:list"] = { data: [{ id: CAT_ONE }], error: null };
    results["event_categories:insert"] = { error: null };

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({
          categories: [
            { id: FOREIGN_CAT, name: "Under-10 Singles", entryType: "individual" },
          ],
        }),
    ).expect(200);

    expect(update).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith("event_categories", [
      expect.objectContaining({ name: "Under-10 Singles" }),
    ]);
  });

  it("does not delete anything when the event is not the caller's", async () => {
    results["events:one"] = { data: null, error: null };

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({ categories: [] }),
    ).expect(404);

    expect(del).not.toHaveBeenCalled();
  });

  it("refuses a team category with no team size before querying", async () => {
    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/events/${EVENT_ID}/categories`)
        .send({ categories: [{ name: "Under-14 Team", entryType: "team", teamSize: 1 }] }),
    ).expect(400);

    expect(del).not.toHaveBeenCalled();
  });

  it("requires a token for everything except reading", async () => {
    await request(app.getHttpServer()).get("/api/v1/events/mine").expect(401);
    await request(app.getHttpServer()).post("/api/v1/events").send({}).expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .send({})
      .expect(401);
  });
});
