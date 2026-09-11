import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SupabaseService } from "../src/supabase/supabase.service";
import { TrialsController } from "../src/trials/trials.controller";
import { TrialsService } from "../src/trials/trials.service";

const THREAD = "11111111-1111-4111-8111-111111111111";
const TRIAL = "22222222-2222-4222-8222-222222222222";

/** A row exactly as thread_trials() returns it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: TRIAL,
  scheduled_at: "2026-09-20T10:00:00.000Z",
  duration_minutes: 60,
  place: "own_centre",
  place_label: "At the centre",
  place_note: "Gate 3, ask for Krishna",
  student_count: null,
  status: "proposed",
  proposed_by: "user-1",
  i_proposed: true,
  seeker_outcome: null,
  provider_outcome: null,
  my_outcome: null,
  created_at: "2026-09-12T10:00:00.000Z",
  ...over,
});

const REF = { kind: "enquiry", threadId: THREAD };

describe("/api/v1/trials", () => {
  let app: INestApplication;
  const rpc = jest.fn();

  const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

  beforeAll(async () => {
    const client = { rpc };
    const supabase: Partial<SupabaseService> = {
      anon: () => client as never,
      asUser: () => client as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TrialsController],
      providers: [TrialsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => rpc.mockReset());

  /** thread_trials answers the list; everything else answers ok. */
  const wire = (rows: unknown[]) => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "thread_trials" ? { data: rows, error: null } : { data: TRIAL, error: null },
    );
  };

  describe("reading a thread's trials", () => {
    it("maps every column to the contract's names", async () => {
      wire([row()]);

      const res = await auth(
        request(app.getHttpServer()).get(`/api/v1/trials?kind=enquiry&threadId=${THREAD}`),
      ).expect(200);

      expect(rpc).toHaveBeenCalledWith("thread_trials", {
        p_kind: "enquiry",
        p_thread_id: THREAD,
      });
      expect(res.body[0].durationMinutes).toBe(60);
      expect(res.body[0].placeLabel).toBe("At the centre");
      expect(res.body[0].iProposed).toBe(true);
      expect(res.body[0].myOutcome).toBeNull();
    });

    it("answers empty for a thread the caller is not in", async () => {
      // thread_trials restricts itself to participants, so this is what an id
      // belonging to somebody else looks like — not an error to interpret.
      wire([]);

      const res = await auth(
        request(app.getHttpServer()).get(`/api/v1/trials?kind=group&threadId=${THREAD}`),
      ).expect(200);

      expect(res.body).toEqual([]);
    });

    it("refuses a kind that is not one of the two", async () => {
      await auth(
        request(app.getHttpServer()).get(`/api/v1/trials?kind=carrier-pigeon&threadId=${THREAD}`),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/trials?kind=enquiry&threadId=${THREAD}`)
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("proposing one", () => {
    it("passes the whole arrangement and reads it back", async () => {
      wire([row()]);

      const res = await auth(
        request(app.getHttpServer()).post("/api/v1/trials").send({
          ...REF,
          scheduledAt: "2026-09-20T10:00:00.000Z",
          durationMinutes: 45,
          place: "own_centre",
          placeNote: "Gate 3, ask for Krishna",
        }),
      ).expect(201);

      expect(rpc).toHaveBeenCalledWith("propose_trial", {
        p_kind: "enquiry",
        p_thread_id: THREAD,
        p_scheduled_at: "2026-09-20T10:00:00.000Z",
        p_duration_minutes: 45,
        p_place: "own_centre",
        p_place_note: "Gate 3, ask for Krishna",
        p_student_count: null,
      });
      expect(res.body.id).toBe(TRIAL);
    });

    it("defaults an hour when nobody says how long", async () => {
      wire([row()]);

      await auth(
        request(app.getHttpServer())
          .post("/api/v1/trials")
          .send({ ...REF, scheduledAt: "2026-09-20T10:00:00.000Z" }),
      ).expect(201);

      expect(rpc.mock.calls[0][1].p_duration_minutes).toBe(60);
    });

    it("refuses a length nobody would book", async () => {
      for (const durationMinutes of [5, 600]) {
        await auth(
          request(app.getHttpServer())
            .post("/api/v1/trials")
            .send({ ...REF, scheduledAt: "2026-09-20T10:00:00.000Z", durationMinutes }),
        ).expect(400);
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a date that is not one", async () => {
      await auth(
        request(app.getHttpServer())
          .post("/api/v1/trials")
          .send({ ...REF, scheduledAt: "next tuesday" }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("turns the function's refusal into a 403 carrying its sentence", async () => {
      rpc.mockResolvedValue({ data: null, error: { message: "That conversation is closed." } });

      const res = await auth(
        request(app.getHttpServer())
          .post("/api/v1/trials")
          .send({ ...REF, scheduledAt: "2026-09-20T10:00:00.000Z" }),
      ).expect(403);

      expect(res.body.message).toBe("That conversation is closed.");
    });
  });

  describe("answering one", () => {
    it("confirms and answers with the trial as it now reads", async () => {
      wire([row({ status: "confirmed", i_proposed: false })]);

      const res = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/trials/${TRIAL}`)
          .send({ ...REF, status: "confirmed" }),
      ).expect(200);

      expect(rpc).toHaveBeenCalledWith("respond_to_trial", {
        p_trial_id: TRIAL,
        p_status: "confirmed",
      });
      expect(res.body.status).toBe("confirmed");
    });

    it("refuses a status that is not yes or no", async () => {
      // 'proposed' is a real trial status but not a real answer to one.
      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/trials/${TRIAL}`)
          .send({ ...REF, status: "proposed" }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("404s when the trial is no longer in the thread", async () => {
      wire([]);

      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/trials/${TRIAL}`)
          .send({ ...REF, status: "confirmed" }),
      ).expect(404);
    });
  });

  describe("recording what happened", () => {
    it("keeps the two sides' answers apart", async () => {
      // A coach marking a no-show must not put that on the family's record.
      wire([row({ status: "confirmed", provider_outcome: "no_show", my_outcome: "no_show" })]);

      const res = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/trials/${TRIAL}/outcome`)
          .send({ ...REF, outcome: "no_show" }),
      ).expect(200);

      expect(rpc).toHaveBeenCalledWith("mark_trial_outcome", {
        p_trial_id: TRIAL,
        p_outcome: "no_show",
      });
      expect(res.body.providerOutcome).toBe("no_show");
      expect(res.body.seekerOutcome).toBeNull();
      expect(res.body.myOutcome).toBe("no_show");
    });

    it("refuses an outcome nobody has heard of", async () => {
      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/trials/${TRIAL}/outcome`)
          .send({ ...REF, outcome: "went_alright" }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/trials/${TRIAL}/outcome`)
        .send({ ...REF, outcome: "happened" })
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
