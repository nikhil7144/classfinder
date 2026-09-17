import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { NotificationsController } from "../src/notifications/notifications.controller";
import {
  NotificationsService,
  toNotification,
  toSettings,
} from "../src/notifications/notifications.service";
import { DispatchController } from "../src/notify/dispatch.controller";
import { PushService } from "../src/notify/push.service";
import { SupabaseAdminService } from "../src/notify/supabase-admin.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const NOTIFICATION = "11111111-1111-4111-8111-111111111111";
const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "fcm-token-that-is-long-enough-to-pass";

const ROW = {
  id: NOTIFICATION,
  kind: "query_callback_scheduled",
  title: "Krishna will call you",
  body: "Thu 18 Sep, 04:30 pm",
  url: "/account/queries?query=6f1b",
  thread_kind: null,
  thread_id: null,
  created_at: "2026-09-17T10:00:00.000Z",
  read_at: null,
};

describe("notification mapping", () => {
  it("derives unread from read_at rather than making a client do it", () => {
    expect(toNotification(ROW).unread).toBe(true);
    expect(toNotification({ ...ROW, read_at: "2026-09-17T11:00:00.000Z" }).unread).toBe(false);
  });

  it("answers with defaults for somebody who has never opened the settings screen", () => {
    // A client should not have to treat "no row yet" as a separate case; that
    // is the whole reason the row is created on first change rather than at
    // signup.
    const s = toSettings(null);
    expect(s.pushEnabled).toBe(true);
    expect(s.emailEnabled).toBe(true);
    expect(s.mutedKinds).toEqual([]);
    expect(s.quietHoursStart).toBeNull();
    expect(s.timezone).toBe("Asia/Kolkata");
  });

  it("trims the seconds Postgres puts on a time", () => {
    // A settings screen shows HH:MM and sends HH:MM. Doing this in the API
    // rather than in two clients is the point of the tier.
    const s = toSettings({
      push_enabled: true,
      email_enabled: false,
      muted_kinds: ["entry_received"],
      quiet_hours_start: "22:00:00",
      quiet_hours_end: "07:00:00",
      timezone: "Asia/Kolkata",
    });
    expect(s.quietHoursStart).toBe("22:00");
    expect(s.quietHoursEnd).toBe("07:00");
    expect(s.mutedKinds).toEqual(["entry_received"]);
  });
});

describe("/api/v1/notifications", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const result = jest.fn();
  const calls: { method: string; args: unknown[] }[] = [];

  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "lt", "is", "eq", "upsert"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.single = () => result();
    chain.maybeSingle = () => result();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result());
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ from: builder }) as never,
      asUser: () => ({ from: builder, rpc }) as never,
      userFromToken: async (t: string) => (t === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [NotificationsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    rpc.mockReset();
    result.mockReset();
    calls.length = 0;
  });

  const auth = (r: request.Test) => r.set("Authorization", "Bearer good");

  it("refuses every private route without a token", async () => {
    const s = app.getHttpServer();
    await request(s).get("/api/v1/notifications").expect(401);
    await request(s).post("/api/v1/notifications/read").send({ all: true }).expect(401);
    await request(s).post("/api/v1/notifications/devices").send({}).expect(401);
    await request(s).get("/api/v1/notifications/settings").expect(401);
  });

  it("lets the channel table be read without an account", async () => {
    // A sign-in screen explaining what the app will send has nobody to be yet.
    result.mockReturnValue({
      data: [
        {
          kind: "entry_received",
          pushes: false,
          emails: true,
          audience: "provider",
          note: "Admin, and bursty.",
        },
      ],
      error: null,
    });

    const res = await request(app.getHttpServer()).get("/api/v1/notifications/channels").expect(200);
    expect(res.body[0]).toEqual({
      kind: "entry_received",
      pushes: false,
      emails: true,
      audience: "provider",
      note: "Admin, and bursty.",
    });
  });

  it("returns a page and says there is another", async () => {
    // The service asks for limit + 1 and hands back limit, which is how
    // "is there more" is answered without a second round trip.
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...ROW,
      id: `1111111${i}-1111-4111-8111-111111111111`,
      created_at: `2026-09-1${7 - i}T10:00:00.000Z`,
    }));
    result.mockReturnValue({ data: rows, error: null });

    const res = await auth(
      request(app.getHttpServer()).get("/api/v1/notifications?limit=2"),
    ).expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.unread).toBe(2);
    // The last returned item's timestamp, not the extra row's.
    expect(res.body.nextBefore).toBe("2026-09-16T10:00:00.000Z");
    expect(calls.find((c) => c.method === "limit")?.args[0]).toBe(3);
  });

  it("says there is no next page when the batch is short", async () => {
    result.mockReturnValue({ data: [ROW], error: null });

    const res = await auth(request(app.getHttpServer()).get("/api/v1/notifications")).expect(200);
    expect(res.body.nextBefore).toBeNull();
  });

  it("pages on time rather than an offset", async () => {
    result.mockReturnValue({ data: [], error: null });

    await auth(
      request(app.getHttpServer()).get(
        "/api/v1/notifications?before=2026-09-17T10:00:00.000Z&unreadOnly=true",
      ),
    ).expect(200);

    expect(calls.find((c) => c.method === "lt")?.args).toEqual([
      "created_at",
      "2026-09-17T10:00:00.000Z",
    ]);
    expect(calls.find((c) => c.method === "is")?.args).toEqual(["read_at", null]);
  });

  it("clears specific ones", async () => {
    rpc.mockResolvedValue({ error: null });
    result.mockReturnValue({ count: 4, error: null });

    const res = await auth(
      request(app.getHttpServer()).post("/api/v1/notifications/read").send({ ids: [NOTIFICATION] }),
    ).expect(201);

    expect(rpc).toHaveBeenCalledWith("mark_notifications_read_ids", { p_ids: [NOTIFICATION] });
    // The badge number comes back with the write, so a client does not have to
    // ask twice to redraw one number.
    expect(res.body.remaining).toBe(4);
  });

  it("prefers the narrowest reading when a client sends both", async () => {
    // Clearing the named ones is recoverable; clearing everything on a
    // mistaken `all` is not.
    rpc.mockResolvedValue({ error: null });
    result.mockReturnValue({ count: 0, error: null });

    await auth(
      request(app.getHttpServer())
        .post("/api/v1/notifications/read")
        .send({ ids: [NOTIFICATION], threadId: THREAD, all: true }),
    ).expect(201);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_notifications_read_ids", { p_ids: [NOTIFICATION] });
  });

  it("clears one conversation's", async () => {
    rpc.mockResolvedValue({ error: null });
    result.mockReturnValue({ count: 1, error: null });

    await auth(
      request(app.getHttpServer()).post("/api/v1/notifications/read").send({ threadId: THREAD }),
    ).expect(201);

    expect(rpc).toHaveBeenCalledWith("mark_notifications_read", { p_thread_id: THREAD });
  });

  it("refuses a body that says nothing rather than clearing the lot", async () => {
    await auth(request(app.getHttpServer()).post("/api/v1/notifications/read").send({})).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("registers a device", async () => {
    rpc.mockResolvedValue({ data: "device-1", error: null });

    const res = await auth(
      request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .send({ token: TOKEN, platform: "android", appFlavor: "provider", locale: "en-IN" }),
    ).expect(201);

    expect(res.body.id).toBe("device-1");
    expect(rpc).toHaveBeenCalledWith("register_device_token", {
      p_token: TOKEN,
      p_platform: "android",
      p_app_flavor: "provider",
      p_locale: "en-IN",
    });
  });

  it("refuses a flavour that is not one of the two apps", async () => {
    // The guard that stops a coach's phone being sent a parent's notification
    // because both apps happened to be installed.
    await auth(
      request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .send({ token: TOKEN, platform: "android", appFlavor: "admin" }),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a token too short to be a real one", async () => {
    await auth(
      request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .send({ token: "nope", platform: "ios", appFlavor: "seeker" }),
    ).expect(400);
  });

  it("forgets every device when no token is named", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });

    const res = await auth(
      request(app.getHttpServer()).post("/api/v1/notifications/devices/forget").send({}),
    ).expect(201);

    expect(res.body.forgotten).toBe(2);
    expect(rpc).toHaveBeenCalledWith("forget_device_token", { p_token: null });
  });

  it("never returns the tokens themselves", async () => {
    result.mockReturnValue({
      data: [
        {
          id: "device-1",
          platform: "ios",
          app_flavor: "provider",
          last_seen_at: "2026-09-17T09:00:00.000Z",
          disabled_reason: null,
          token: TOKEN,
        },
      ],
      error: null,
    });

    const res = await auth(
      request(app.getHttpServer()).get("/api/v1/notifications/devices"),
    ).expect(200);

    expect(res.body[0].appFlavor).toBe("provider");
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it("merges a partial settings change onto what is stored", async () => {
    // A real PATCH. An upsert of only the sent fields would quietly reset the
    // others to their defaults the first time somebody touched one switch.
    result
      .mockReturnValueOnce({
        data: {
          push_enabled: true,
          email_enabled: true,
          muted_kinds: ["entry_received"],
          quiet_hours_start: "22:00:00",
          quiet_hours_end: "07:00:00",
          timezone: "Asia/Kolkata",
        },
        error: null,
      })
      .mockReturnValue({
        data: {
          push_enabled: false,
          email_enabled: true,
          muted_kinds: ["entry_received"],
          quiet_hours_start: "22:00:00",
          quiet_hours_end: "07:00:00",
          timezone: "Asia/Kolkata",
        },
        error: null,
      });

    const res = await auth(
      request(app.getHttpServer()).patch("/api/v1/notifications/settings").send({ pushEnabled: false }),
    ).expect(200);

    const upsert = calls.find((c) => c.method === "upsert")?.args[0] as Record<string, unknown>;
    expect(upsert.push_enabled).toBe(false);
    expect(upsert.muted_kinds).toEqual(["entry_received"]);
    expect(upsert.quiet_hours_start).toBe("22:00");
    expect(res.body.mutedKinds).toEqual(["entry_received"]);
  });

  it("refuses half a quiet-hours window", async () => {
    result.mockReturnValue({ data: null, error: null });

    await auth(
      request(app.getHttpServer())
        .patch("/api/v1/notifications/settings")
        .send({ quietHoursStart: "22:00" }),
    ).expect(400);
  });

  it("refuses a muted kind the queue could never hold", async () => {
    await auth(
      request(app.getHttpServer())
        .patch("/api/v1/notifications/settings")
        .send({ mutedKinds: ["everything"] }),
    ).expect(400);
  });
});

describe("the push worker", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const send = jest.fn();

  const config = { get: (k: string) => (k === "NOTIFICATION_DISPATCH_SECRET" ? "s3cret" : undefined) };
  const admin = { configured: true, admin: () => ({ rpc }) };
  const push = { configured: true, send };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DispatchController],
      providers: [
        Reflector,
        { provide: ConfigService, useValue: config },
        { provide: SupabaseAdminService, useValue: admin },
        { provide: PushService, useValue: push },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    rpc.mockReset();
    send.mockReset();
  });

  const secret = (r: request.Test) => r.set("Authorization", "Bearer s3cret");

  it("refuses without the shared secret", async () => {
    await request(app.getHttpServer()).post("/api/v1/notify/dispatch").expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/notify/dispatch")
      .set("Authorization", "Bearer wrong")
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("queues due callbacks before sending, so a call in twenty minutes goes out now", async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === "queue_callback_reminders" ? { data: 2, error: null } : { data: [], error: null }),
    );

    const res = await secret(request(app.getHttpServer()).post("/api/v1/notify/dispatch")).expect(200);

    expect(rpc.mock.calls[0][0]).toBe("queue_callback_reminders");
    expect(rpc.mock.calls[1][0]).toBe("pending_push_notifications");
    expect(res.body.remindersQueued).toBe(2);
  });

  it("marks sent and disables the tokens FCM has given up on", async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "pending_push_notifications"
          ? {
              data: [
                {
                  id: NOTIFICATION,
                  recipient_id: "user-1",
                  kind: "message_received",
                  title: "New message from a parent",
                  body: "Is Saturday free?",
                  url: "/dashboard/messages?thread=x",
                  thread_kind: "enquiry",
                  thread_id: THREAD,
                  tokens: ["live-token", "dead-token"],
                },
              ],
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    send.mockResolvedValue({ sent: 1, dead: ["dead-token"], error: null });

    const res = await secret(request(app.getHttpServer()).post("/api/v1/notify/dispatch")).expect(200);

    expect(res.body).toMatchObject({ considered: 1, sent: 1, failed: 0, tokensDisabled: 1 });
    expect(rpc).toHaveBeenCalledWith("mark_push_sent", { p_id: NOTIFICATION, p_error: null });
    expect(rpc).toHaveBeenCalledWith("disable_device_tokens", {
      p_tokens: ["dead-token"],
      p_reason: "unregistered with FCM",
    });
  });

  it("counts a notification whose every device is gone as delivered", async () => {
    // There is nowhere left to send it. Retrying twice more would park the row
    // with an error that misdescribes what happened.
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "pending_push_notifications"
          ? {
              data: [
                {
                  id: NOTIFICATION,
                  recipient_id: "user-1",
                  kind: "query_received",
                  title: "New query",
                  body: null,
                  url: "/dashboard/queries",
                  thread_kind: null,
                  thread_id: null,
                  tokens: ["gone"],
                },
              ],
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    send.mockResolvedValue({ sent: 0, dead: ["gone"], error: null });

    const res = await secret(request(app.getHttpServer()).post("/api/v1/notify/dispatch")).expect(200);

    expect(res.body.sent).toBe(1);
    expect(rpc).toHaveBeenCalledWith("mark_push_sent", { p_id: NOTIFICATION, p_error: null });
  });

  it("reports what is missing rather than burning attempts on rows it cannot send", async () => {
    const unconfigured = await Test.createTestingModule({
      controllers: [DispatchController],
      providers: [
        Reflector,
        { provide: ConfigService, useValue: config },
        { provide: SupabaseAdminService, useValue: { configured: true, admin: () => ({ rpc }) } },
        { provide: PushService, useValue: { configured: false, send } },
      ],
    }).compile();

    const other = unconfigured.createNestApplication();
    configureApp(other);
    await other.init();

    await secret(request(other.getHttpServer()).post("/api/v1/notify/dispatch")).expect(503);
    const status = await secret(request(other.getHttpServer()).get("/api/v1/notify/status")).expect(200);
    expect(status.body.ready).toBe(false);
    expect(status.body.firebase).toBe(false);
    expect(rpc).not.toHaveBeenCalled();

    await other.close();
  });
});
