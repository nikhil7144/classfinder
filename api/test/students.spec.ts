import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { StudentsController } from "../src/students/students.controller";
import { StudentsService, toDemandRow } from "../src/students/students.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PROVIDER = "55555555-5555-4555-8555-555555555555";
const AREA = "44444444-4444-4444-8444-444444444444";

/** A row exactly as students_for_provider() returns it, bigint and all. */
const demandRow = {
  kind: "group",
  id: "88888888-8888-4888-8888-888888888888",
  service_category_ids: ["77777777-7777-4777-8777-777777777777"],
  service_names: ["Cricket"],
  service_groups: ["sport"],
  area_id: AREA,
  area_name: "Indirapuram",
  city_name: "Ghaziabad",
  distance_km: 1.8,
  learner_age: 11,
  level: "beginner",
  preferred_modes: ["own_centre"],
  preferred_days: ["sat", "sun"],
  preferred_time: "morning",
  budget_min: 1000,
  budget_max: 2000,
  budget_period: "per_month",
  notes: "Two boys from the same block.",
  student_count: 2,
  // bigint over PostgREST is a string.
  member_count: "2",
  expires_at: "2026-09-20T00:00:00.000Z",
  created_at: "2026-09-10T09:00:00.000Z",
  contact_status: null,
  thread_id: null,
};

describe("demand row mapping", () => {
  it("converts snake_case to the contract's camelCase", () => {
    const row = toDemandRow(demandRow);
    expect(row.serviceNames).toEqual(["Cricket"]);
    expect(row.areaName).toBe("Indirapuram");
    expect(row.learnerAge).toBe(11);
    expect(row.budgetPeriod).toBe("per_month");
    expect(row.createdAt).toBe("2026-09-10T09:00:00.000Z");
  });

  it("coerces the bigint member count to a number", () => {
    const row = toDemandRow(demandRow);
    expect(row.memberCount).toBe(2);
    expect(typeof row.memberCount).toBe("number");
  });

  it("counts default to zero rather than null, because blank reads as broken", () => {
    const row = toDemandRow({ ...demandRow, student_count: null, member_count: null });
    expect(row.studentCount).toBe(0);
    expect(row.memberCount).toBe(0);
  });

  it("defaults null arrays to empty ones", () => {
    const row = toDemandRow({
      ...demandRow,
      service_names: null,
      preferred_days: null,
      preferred_modes: null,
      service_category_ids: null,
      service_groups: null,
    });
    expect(row.serviceNames).toEqual([]);
    expect(row.preferredDays).toEqual([]);
    expect(row.preferredModes).toEqual([]);
  });

  it("keeps a null distance null rather than turning it into zero", () => {
    expect(toDemandRow({ ...demandRow, distance_km: null }).distanceKm).toBeNull();
  });

  it("carries no name, email or phone — there are no such columns to carry", () => {
    // The point of the demand feed: a coach sees the requirement, not the
    // family. Contact details arrive later and only if they are shared.
    const row = toDemandRow(demandRow) as unknown as Record<string, unknown>;
    for (const leaked of ["name", "displayName", "email", "phone"]) {
      expect(leaked in row).toBe(false);
    }
  });
});

describe("GET /api/v1/students", () => {
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
      controllers: [StudentsController],
      providers: [StudentsService, Reflector, { provide: SupabaseService, useValue: supabase }],
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

  const insertResult = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.insert = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.single = jest.fn(async () => result);
    return chain;
  };

  it("returns the coach's demand feed", async () => {
    rpc.mockResolvedValue({ data: [demandRow], error: null });

    const res = await auth(
      request(app.getHttpServer()).get(`/api/v1/students?providerId=${PROVIDER}`),
    ).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].memberCount).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      "students_for_provider",
      expect.objectContaining({ p_provider_id: PROVIDER, p_radius_km: 15, p_limit: 60 }),
    );
  });

  it("passes the filters through", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await auth(
      request(app.getHttpServer()).get(
        `/api/v1/students?providerId=${PROVIDER}&areaId=${AREA}&radiusKm=30&limit=10`,
      ),
    ).expect(200);

    expect(rpc).toHaveBeenCalledWith(
      "students_for_provider",
      expect.objectContaining({ p_area_id: AREA, p_radius_km: 30, p_limit: 10 }),
    );
  });

  it("refuses without a token", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/students?providerId=${PROVIDER}`)
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a providerId rather than guessing one", async () => {
    await auth(request(app.getHttpServer()).get("/api/v1/students")).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a providerId that is not a uuid before touching the database", async () => {
    await auth(request(app.getHttpServer()).get("/api/v1/students?providerId=mine")).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an undeclared query parameter", async () => {
    await auth(
      request(app.getHttpServer()).get(`/api/v1/students?providerId=${PROVIDER}&orderBy=age`),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a radius beyond the documented maximum", async () => {
    await auth(
      request(app.getHttpServer()).get(`/api/v1/students?providerId=${PROVIDER}&radiusKm=900`),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes another coach's listing id straight to the function, which refuses it", async () => {
    // Deliberately not re-checked here. students_for_provider() requires
    // p.user_id = auth.uid() in its first CTE, so somebody else's id returns
    // an empty list. A second ownership check in TypeScript would be a copy
    // that can disagree with the one actually enforcing it.
    rpc.mockResolvedValue({ data: [], error: null });

    const res = await auth(
      request(app.getHttpServer()).get(
        "/api/v1/students?providerId=99999999-9999-4999-8999-999999999999",
      ),
    ).expect(200);

    expect(res.body).toEqual([]);
  });

  describe("POST /:kind/:id/approach", () => {
    const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const pitch = { providerId: PROVIDER, message: "I coach cricket in Indirapuram on Saturdays." };

    it("writes a group pitch to group_requests", async () => {
      const chain = insertResult({ data: { id: "r1", status: "pending" }, error: null });
      from.mockReturnValue(chain);

      const res = await auth(
        request(app.getHttpServer()).post(`/api/v1/students/group/${TARGET}/approach`).send(pitch),
      ).expect(201);

      expect(from).toHaveBeenCalledWith("group_requests");
      expect(chain.insert).toHaveBeenCalledWith({
        group_id: TARGET,
        provider_id: PROVIDER,
        message: "I coach cricket in Indirapuram on Saturdays.",
      });
      expect(res.body.status).toBe("pending");
    });

    it("writes a cold approach to enquiries, pending and never open", async () => {
      // The consent rule. A check constraint refuses 'open' from a provider,
      // and this is the client-side half of the same decision.
      const chain = insertResult({ data: { id: "e1", status: "pending" }, error: null });
      from.mockReturnValue(chain);

      await auth(
        request(app.getHttpServer())
          .post(`/api/v1/students/student/${TARGET}/approach`)
          .send(pitch),
      ).expect(201);

      expect(from).toHaveBeenCalledWith("enquiries");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ initiated_by: "provider", status: "pending" }),
      );
    });

    it("refuses a pitch too short to judge anybody on", async () => {
      await auth(
        request(app.getHttpServer())
          .post(`/api/v1/students/group/${TARGET}/approach`)
          .send({ providerId: PROVIDER, message: "hi" }),
      ).expect(400);
      expect(from).not.toHaveBeenCalled();
    });

    it("explains a second approach rather than reporting a unique index", async () => {
      from.mockReturnValue(
        insertResult({ data: null, error: { code: "23505", message: 'duplicate key value' } }),
      );

      const res = await auth(
        request(app.getHttpServer()).post(`/api/v1/students/group/${TARGET}/approach`).send(pitch),
      ).expect(400);

      expect(res.body.message).toBe("You have already written to them.");
    });

    it("rejects a kind that is neither", async () => {
      await auth(
        request(app.getHttpServer()).post(`/api/v1/students/dm/${TARGET}/approach`).send(pitch),
      ).expect(400);
      expect(from).not.toHaveBeenCalled();
    });

    it("refuses without a token", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/students/group/${TARGET}/approach`)
        .send(pitch)
        .expect(401);
      expect(from).not.toHaveBeenCalled();
    });
  });
});
