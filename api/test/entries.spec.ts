import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { EntriesController, EventEntriesController } from "../src/entries/entries.controller";
import { EntriesService } from "../src/entries/entries.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

const ROW = {
  id: ENTRY_ID,
  event_id: EVENT_ID,
  event_category_id: CATEGORY_ID,
  seeker_id: "user-1",
  participant_name: "Aarav Sharma",
  participant_dob: "2016-04-02",
  status: "confirmed",
  payment_status: "unpaid",
  payment_mode: null,
  payment_reference: null,
  paid_at: null,
  // numeric(10,2) comes back as a string. The DTO must not.
  amount_due: "750.00",
  receipt_no: "CF-2609-00042",
  entered_at: "2026-09-10T04:00:00.000Z",
  cancelled_at: null,
  cancelled_by: null,
  cancelled_reason: null,
  events: { title: "Winter Badminton Open", starts_at: "2026-12-01T04:00:00.000Z", status: "published" },
  event_categories: { name: "Under-10 Singles" },
  event_entry_members: [
    { id: "m2", name: "Second Player", dob: null, sort_order: 1 },
    { id: "m1", name: "First Player", dob: null, sort_order: 0 },
  ],
};

describe("/api/v1/entries", () => {
  let app: INestApplication;

  const results: Record<string, unknown> = {};
  const rpc = jest.fn();
  const order = jest.fn();

  const builder = (table: string) => {
    const chain: Record<string, unknown> = { table };
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.order = (...args: unknown[]) => {
      order(table, ...args);
      return Promise.resolve(results[`${table}:list`] ?? { data: [], error: null });
    };
    chain.maybeSingle = () =>
      Promise.resolve(results[`${table}:one`] ?? { data: null, error: null });
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      asUser: () => ({ from: builder, rpc }) as never,
      anon: () => ({ from: builder }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EntriesController, EventEntriesController],
      providers: [EntriesService, Reflector, { provide: SupabaseService, useValue: supabase }],
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
    order.mockReset();
  });

  const auth = (r: request.Test) => r.set("Authorization", "Bearer good");

  it("enters through the definer function, not an insert", async () => {
    rpc.mockResolvedValue({ data: ENTRY_ID, error: null });
    results["event_entries:one"] = { data: ROW, error: null };

    const res = await auth(
      request(app.getHttpServer()).post("/api/v1/entries").send({
        categoryId: CATEGORY_ID,
        participantName: "  Aarav Sharma  ",
        participantDob: "2016-04-02",
      }),
    ).expect(201);

    expect(rpc).toHaveBeenCalledWith("enter_event", {
      p_category_id: CATEGORY_ID,
      // Trimmed here so the name a family typed with a stray space is not a
      // different child from the one they typed without it.
      p_participant_name: "Aarav Sharma",
      p_participant_dob: "2016-04-02",
      p_members: [],
    });
    expect(res.body.receiptNo).toBe("CF-2609-00042");
    expect(res.body.eventTitle).toBe("Winter Badminton Open");
  });

  it("returns the fee as a number and the team in its own order", async () => {
    rpc.mockResolvedValue({ data: ENTRY_ID, error: null });
    results["event_entries:one"] = { data: ROW, error: null };

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/entries")
        .send({ categoryId: CATEGORY_ID, participantName: "Aarav Sharma" }),
    ).expect(201);

    expect(res.body.amountDue).toBe(750);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual([
      "First Player",
      "Second Player",
    ]);
  });

  it("passes a refusal from the database through as its own sentence", async () => {
    // 3K raises with sentences meant for a person; replacing them with
    // "Couldn't do that" would throw away the only precise thing anyone knows.
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "That category is full." } });

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/entries")
        .send({ categoryId: CATEGORY_ID, participantName: "Aarav Sharma" }),
    ).expect(400);

    expect(res.body.message).toBe("That category is full.");
  });

  it("explains a double tap rather than reporting a unique index", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates "event_entries_no_duplicates"' },
    });

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/entries")
        .send({ categoryId: CATEGORY_ID, participantName: "Aarav Sharma" }),
    ).expect(400);

    expect(res.body.message).toContain("already entered");
  });

  it("sends the rest of a team, trimmed", async () => {
    rpc.mockResolvedValue({ data: ENTRY_ID, error: null });
    results["event_entries:one"] = { data: ROW, error: null };

    await auth(
      request(app.getHttpServer())
        .post("/api/v1/entries")
        .send({
          categoryId: CATEGORY_ID,
          participantName: "Aarav Sharma",
          members: [{ name: "  Ishaan Rao  ", dob: "2016-01-01" }],
        }),
    ).expect(201);

    expect(rpc.mock.calls[0][1].p_members).toEqual([{ name: "Ishaan Rao", dob: "2016-01-01" }]);
  });

  it("lists a family's own entries newest first", async () => {
    results["event_entries:list"] = { data: [ROW], error: null };

    const res = await auth(request(app.getHttpServer()).get("/api/v1/entries/mine")).expect(200);

    expect(order).toHaveBeenCalledWith("event_entries", "entered_at", { ascending: false });
    expect(res.body).toHaveLength(1);
  });

  it("reads a register without checking ownership in TypeScript", async () => {
    // The read policy shows an owner their own event's entries and everybody
    // else none, so a stranger gets an empty list rather than a refusal —
    // which is right, since a refusal would confirm the event has entries.
    results["event_entries:list"] = { data: [], error: null };

    const res = await auth(
      request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}/entries`),
    ).expect(200);

    expect(res.body).toEqual([]);
  });

  it("cancels with a refund unless told otherwise", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    results["event_entries:one"] = { data: { ...ROW, status: "cancelled", cancelled_at: "x" }, error: null };

    await auth(
      request(app.getHttpServer()).post(`/api/v1/entries/${ENTRY_ID}/cancel`).send({}),
    ).expect(201);

    expect(rpc).toHaveBeenCalledWith("cancel_entry", {
      p_entry_id: ENTRY_ID,
      p_reason: null,
      p_refund: true,
    });
  });

  it("carries a non-refundable late withdrawal through as refund false", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    results["event_entries:one"] = { data: { ...ROW, status: "cancelled", cancelled_at: "x" }, error: null };

    await auth(
      request(app.getHttpServer())
        .post(`/api/v1/entries/${ENTRY_ID}/cancel`)
        .send({ reason: "Withdrew the night before.", refund: false }),
    ).expect(201);

    expect(rpc.mock.calls[0][1].p_refund).toBe(false);
  });

  it("says who cancelled it, without naming them", async () => {
    results["event_entries:list"] = {
      data: [{ ...ROW, status: "cancelled", cancelled_at: "x", cancelled_by: "user-1" }],
      error: null,
    };

    const res = await auth(request(app.getHttpServer()).get("/api/v1/entries/mine")).expect(200);

    expect(res.body[0].cancelledByMe).toBe(true);
    expect(res.body[0].cancelledBy).toBeUndefined();
  });

  it("rejects a payment status that is not one of the five", async () => {
    await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/entries/${ENTRY_ID}/payment`)
        .send({ status: "sort-of-paid" }),
    ).expect(400);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("records how they paid, not only that they did", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    results["event_entries:one"] = { data: ROW, error: null };

    await auth(
      request(app.getHttpServer())
        .patch(`/api/v1/entries/${ENTRY_ID}/payment`)
        .send({ status: "paid", mode: "upi", reference: "  4471  " }),
    ).expect(200);

    expect(rpc).toHaveBeenCalledWith("set_entry_payment", {
      p_entry_id: ENTRY_ID,
      p_status: "paid",
      p_mode: "upi",
      p_reference: "4471",
    });
  });

  it("requires a token for all of it", async () => {
    await request(app.getHttpServer()).get("/api/v1/entries/mine").expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/entries")
      .send({ categoryId: CATEGORY_ID, participantName: "Aarav Sharma" })
      .expect(401);
    await request(app.getHttpServer()).get(`/api/v1/events/${EVENT_ID}/entries`).expect(401);
  });
});
