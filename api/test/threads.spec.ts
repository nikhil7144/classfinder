import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { ThreadsController } from "../src/threads/threads.controller";
import { ThreadsService, toMessage, toThread } from "../src/threads/threads.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A row exactly as my_threads() returns it. */
const threadRow = {
  kind: "group",
  thread_id: THREAD,
  group_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  provider_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  title: "Krishna Sports Academy",
  subtitle: "Cricket · Indirapuram",
  photo_url: null,
  opening: "We can take four children on Saturdays.",
  status: "pending",
  initiated_by: "provider",
  created_at: "2026-09-09T10:00:00.000Z",
  last_message: "What time?",
  last_message_at: "2026-09-10T08:00:00.000Z",
  last_sender_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  // bigint over PostgREST.
  message_count: "4",
  unread: true,
  i_am_seeker: true,
};

describe("thread row mapping", () => {
  it("converts snake_case to the contract's camelCase", () => {
    const t = toThread(threadRow);
    expect(t.threadId).toBe(THREAD);
    expect(t.lastMessage).toBe("What time?");
    expect(t.initiatedBy).toBe("provider");
    expect(t.iAmSeeker).toBe(true);
  });

  it("coerces the bigint message count", () => {
    expect(toThread(threadRow).messageCount).toBe(4);
    expect(typeof toThread(threadRow).messageCount).toBe("number");
  });

  it("counts default to zero on a thread nobody has replied to", () => {
    expect(toThread({ ...threadRow, message_count: null }).messageCount).toBe(0);
  });

  it("reads the right foreign key for each kind", () => {
    // The two tables carry the same message under different column names.
    // The contract flattens both to threadId, so a client never learns this.
    const group = toMessage(
      { id: "m1", request_id: THREAD, sender_id: "s", body: "hi", created_at: "t" },
      "group",
    );
    const enquiry = toMessage(
      { id: "m2", enquiry_id: THREAD, sender_id: "s", body: "hi", created_at: "t" },
      "enquiry",
    );
    expect(group.threadId).toBe(THREAD);
    expect(enquiry.threadId).toBe(THREAD);
  });
});

describe("/api/v1/threads", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const from = jest.fn();

  const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

  beforeAll(async () => {
    const client = { rpc, from };
    const supabase: Partial<SupabaseService> = {
      anon: () => client as never,
      asUser: () => client as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [ThreadsService, Reflector, { provide: SupabaseService, useValue: supabase }],
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

  /** A chainable PostgREST query stub that resolves to `result`. */
  const query = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "lt", "insert", "in", "not"]) {
      chain[method] = jest.fn(() => chain);
    }
    chain.single = jest.fn(async () => result);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };

  it("lists the caller's threads", async () => {
    rpc.mockResolvedValue({ data: [threadRow], error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].messageCount).toBe(4);
    // No arguments: the function resolves auth.uid() itself.
    expect(rpc).toHaveBeenCalledWith("my_threads");
  });

  describe("where a conversation came from", () => {
    // ThreadPane reads enquiries.query_id from the table, per thread, to say
    // "They asked for a call about Cricket on 7 Sep". A mobile client cannot
    // read tables, so the service does it — once for the whole inbox.
    const enquiryRow = { ...threadRow, kind: "enquiry", thread_id: THREAD };

    it("attaches the origin to a thread that began as a request for a call", async () => {
      rpc.mockResolvedValue({ data: [enquiryRow], error: null });
      from.mockReturnValue(
        query({
          data: [
            {
              id: THREAD,
              show_phone: false,
              query_id: "99999999-9999-4999-8999-999999999999",
              queries: {
                created_at: "2026-09-07T10:00:00.000Z",
                service_category_master: { name: "Cricket" },
              },
            },
          ],
          error: null,
        }),
      );

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);

      expect(res.body[0].origin).toEqual({
        queryId: "99999999-9999-4999-8999-999999999999",
        serviceName: "Cricket",
        askedAt: "2026-09-07T10:00:00.000Z",
      });
    });

    it("is null on a thread that did not", async () => {
      rpc.mockResolvedValue({ data: [enquiryRow], error: null });
      from.mockReturnValue(query({ data: [], error: null }));

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);
      expect(res.body[0].origin).toBeNull();
    });

    it("does not ask at all when every thread is a group", async () => {
      // A group pitch cannot come from a query, so the extra round trip is
      // skipped rather than made and discarded.
      rpc.mockResolvedValue({ data: [threadRow], error: null });

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);

      expect(res.body[0].origin).toBeNull();
      expect(from).not.toHaveBeenCalled();
    });

    it("still renders the inbox when the origin lookup fails", async () => {
      // One missing context line is worth less than the whole inbox.
      rpc.mockResolvedValue({ data: [enquiryRow], error: null });
      from.mockReturnValue(query({ data: null, error: { message: "boom" } }));

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].origin).toBeNull();
    });

    it("reports whether the number is shared", async () => {
      rpc.mockResolvedValue({ data: [enquiryRow], error: null });
      from.mockReturnValue(
        query({
          data: [{ id: THREAD, show_phone: true, query_id: null, queries: null }],
          error: null,
        }),
      );

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);
      expect(res.body[0].showPhone).toBe(true);
    });

    it("says null on a group thread, which has no such switch", async () => {
      // False would read as "not shared" on something that cannot be.
      rpc.mockResolvedValue({ data: [threadRow], error: null });

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);
      expect(res.body[0].showPhone).toBeNull();
    });

    it("understates sharing when the lookup fails, rather than overstating it", async () => {
      // The safe direction to be wrong in: it can only ever say a coach sees
      // less than they do.
      rpc.mockResolvedValue({ data: [enquiryRow], error: null });
      from.mockReturnValue(query({ data: null, error: { message: "boom" } }));

      const res = await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);
      expect(res.body[0].showPhone).toBe(false);
    });

    it("asks once for an inbox full of enquiries, not once each", async () => {
      rpc.mockResolvedValue({
        data: [
          enquiryRow,
          { ...enquiryRow, thread_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
          { ...enquiryRow, thread_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        ],
        error: null,
      });
      from.mockReturnValue(query({ data: [], error: null }));

      await auth(request(app.getHttpServer()).get("/api/v1/threads")).expect(200);

      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses the inbox without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/threads").expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads a group thread from group_messages", async () => {
    from.mockReturnValue(
      query({ data: [{ id: "m1", request_id: THREAD, sender_id: "s", body: "hi", created_at: "t" }], error: null }),
    );

    const res = await auth(
      request(app.getHttpServer()).get(`/api/v1/threads/group/${THREAD}/messages`),
    ).expect(200);

    expect(from).toHaveBeenCalledWith("group_messages");
    expect(res.body[0].threadId).toBe(THREAD);
  });

  it("reads an enquiry thread from enquiry_messages", async () => {
    from.mockReturnValue(query({ data: [], error: null }));

    await auth(
      request(app.getHttpServer()).get(`/api/v1/threads/enquiry/${THREAD}/messages`),
    ).expect(200);

    expect(from).toHaveBeenCalledWith("enquiry_messages");
  });

  it("rejects a kind that is not one of the two, rather than 500ing on it", async () => {
    // Without the enum pipe this indexes the surface map as undefined and
    // throws inside the service, which would be a 500 for a bad request.
    await auth(
      request(app.getHttpServer()).get(`/api/v1/threads/dm/${THREAD}/messages`),
    ).expect(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a thread id that is not a uuid", async () => {
    await auth(request(app.getHttpServer()).get("/api/v1/threads/group/nope/messages")).expect(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("sends a message as the caller, never as whoever the body claims", async () => {
    const chain = query({
      data: { id: "m9", request_id: THREAD, sender_id: "user-1", body: "ok", created_at: "t" },
      error: null,
    });
    from.mockReturnValue(chain);

    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/v1/threads/group/${THREAD}/messages`)
        .send({ body: "ok", senderId: "somebody-else" }),
    );

    // senderId is not on the DTO, so whitelisting rejects the whole request
    // rather than quietly ignoring the field.
    expect(res.status).toBe(400);
  });

  it("inserts with the caller's id and the right foreign key", async () => {
    const chain = query({
      data: { id: "m9", request_id: THREAD, sender_id: "user-1", body: "ok", created_at: "t" },
      error: null,
    });
    from.mockReturnValue(chain);

    await auth(
      request(app.getHttpServer()).post(`/api/v1/threads/group/${THREAD}/messages`).send({ body: "ok" }),
    ).expect(201);

    expect(chain.insert).toHaveBeenCalledWith({
      request_id: THREAD,
      sender_id: "user-1",
      body: "ok",
    });
  });

  it("refuses an empty message and one past the database's ceiling", async () => {
    await auth(
      request(app.getHttpServer()).post(`/api/v1/threads/group/${THREAD}/messages`).send({ body: "" }),
    ).expect(400);

    await auth(
      request(app.getHttpServer())
        .post(`/api/v1/threads/group/${THREAD}/messages`)
        .send({ body: "x".repeat(4001) }),
    ).expect(400);

    expect(from).not.toHaveBeenCalled();
  });

  it("marks a group thread read through its own function", async () => {
    rpc.mockResolvedValue({ error: null });

    await auth(request(app.getHttpServer()).post(`/api/v1/threads/group/${THREAD}/read`)).expect(204);

    expect(rpc).toHaveBeenCalledWith("mark_thread_read", { p_request_id: THREAD });
  });

  it("marks an enquiry read through the other one", async () => {
    // The pair that made this migration worth doing: two names, two argument
    // names, one thing. A client says the kind and stops caring.
    rpc.mockResolvedValue({ error: null });

    await auth(request(app.getHttpServer()).post(`/api/v1/threads/enquiry/${THREAD}/read`)).expect(
      204,
    );

    expect(rpc).toHaveBeenCalledWith("mark_enquiry_read", { p_enquiry_id: THREAD });
  });
});
