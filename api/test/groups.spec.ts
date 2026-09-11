import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { GroupsController } from "../src/groups/groups.controller";
import { GroupsService } from "../src/groups/groups.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const GROUP = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
const SERVICE = "33333333-3333-4333-8333-333333333333";
const AREA = "44444444-4444-4444-8444-444444444444";

/** A row exactly as my_groups() returns it. */
const groupRow = (over: Record<string, unknown> = {}) => ({
  id: GROUP,
  service_name: "Kathak",
  area_name: "Vijay Nagar",
  city_name: "Indore",
  society_name: "Shipra Sun City",
  student_count: 4,
  // bigint over PostgREST.
  member_count: "3",
  expires_at: "2026-09-22T10:00:00.000Z",
  closed_at: null,
  is_creator: true,
  is_active: true,
  pending_requests: "2",
  created_at: "2026-09-12T10:00:00.000Z",
  ...over,
});

describe("/api/v1/groups", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const from = jest.fn();
  const insert = jest.fn();
  const update = jest.fn();
  const del = jest.fn();

  const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

  beforeAll(async () => {
    const client = { rpc, from };
    const supabase: Partial<SupabaseService> = {
      anon: () => client as never,
      asUser: () => client as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [GroupsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    insert.mockReset();
    update.mockReset();
    del.mockReset();
  });

  /**
   * The table calls. `single` answers `singleResult`, `maybeSingle` answers
   * `maybeResult`, and every mutation is recorded so a test can assert on it.
   */
  const wireTables = (opts: {
    singleResult?: unknown;
    maybeResult?: unknown;
    mutationError?: unknown;
  } = {}) => {
    from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.insert = (...a: unknown[]) => {
        insert(...a);
        return chain;
      };
      chain.update = (...a: unknown[]) => {
        update(...a);
        return chain;
      };
      chain.delete = (...a: unknown[]) => {
        del(...a);
        return chain;
      };
      chain.single = async () => opts.singleResult ?? { data: { id: GROUP }, error: null };
      chain.maybeSingle = async () => opts.maybeResult ?? { data: null, error: null };
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: opts.mutationError ?? null }).then(resolve);
      return chain;
    });
  };

  const wireMyGroups = (rows: unknown[]) => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "my_groups" ? { data: rows, error: null } : { data: null, error: null },
    );
  };

  describe("the list", () => {
    it("coerces every bigint and resolves the caller's answers", async () => {
      wireMyGroups([groupRow()]);

      const res = await auth(request(app.getHttpServer()).get("/api/v1/groups")).expect(200);

      expect(res.body[0].memberCount).toBe(3);
      expect(typeof res.body[0].memberCount).toBe("number");
      expect(res.body[0].pendingRequests).toBe(2);
      expect(res.body[0].isCreator).toBe(true);
      expect(rpc).toHaveBeenCalledWith("my_groups");
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer()).get("/api/v1/groups").expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("the invite", () => {
    const inviteJson = {
      id: GROUP,
      service_name: "Kathak",
      area_name: "Vijay Nagar",
      city_name: "Indore",
      society_name: "Shipra Sun City",
      student_count: 4,
      notes: "Saturday mornings would suit us.",
      member_count: 3,
      expires_at: "2026-09-22T10:00:00.000Z",
      is_open: true,
      already_member: false,
    };

    it("is readable signed out — that is the point of a link", async () => {
      rpc.mockResolvedValue({ data: inviteJson, error: null });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${GROUP}/invite`)
        .expect(200);

      expect(res.body.societyName).toBe("Shipra Sun City");
      expect(res.body.isOpen).toBe(true);
      // False for a guest rather than an error.
      expect(res.body.alreadyMember).toBe(false);
    });

    it("404s for a link that is not valid any more", async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      await request(app.getHttpServer()).get(`/api/v1/groups/${GROUP}/invite`).expect(404);
    });

    it("rejects an id that is not a uuid before asking anything", async () => {
      await request(app.getHttpServer()).get("/api/v1/groups/nope/invite").expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("starting one", () => {
    it("adds the creator as its first member in the same call", async () => {
      // A group of nobody is not a group.
      wireTables();
      wireMyGroups([groupRow()]);

      const res = await auth(
        request(app.getHttpServer()).post("/api/v1/groups").send({
          serviceCategoryId: SERVICE,
          areaId: AREA,
          societyName: "Shipra Sun City",
          studentCount: 4,
        }),
      ).expect(201);

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ creator_id: "user-1", society_name: "Shipra Sun City" }),
      );
      expect(insert).toHaveBeenCalledWith({ group_id: GROUP, user_id: "user-1" });
      expect(res.body.id).toBe(GROUP);
    });

    it("keeps the number private unless it is asked for", async () => {
      wireTables();
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer())
          .post("/api/v1/groups")
          .send({ serviceCategoryId: SERVICE, areaId: AREA, societyName: "Shipra" }),
      ).expect(201);

      expect(insert.mock.calls[0][0].show_phone).toBe(false);
    });

    it("lets the creator pick how long it runs", async () => {
      // Without this the column default decides and the four choices the form
      // offers would mean nothing.
      wireTables();
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).post("/api/v1/groups").send({
          serviceCategoryId: SERVICE,
          areaId: AREA,
          societyName: "Shipra",
          validityDays: 30,
        }),
      ).expect(201);

      const at = new Date(insert.mock.calls[0][0].expires_at as string).getTime();
      expect(at).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      expect(at).toBeLessThan(Date.now() + 31 * 86_400_000);
    });

    it("refuses a group of one, because that is an enquiry", async () => {
      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/groups")
          .send({ serviceCategoryId: SERVICE, areaId: AREA, societyName: "Shipra", studentCount: 1 }),
      ).expect(400);

      expect(res.body.message[0]).toContain("at least two families");
      expect(from).not.toHaveBeenCalled();
    });

    it("requires the society, which is how neighbours recognise their group", async () => {
      await auth(
        request(app.getHttpServer())
          .post("/api/v1/groups")
          .send({ serviceCategoryId: SERVICE, areaId: AREA }),
      ).expect(400);
      expect(from).not.toHaveBeenCalled();
    });

    it("refuses a student count nobody would ask for", async () => {
      for (const studentCount of [1, 500]) {
        await auth(
          request(app.getHttpServer())
            .post("/api/v1/groups")
            .send({ serviceCategoryId: SERVICE, areaId: AREA, societyName: "Shipra", studentCount }),
        ).expect(400);
      }
    });
  });

  describe("editing one", () => {
    it("closes it with a timestamp and reopens it with a null", async () => {
      wireTables();
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ closed: true }),
      ).expect(200);
      expect(update.mock.calls[0][0].closed_at).toEqual(expect.any(String));

      update.mockReset();
      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ closed: false }),
      ).expect(200);
      expect(update.mock.calls[0][0].closed_at).toBeNull();
    });

    it("sends only what was asked to change", async () => {
      wireTables();
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ studentCount: 6 }),
      ).expect(200);

      expect(update).toHaveBeenCalledWith({ student_count: 6 });
    });

    it("gives it another ten days on request", async () => {
      wireTables();
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ extend: true }),
      ).expect(200);

      const at = new Date(update.mock.calls[0][0].expires_at as string).getTime();
      // Ten days out, give or take the time the test took to run.
      expect(at).toBeGreaterThan(Date.now() + 9 * 86_400_000);
      expect(at).toBeLessThan(Date.now() + 11 * 86_400_000);
    });

    it("reopening an expired group also revives it", async () => {
      // Clearing closed_at alone would leave something that says it is open
      // and that no coach can pitch to — the mirror of the dead end
      // GroupOverview's comment records.
      wireTables({
        maybeResult: { data: { expires_at: "2020-01-01T00:00:00.000Z" }, error: null },
      });
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ closed: false }),
      ).expect(200);

      expect(update.mock.calls[0][0].closed_at).toBeNull();
      expect(update.mock.calls[0][0].expires_at).toEqual(expect.any(String));
    });

    it("reopening one that still has time left leaves the date alone", async () => {
      // A creator reopening something with a week left has not asked for
      // another ten days.
      const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
      wireTables({ maybeResult: { data: { expires_at: future }, error: null } });
      wireMyGroups([groupRow()]);

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({ closed: false }),
      ).expect(200);

      expect(update.mock.calls[0][0].closed_at).toBeNull();
      expect(update.mock.calls[0][0]).not.toHaveProperty("expires_at");
    });

    it("refuses an empty patch rather than writing nothing", async () => {
      await auth(
        request(app.getHttpServer()).patch(`/api/v1/groups/${GROUP}`).send({}),
      ).expect(400);
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("joining and leaving", () => {
    it("treats joining twice as joining once", async () => {
      // A second tap on a slow connection is the common cause, and it is not a
      // failure worth showing anybody.
      wireTables({ mutationError: { code: "23505", message: "duplicate key" } });
      wireMyGroups([groupRow({ is_creator: false, pending_requests: "0" })]);

      const res = await auth(
        request(app.getHttpServer()).post(`/api/v1/groups/${GROUP}/members`),
      ).expect(201);

      expect(res.body.id).toBe(GROUP);
    });

    it("turns a closed group's refusal into a sentence", async () => {
      wireTables({ mutationError: { code: "42501", message: "violates policy" } });

      const res = await auth(
        request(app.getHttpServer()).post(`/api/v1/groups/${GROUP}/members`),
      ).expect(403);

      expect(res.body.message).toBe("That group is not open to join.");
    });

    it("lets a member leave", async () => {
      wireTables({ maybeResult: { data: { creator_id: "somebody-else" }, error: null } });

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/groups/${GROUP}/members/me`),
      ).expect(204);

      expect(del).toHaveBeenCalled();
    });

    it("refuses to let the creator leave, and says what to do instead", async () => {
      // The pitches, the threads and the invite all hang off them.
      wireTables({ maybeResult: { data: { creator_id: "user-1" }, error: null } });

      const res = await auth(
        request(app.getHttpServer()).delete(`/api/v1/groups/${GROUP}/members/me`),
      ).expect(400);

      expect(res.body.message).toContain("Close it instead");
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe("pitches", () => {
    it("maps a pitch row to the contract", async () => {
      rpc.mockImplementation(async (fn: string) =>
        fn === "group_threads"
          ? {
              data: [
                {
                  request_id: REQUEST,
                  provider_id: "p1",
                  provider_name: "Krishna",
                  provider_photo_url: null,
                  pitch: "We can take four children on Saturdays.",
                  status: "pending",
                  created_at: "2026-09-12T10:00:00.000Z",
                  last_message: null,
                  last_message_at: null,
                  last_sender_id: null,
                  message_count: "0",
                  unread: true,
                  is_creator: true,
                },
              ],
              error: null,
            }
          : { data: null, error: null },
      );

      const res = await auth(
        request(app.getHttpServer()).get(`/api/v1/groups/${GROUP}/pitches`),
      ).expect(200);

      expect(res.body[0].requestId).toBe(REQUEST);
      expect(res.body[0].messageCount).toBe(0);
      expect(res.body[0].unread).toBe(true);
    });

    it("accepts one", async () => {
      wireTables();

      await auth(
        request(app.getHttpServer())
          .post(`/api/v1/groups/pitches/${REQUEST}/respond`)
          .send({ status: "accepted" }),
      ).expect(204);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted", responded_at: expect.any(String) }),
      );
    });

    it("refuses a status that is not an answer", async () => {
      await auth(
        request(app.getHttpServer())
          .post(`/api/v1/groups/pitches/${REQUEST}/respond`)
          .send({ status: "pending" }),
      ).expect(400);
      expect(from).not.toHaveBeenCalled();
    });

    it("says which kind of null a withheld number is", async () => {
      rpc.mockResolvedValue({
        data: { phone: null, name: "Asha", society_name: "Shipra", shared: false },
        error: null,
      });

      const res = await auth(
        request(app.getHttpServer()).get(`/api/v1/groups/pitches/${REQUEST}/contact`),
      ).expect(200);

      expect(res.body.phone).toBeNull();
      expect(res.body.shared).toBe(false);
      expect(res.body.name).toBe("Asha");
    });

    it("refuses the contact strip without a token", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/groups/pitches/${REQUEST}/contact`)
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
