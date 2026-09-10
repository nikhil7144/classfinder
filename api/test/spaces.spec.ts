import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SpacesController } from "../src/spaces/spaces.controller";
import { SpacesService, toFollowed, toPost, toSpace } from "../src/spaces/spaces.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PROVIDER = "55555555-5555-4555-8555-555555555555";
const SPACE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const POST = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** The jsonb get_space() builds. */
const spaceJson = {
  id: SPACE,
  provider_id: PROVIDER,
  display_name: "Krishna Sports Academy",
  photo_url: null,
  headline: "Cricket, six days a week",
  about: "Nets and match play.",
  category_name: "Academy",
  follower_count: "31",
  post_count: "12",
  i_follow: false,
  is_mine: false,
  is_suspended: false,
  suspended_reason: null,
};

/** A row as space_feed() returns it, bigints and all. */
const postRow = {
  id: POST,
  kind: "photo",
  body: "Footwork drill.",
  image_url: "https://example.test/a.jpg",
  youtube_id: null,
  created_at: "2026-09-10T09:00:00.000Z",
  is_hidden: false,
  hidden_reason: null,
  likes: "12",
  wows: "3",
  surprises: "0",
  my_reaction: "like",
  i_reported: false,
};

describe("space mapping", () => {
  it("converts the space to camelCase and coerces its counts", () => {
    const s = toSpace(spaceJson);
    expect(s.providerId).toBe(PROVIDER);
    expect(s.followerCount).toBe(31);
    expect(s.postCount).toBe(12);
    expect(typeof s.followerCount).toBe("number");
  });

  it("carries the suspension reason through as the function gave it", () => {
    // get_space nulls it for everyone but the owner. The mapper must not
    // invent a value or drop a real one.
    expect(toSpace({ ...spaceJson, is_suspended: true, suspended_reason: null }).suspendedReason)
      .toBeNull();
    expect(
      toSpace({ ...spaceJson, is_suspended: true, is_mine: true, suspended_reason: "Reported" })
        .suspendedReason,
    ).toBe("Reported");
  });

  it("converts a post and coerces its bigint reaction counts", () => {
    const p = toPost(postRow);
    expect(p.imageUrl).toBe("https://example.test/a.jpg");
    expect(p.likes).toBe(12);
    expect(p.wows).toBe(3);
    expect(p.surprises).toBe(0);
    expect(p.myReaction).toBe("like");
  });

  it("keeps an absent reaction null rather than undefined", () => {
    expect(toPost({ ...postRow, my_reaction: null }).myReaction).toBeNull();
  });

  it("converts a followed space", () => {
    const f = toFollowed({
      provider_id: PROVIDER,
      display_name: "Krishna",
      photo_url: null,
      headline: null,
      post_count: "4",
      followed_at: "2026-09-01T00:00:00.000Z",
    });
    expect(f.postCount).toBe(4);
    expect(f.followedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("/api/v1/spaces", () => {
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
      controllers: [SpacesController],
      providers: [SpacesService, Reflector, { provide: SupabaseService, useValue: supabase }],
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

  const query = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert", "upsert", "delete"]) chain[m] = jest.fn(() => chain);
    chain.single = jest.fn(async () => result);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };

  it("serves a Space signed out", async () => {
    rpc.mockResolvedValue({ data: spaceJson, error: null });

    const res = await request(app.getHttpServer()).get(`/api/v1/spaces/${PROVIDER}`).expect(200);

    expect(res.body.followerCount).toBe(31);
    expect(rpc).toHaveBeenCalledWith("get_space", { p_provider_id: PROVIDER });
  });

  it("turns an invisible Space into a 404", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await request(app.getHttpServer()).get(`/api/v1/spaces/${PROVIDER}`).expect(404);
    expect(res.body.message).toBe("No such Space.");
  });

  it("resolves the Space before asking for its posts", async () => {
    rpc
      .mockResolvedValueOnce({ data: spaceJson, error: null })
      .mockResolvedValueOnce({ data: [postRow], error: null });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/spaces/${PROVIDER}/posts?limit=5`)
      .expect(200);

    expect(res.body[0].likes).toBe(12);
    expect(rpc).toHaveBeenNthCalledWith(2, "space_feed", {
      p_space_id: SPACE,
      p_limit: 5,
      p_before: null,
    });
  });

  it("does not fetch posts for a Space that 404s", async () => {
    // The visibility check comes free with the resolve, and a client should
    // not be able to probe post counts for a suspended Space.
    rpc.mockResolvedValue({ data: null, error: null });

    await request(app.getHttpServer()).get(`/api/v1/spaces/${PROVIDER}/posts`).expect(404);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reads /following as the route and not as a coach id", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await auth(request(app.getHttpServer()).get("/api/v1/spaces/following")).expect(200);
    expect(rpc).toHaveBeenCalledWith("my_followed_spaces");
  });

  it("refuses the roster without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/spaces/following").expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sets a reaction through the definer function", async () => {
    rpc.mockResolvedValue({ error: null });

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/spaces/posts/${POST}/reaction`)
        .send({ reaction: "wow" }),
    ).expect(204);

    expect(rpc).toHaveBeenCalledWith("set_reaction", { p_post_id: POST, p_reaction: "wow" });
  });

  it("clears a reaction with null", async () => {
    rpc.mockResolvedValue({ error: null });

    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/spaces/posts/${POST}/reaction`)
        .send({ reaction: null }),
    ).expect(204);

    expect(rpc).toHaveBeenCalledWith("set_reaction", { p_post_id: POST, p_reaction: null });
  });

  it("refuses a reaction that is not one of the three", async () => {
    await auth(
      request(app.getHttpServer())
        .put(`/api/v1/spaces/posts/${POST}/reaction`)
        .send({ reaction: "angry" }),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a post to somebody else's Space", async () => {
    rpc.mockResolvedValue({ data: { ...spaceJson, is_mine: false }, error: null });

    const res = await auth(
      request(app.getHttpServer())
        .post(`/api/v1/spaces/${PROVIDER}/posts`)
        .send({ kind: "photo", imageUrl: "https://example.test/a.jpg" }),
    ).expect(403);

    expect(res.body.message).toBe("That is not your Space.");
    expect(from).not.toHaveBeenCalled();
  });

  it("posts to your own Space, and does not carry a video id on a photo", async () => {
    rpc.mockResolvedValue({ data: { ...spaceJson, is_mine: true }, error: null });
    const chain = query({ data: { ...postRow, my_reaction: null }, error: null });
    from.mockReturnValue(chain);

    await auth(
      request(app.getHttpServer()).post(`/api/v1/spaces/${PROVIDER}/posts`).send({
        kind: "photo",
        body: "  Footwork drill.  ",
        imageUrl: "https://example.test/a.jpg",
        youtubeId: "dQw4w9WgXcQ",
      }),
    ).expect(201);

    expect(chain.insert).toHaveBeenCalledWith({
      space_id: SPACE,
      kind: "photo",
      body: "Footwork drill.",
      image_url: "https://example.test/a.jpg",
      youtube_id: null,
    });
  });

  it("refuses a kind that is neither photo nor video", async () => {
    await auth(
      request(app.getHttpServer()).post(`/api/v1/spaces/${PROVIDER}/posts`).send({ kind: "poll" }),
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a youtube id that is not eleven characters", async () => {
    await auth(
      request(app.getHttpServer())
        .post(`/api/v1/spaces/${PROVIDER}/posts`)
        .send({ kind: "video", youtubeId: "too-short" }),
    ).expect(400);
  });

  it("following twice is following once", async () => {
    rpc.mockResolvedValue({ data: spaceJson, error: null });
    const chain = query({ error: null });
    from.mockReturnValue(chain);

    await auth(request(app.getHttpServer()).put(`/api/v1/spaces/${PROVIDER}/follow`)).expect(200);

    expect(chain.upsert).toHaveBeenCalledWith(
      { space_id: SPACE, user_id: "user-1" },
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("deleting somebody else's post is a 404, not a 403", async () => {
    // The row policy decides. Saying "forbidden" would confirm it exists.
    const chain = query({ data: [], error: null });
    from.mockReturnValue(chain);

    const res = await auth(
      request(app.getHttpServer()).delete(`/api/v1/spaces/posts/${POST}`),
    ).expect(404);

    expect(res.body.message).toBe("No such post.");
  });

  it("deletes your own post", async () => {
    const chain = query({ data: [{ id: POST }], error: null });
    from.mockReturnValue(chain);

    await auth(request(app.getHttpServer()).delete(`/api/v1/spaces/posts/${POST}`)).expect(204);
    expect(from).toHaveBeenCalledWith("space_posts");
  });
});
