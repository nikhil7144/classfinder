import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { FeedsController } from "../src/feeds/feeds.controller";
import { FeedsService, toCity, toFeedPost } from "../src/feeds/feeds.service";
import { SupabaseService } from "../src/supabase/supabase.service";

/** A row exactly as phase3b's public_city_feed returns it, bigints and all. */
const dbRow = {
  id: "11111111-1111-4111-8111-111111111111",
  provider_id: "22222222-2222-4222-8222-222222222222",
  display_name: "Krishna",
  photo_url: null,
  category_name: "Coach",
  kind: "photo" as const,
  body: "Footwork drill from this morning.",
  image_url: "https://example.test/a.jpg",
  youtube_id: null,
  created_at: "2026-09-01T10:00:00.000Z",
  // PostgREST serialises bigint as a string. The mapper has to cope.
  likes: "12",
  wows: "3",
  surprises: "0",
};

describe("feed row mapping", () => {
  it("converts snake_case to the contract's camelCase", () => {
    const post = toFeedPost(dbRow);
    expect(post.providerId).toBe(dbRow.provider_id);
    expect(post.displayName).toBe("Krishna");
    expect(post.imageUrl).toBe("https://example.test/a.jpg");
    expect(post.createdAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("coerces bigint counts to numbers", () => {
    const post = toFeedPost(dbRow);
    expect(post.likes).toBe(12);
    expect(post.wows).toBe(3);
    expect(post.surprises).toBe(0);
    expect(typeof post.likes).toBe("number");
  });

  it("omits caller-specific fields the public feed cannot know", () => {
    const post = toFeedPost(dbRow);
    expect("myReaction" in post).toBe(false);
    expect("reason" in post).toBe(false);
  });

  it("keeps a null reaction distinct from an absent one", () => {
    const post = toFeedPost({ ...dbRow, my_reaction: null, reason: "following" });
    expect("myReaction" in post).toBe(true);
    expect(post.myReaction).toBeNull();
    expect(post.reason).toBe("following");
  });

  it("maps a city, coach count included", () => {
    expect(toCity({ id: "c", name: "Indore", state: "MP", coach_count: "7" })).toEqual({
      id: "c",
      name: "Indore",
      state: "MP",
      coachCount: 7,
    });
  });
});

describe("GET /api/v1/feeds", () => {
  let app: INestApplication;
  const rpc = jest.fn();

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ rpc }) as never,
      asUser: () => ({ rpc }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FeedsController],
      providers: [
        FeedsService,
        Reflector,
        { provide: SupabaseService, useValue: supabase },
        { provide: "APP_GUARD", useClass: AuthGuard },
      ],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabase)
      .compile();

    app = moduleRef.createNestApplication();
    // The real prefix, versioning and validation pipe — testing against a
    // differently configured app would prove nothing about the served one.
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => rpc.mockReset());

  it("serves the city feed without a token", async () => {
    rpc.mockResolvedValue({ data: [dbRow], error: null });

    const res = await request(app.getHttpServer())
      .get("/api/v1/feeds/cities/33333333-3333-4333-8333-333333333333")
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].likes).toBe(12);
    expect(rpc).toHaveBeenCalledWith("public_city_feed", expect.objectContaining({ p_limit: 24 }));
  });

  it("rejects a city id that is not a uuid before touching the database", async () => {
    await request(app.getHttpServer()).get("/api/v1/feeds/cities/not-a-uuid").expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an undeclared query parameter", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/feeds/cities/33333333-3333-4333-8333-333333333333?orderBy=likes")
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a limit above the documented maximum", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/feeds/cities/33333333-3333-4333-8333-333333333333?limit=500")
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses the personal feed without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/feeds/me").expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses the personal feed with a token Supabase does not recognise", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/feeds/me")
      .set("Authorization", "Bearer stale")
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serves the personal feed to a signed-in caller", async () => {
    rpc.mockResolvedValue({
      data: [{ ...dbRow, my_reaction: "like", i_reported: false, reason: "following" }],
      error: null,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/feeds/me?limit=5")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(res.body[0].reason).toBe("following");
    expect(res.body[0].myReaction).toBe("like");
    expect(rpc).toHaveBeenCalledWith("my_space_feed", { p_limit: 5, p_before: null });
  });

  it("passes a cursor through to the database", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await request(app.getHttpServer())
      .get("/api/v1/feeds/me?before=2026-09-01T10:00:00.000Z")
      .set("Authorization", "Bearer good")
      .expect(200);

    expect(rpc).toHaveBeenCalledWith(
      "my_space_feed",
      expect.objectContaining({ p_before: "2026-09-01T10:00:00.000Z" }),
    );
  });
});
