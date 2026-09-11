import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AlertsController } from "../src/alerts/alerts.controller";
import { AlertsService, toAlerts } from "../src/alerts/alerts.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SupabaseService } from "../src/supabase/supabase.service";

const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** The jsonb my_alerts() builds. Every counter is a count(*), so a string. */
const alertsJson = {
  pending_pitches: "2",
  groups_needing_members: "1",
  accepted_pitches: "0",
  pending_approaches: "3",
  unread_threads: "4",
  unanswered_enquiries: "1",
  unread_queries: "2",
  needs_you: "5",
};

describe("alerts mapping", () => {
  it("converts to camelCase and coerces every bigint", () => {
    const a = toAlerts(alertsJson);
    expect(a.pendingPitches).toBe(2);
    expect(a.groupsNeedingMembers).toBe(1);
    expect(a.pendingApproaches).toBe(3);
    expect(a.unreadThreads).toBe(4);
    expect(a.unansweredEnquiries).toBe(1);
    expect(a.unreadQueries).toBe(2);
    expect(a.needsYou).toBe(5);
    expect(typeof a.needsYou).toBe("number");
  });

  it("gives zeroes rather than nulls for a caller with nothing waiting", () => {
    // A client should never have to branch on "no alerts yet"; a badge reads
    // the number and hides itself at zero.
    const a = toAlerts({});
    expect(a).toEqual({
      pendingPitches: 0,
      groupsNeedingMembers: 0,
      acceptedPitches: 0,
      pendingApproaches: 0,
      unreadThreads: 0,
      unansweredEnquiries: 0,
      unreadQueries: 0,
      needsYou: 0,
    });
  });
});

describe("/api/v1/alerts", () => {
  let app: INestApplication;
  const rpc = jest.fn();

  const auth = (req: request.Test) => req.set("Authorization", "Bearer good");

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ rpc }) as never,
      asUser: () => ({ rpc }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [AlertsService, Reflector, { provide: SupabaseService, useValue: supabase }],
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
  beforeEach(() => rpc.mockReset());

  it("answers with every counter", async () => {
    rpc.mockResolvedValue({ data: alertsJson, error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/alerts")).expect(200);

    expect(res.body.needsYou).toBe(5);
    // No arguments: the function resolves auth.uid() itself.
    expect(rpc).toHaveBeenCalledWith("my_alerts");
  });

  it("survives a null answer rather than 500ing on it", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/alerts")).expect(200);
    expect(res.body.needsYou).toBe(0);
  });

  it("refuses without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/alerts").expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears one conversation's notifications", async () => {
    rpc.mockResolvedValue({ error: null });

    await auth(
      request(app.getHttpServer()).post("/api/v1/alerts/read").send({ threadId: THREAD }),
    ).expect(204);

    expect(rpc).toHaveBeenCalledWith("mark_notifications_read", { p_thread_id: THREAD });
  });

  it("clears the lot when no thread is named", async () => {
    rpc.mockResolvedValue({ error: null });

    await auth(request(app.getHttpServer()).post("/api/v1/alerts/read").send({})).expect(204);

    expect(rpc).toHaveBeenCalledWith("mark_notifications_read", { p_thread_id: null });
  });

  it("rejects a threadId that is not a uuid", async () => {
    await auth(
      request(app.getHttpServer()).post("/api/v1/alerts/read").send({ threadId: "all" }),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
