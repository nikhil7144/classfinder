import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SeekersController } from "../src/seekers/seekers.controller";
import { SeekersService } from "../src/seekers/seekers.service";
import { SlackService } from "../src/notify/slack.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const AREA = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";

/** A row exactly as the seekers table returns it. */
const ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Nikhil",
  relation_to_learner: "father",
  area_id: AREA,
  lat: 28.6,
  lng: 77.3,
  photo_url: null,
  looking_for: [SERVICE],
  learner_age: 12,
  level: "beginner",
  preferred_modes: ["own_centre"],
  preferred_days: ["sat", "sun"],
  preferred_time: "weekend",
  budget_min: 1500,
  budget_max: 3000,
  budget_period: "per_month",
  requirement_notes: "My son is 12 and has never played before.",
  open_to_offers: true,
  marketing_opt_in: false,
  requirement_updated_at: "2026-09-12T10:00:00.000Z",
};

/** The minimum the contract accepts. */
const VALID = {
  name: "Nikhil",
  relationToLearner: "father",
  areaId: AREA,
};

describe("/api/v1/seekers/me", () => {
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
      controllers: [SeekersController],
      providers: [SeekersService, Reflector, SlackService, { provide: SupabaseService, useValue: supabase }],
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
  });

  /** seekers and profiles are read together; this answers both by table name. */
  const wire = (seeker: unknown, profileComplete = true) => {
    from.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () => ({
        data: table === "seekers" ? seeker : { profile_complete: profileComplete },
        error: null,
      }));
      return chain;
    });
  };

  describe("reading it", () => {
    it("maps every column to the contract's names", async () => {
      wire(ROW);

      const res = await auth(request(app.getHttpServer()).get("/api/v1/seekers/me")).expect(200);

      expect(res.body.relationToLearner).toBe("father");
      expect(res.body.areaId).toBe(AREA);
      expect(res.body.lookingFor).toEqual([SERVICE]);
      expect(res.body.learnerAge).toBe(12);
      expect(res.body.preferredDays).toEqual(["sat", "sun"]);
      expect(res.body.budgetPeriod).toBe("per_month");
      expect(res.body.openToOffers).toBe(true);
      expect(res.body.marketingOptIn).toBe(false);
    });

    it("reports profile_complete from profiles, not from the seeker row", async () => {
      wire(ROW, false);

      const res = await auth(request(app.getHttpServer()).get("/api/v1/seekers/me")).expect(200);
      expect(res.body.profileComplete).toBe(false);
    });

    it("answers 404 for a family who has not started one", async () => {
      // The expected state, not an error: the account exists from the moment a
      // role is chosen and the row is written by the first save.
      wire(null);

      await auth(request(app.getHttpServer()).get("/api/v1/seekers/me")).expect(404);
    });

    it("survives null arrays rather than handing a client a null list", async () => {
      wire({ ...ROW, looking_for: null, preferred_modes: null, preferred_days: null });

      const res = await auth(request(app.getHttpServer()).get("/api/v1/seekers/me")).expect(200);
      expect(res.body.lookingFor).toEqual([]);
      expect(res.body.preferredModes).toEqual([]);
      expect(res.body.preferredDays).toEqual([]);
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer()).get("/api/v1/seekers/me").expect(401);
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("saving it", () => {
    it("snake_cases the payload and answers with the whole profile", async () => {
      rpc.mockResolvedValue({ data: ROW.id, error: null });
      wire(ROW);

      const res = await auth(
        request(app.getHttpServer()).put("/api/v1/seekers/me").send({
          ...VALID,
          lookingFor: [SERVICE],
          learnerAge: 12,
          budgetPeriod: "per_month",
        }),
      ).expect(200);

      const payload = rpc.mock.calls[0][1].p_profile;
      expect(payload.relation_to_learner).toBe("father");
      expect(payload.area_id).toBe(AREA);
      expect(payload.looking_for).toEqual([SERVICE]);
      expect(payload.learner_age).toBe(12);
      expect(payload.budget_period).toBe("per_month");
      expect(res.body.name).toBe("Nikhil");
    });

    it("defaults open_to_offers on and marketing off", async () => {
      // Two consent switches pointing opposite ways, both deliberate: a parent
      // who has typed out what they want has asked to be found; nobody has
      // asked for marketing.
      rpc.mockResolvedValue({ data: ROW.id, error: null });
      wire(ROW);

      await auth(request(app.getHttpServer()).put("/api/v1/seekers/me").send(VALID)).expect(200);

      const payload = rpc.mock.calls[0][1].p_profile;
      expect(payload.open_to_offers).toBe(true);
      expect(payload.marketing_opt_in).toBe(false);
    });

    it("honours open_to_offers being turned off", async () => {
      rpc.mockResolvedValue({ data: ROW.id, error: null });
      wire(ROW);

      await auth(
        request(app.getHttpServer())
          .put("/api/v1/seekers/me")
          .send({ ...VALID, openToOffers: false }),
      ).expect(200);

      expect(rpc.mock.calls[0][1].p_profile.open_to_offers).toBe(false);
    });

    it("sends an empty note as null rather than an empty string", async () => {
      rpc.mockResolvedValue({ data: ROW.id, error: null });
      wire(ROW);

      await auth(
        request(app.getHttpServer())
          .put("/api/v1/seekers/me")
          .send({ ...VALID, requirementNotes: "   " }),
      ).expect(200);

      expect(rpc.mock.calls[0][1].p_profile.requirement_notes).toBeNull();
    });

    it("requires who they are looking for", async () => {
      const res = await auth(
        request(app.getHttpServer())
          .put("/api/v1/seekers/me")
          .send({ name: "Nikhil", areaId: AREA }),
      ).expect(400);

      expect(res.body.message[0]).toBe("Tell us who you are looking for.");
      expect(rpc).not.toHaveBeenCalled();
    });

    it("requires an area, which is what search is centred on", async () => {
      await auth(
        request(app.getHttpServer())
          .put("/api/v1/seekers/me")
          .send({ name: "Nikhil", relationToLearner: "father" }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a level or period nobody has heard of", async () => {
      for (const body of [
        { ...VALID, level: "expert" },
        { ...VALID, budgetPeriod: "per_fortnight" },
        { ...VALID, preferredTime: "whenever" },
        { ...VALID, relationToLearner: "uncle" },
      ]) {
        await auth(request(app.getHttpServer()).put("/api/v1/seekers/me").send(body)).expect(400);
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a learner age outside what the constraint allows", async () => {
      await auth(
        request(app.getHttpServer()).put("/api/v1/seekers/me").send({ ...VALID, learnerAge: 1 }),
      ).expect(400);
      await auth(
        request(app.getHttpServer()).put("/api/v1/seekers/me").send({ ...VALID, learnerAge: 120 }),
      ).expect(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("turns the function's refusal into a 400 carrying its sentence", async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", message: "This account is not a family account." },
      });

      const res = await auth(
        request(app.getHttpServer()).put("/api/v1/seekers/me").send(VALID),
      ).expect(400);

      expect(res.body.message).toBe("This account is not a family account.");
    });

    it("turns phase3r's trigger into a 400 too", async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: "23514", message: "This account is a provider, so it cannot have a seeker profile." },
      });

      await auth(request(app.getHttpServer()).put("/api/v1/seekers/me").send(VALID)).expect(400);
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer()).put("/api/v1/seekers/me").send(VALID).expect(401);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
