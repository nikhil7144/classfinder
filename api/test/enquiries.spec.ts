import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { EnquiriesController } from "../src/enquiries/enquiries.controller";
import { EnquiriesService } from "../src/enquiries/enquiries.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PROVIDER = "11111111-1111-4111-8111-111111111111";
const ENQUIRY = "22222222-2222-4222-8222-222222222222";

const MESSAGE = "My son is 12 and has never boxed before. Do you take beginners?";

/** The enquiry as my_threads() returns it. */
const threadRow = {
  kind: "enquiry",
  thread_id: ENQUIRY,
  group_id: null,
  provider_id: PROVIDER,
  title: "Krishna",
  subtitle: "Boxing",
  photo_url: null,
  opening: MESSAGE,
  status: "open",
  initiated_by: "seeker",
  created_at: "2026-09-12T10:00:00.000Z",
  last_message: null,
  last_message_at: null,
  last_sender_id: null,
  message_count: "0",
  unread: false,
  i_am_seeker: true,
};

describe("/api/v1/enquiries", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const from = jest.fn();
  const insert = jest.fn();

  const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

  beforeAll(async () => {
    const client = { rpc, from };
    const supabase: Partial<SupabaseService> = {
      anon: () => client as never,
      asUser: () => client as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EnquiriesController],
      providers: [EnquiriesService, Reflector, { provide: SupabaseService, useValue: supabase }],
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
  });

  /** The insert chain, resolving to whatever the test wants back. */
  const wireInsert = (result: unknown) => {
    from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = (...args: unknown[]) => {
        insert(...args);
        return chain;
      };
      chain.select = () => chain;
      chain.single = async () => result;
      return chain;
    });
  };

  describe("writing to a coach", () => {
    it("stamps the caller as the seeker and sends what they typed", async () => {
      wireInsert({ data: { id: ENQUIRY }, error: null });

      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/enquiries")
          .send({ providerId: PROVIDER, message: MESSAGE }),
      ).expect(201);

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          seeker_id: "user-1",
          provider_id: PROVIDER,
          message: MESSAGE,
          show_phone: false,
        }),
      );
      expect(res.body.enquiryId).toBe(ENQUIRY);
    });

    it("keeps the number private unless it is asked for", async () => {
      // Opt in, never a default, and per enquiry rather than per account.
      wireInsert({ data: { id: ENQUIRY }, error: null });

      await auth(
        request(app.getHttpServer())
          .post("/api/v1/enquiries")
          .send({ providerId: PROVIDER, message: MESSAGE, sharePhone: true }),
      ).expect(201);

      expect(insert.mock.calls[0][0].show_phone).toBe(true);
    });

    it("refuses a message too short to judge anybody on", async () => {
      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/enquiries")
          .send({ providerId: PROVIDER, message: "hi" }),
      ).expect(400);

      expect(res.body.message[0]).toContain("at least 20 characters");
      expect(from).not.toHaveBeenCalled();
    });

    it("turns the one-live index into a sentence", async () => {
      wireInsert({ data: null, error: { code: "23505", message: "duplicate key value" } });

      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/enquiries")
          .send({ providerId: PROVIDER, message: MESSAGE }),
      ).expect(400);

      expect(res.body.message).toBe("You already have a conversation open with this coach.");
    });

    it("turns the insert policy's refusal into something actionable", async () => {
      // Not a seeker, profile incomplete, or the coach is not approved.
      wireInsert({ data: null, error: { code: "42501", message: "new row violates policy" } });

      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/enquiries")
          .send({ providerId: PROVIDER, message: MESSAGE }),
      ).expect(403);

      expect(res.body.message).toBe("Finish your profile before writing to a coach.");
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/enquiries")
        .send({ providerId: PROVIDER, message: MESSAGE })
        .expect(401);
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("answering an approach", () => {
    it("accepts, and answers with the thread as it now reads", async () => {
      rpc.mockImplementation(async (fn: string) =>
        fn === "my_threads" ? { data: [threadRow], error: null } : { error: null },
      );

      const res = await auth(
        request(app.getHttpServer())
          .post(`/api/v1/enquiries/${ENQUIRY}/respond`)
          .send({ accept: true, sharePhone: true }),
      ).expect(201);

      expect(rpc).toHaveBeenCalledWith("respond_to_approach", {
        p_enquiry_id: ENQUIRY,
        p_accept: true,
        p_share_phone: true,
      });
      expect(res.body.threadId).toBe(ENQUIRY);
      expect(res.body.status).toBe("open");
    });

    it("returns a declined thread rather than treating it as a failure", async () => {
      // my_threads() has no status filter on its enquiry branch, so the row
      // still comes back — carrying the answer the client has to render.
      rpc.mockImplementation(async (fn: string) =>
        fn === "my_threads"
          ? { data: [{ ...threadRow, status: "declined" }], error: null }
          : { error: null },
      );

      const res = await auth(
        request(app.getHttpServer())
          .post(`/api/v1/enquiries/${ENQUIRY}/respond`)
          .send({ accept: false }),
      ).expect(201);

      expect(res.body.status).toBe("declined");
      expect(rpc.mock.calls[0][1].p_share_phone).toBe(false);
    });

    it("turns the function's refusal into a 403 carrying its sentence", async () => {
      rpc.mockResolvedValue({ error: { message: "That approach is not yours to answer." } });

      const res = await auth(
        request(app.getHttpServer())
          .post(`/api/v1/enquiries/${ENQUIRY}/respond`)
          .send({ accept: true }),
      ).expect(403);

      expect(res.body.message).toBe("That approach is not yours to answer.");
    });

    it("requires accept to be stated rather than guessed", async () => {
      await auth(
        request(app.getHttpServer()).post(`/api/v1/enquiries/${ENQUIRY}/respond`).send({}),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("taking an approach back", () => {
    it("deletes it and answers 204", async () => {
      rpc.mockResolvedValue({ error: null });

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/enquiries/${ENQUIRY}`),
      ).expect(204);

      expect(rpc).toHaveBeenCalledWith("withdraw_approach", { p_enquiry_id: ENQUIRY });
    });

    it("rejects an id that is not a uuid before asking the database", async () => {
      await auth(request(app.getHttpServer()).delete("/api/v1/enquiries/not-a-uuid")).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("the phone decision", () => {
    it("turns it on", async () => {
      rpc.mockImplementation(async (fn: string) =>
        fn === "my_threads" ? { data: [threadRow], error: null } : { error: null },
      );

      await auth(
        request(app.getHttpServer())
          .put(`/api/v1/enquiries/${ENQUIRY}/phone`)
          .send({ share: true }),
      ).expect(200);

      expect(rpc).toHaveBeenCalledWith("set_enquiry_phone_sharing", {
        p_enquiry_id: ENQUIRY,
        p_share: true,
      });
    });

    it("takes it back again, because it is revocable", async () => {
      rpc.mockImplementation(async (fn: string) =>
        fn === "my_threads" ? { data: [threadRow], error: null } : { error: null },
      );

      await auth(
        request(app.getHttpServer())
          .put(`/api/v1/enquiries/${ENQUIRY}/phone`)
          .send({ share: false }),
      ).expect(200);

      expect(rpc.mock.calls[0][1].p_share).toBe(false);
    });

    it("404s when the row is genuinely gone", async () => {
      rpc.mockImplementation(async (fn: string) =>
        fn === "my_threads" ? { data: [], error: null } : { error: null },
      );

      await auth(
        request(app.getHttpServer())
          .put(`/api/v1/enquiries/${ENQUIRY}/phone`)
          .send({ share: true }),
      ).expect(404);
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/enquiries/${ENQUIRY}/phone`)
        .send({ share: true })
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
