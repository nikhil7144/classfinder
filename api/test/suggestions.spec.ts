import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../src/auth/auth.guard";
import { configureApp } from "../src/configure";
import { SuggestionsController } from "../src/suggestions/suggestions.controller";
import { SuggestionsService } from "../src/suggestions/suggestions.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PROVIDER = "22222222-2222-4222-8222-222222222222";

/**
 * These cover the envelope, not the model.
 *
 * Whether a ranking is any good is not something a test can assert, and
 * calling Gemini from CI would be slow, costly and flaky. What matters here is
 * everything around it: who is refused, what is validated before a model call
 * can be reached, and the short-circuits that must return without spending one.
 */
describe("POST /api/v1/suggestions", () => {
  let app: INestApplication;
  const from = jest.fn();
  const rpc = jest.fn();

  // A chainable stub of the query builder, resolving to whatever the test set.
  const table = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => result;
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };

  beforeAll(async () => {
    const supabase: Partial<SupabaseService> = {
      anon: () => ({ from, rpc }) as never,
      asUser: () => ({ from, rpc }) as never,
      userFromToken: async (token: string) => (token === "good" ? { id: "user-1" } : null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SuggestionsController],
      providers: [SuggestionsService, Reflector, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(SupabaseService)));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  const post = (path: string, body?: object) => {
    const req = request(app.getHttpServer()).post(`/api/v1/suggestions/${path}`);
    return body ? req.send(body) : req;
  };

  it("refuses both endpoints without a token", async () => {
    await post("coaches").expect(401);
    await post("students", { providerId: PROVIDER }).expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tells a coach they are not a seeker rather than inviting a requirement", async () => {
    from.mockImplementation(() => table({ data: { role: "provider" } }));

    const res = await post("coaches").set("Authorization", "Bearer good").expect(201);

    expect(res.body).toEqual({ suggestions: [], ranked: false, reason: "not_a_seeker" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports no_requirement when the parent has not said what they want", async () => {
    from.mockImplementation((name: string) =>
      table(
        name === "profiles"
          ? { data: { role: "seeker" } }
          : { data: { looking_for: [], area_id: null } },
      ),
    );

    const res = await post("coaches").set("Authorization", "Bearer good").expect(201);

    expect(res.body.reason).toBe("no_requirement");
    // The short-circuits exist to avoid paying for a model call.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports no_origin when neither the seeker nor their area has coordinates", async () => {
    from.mockImplementation((name: string) =>
      table(
        name === "profiles"
          ? { data: { role: "seeker" } }
          : name === "seekers"
            ? { data: { looking_for: ["s1"], area_id: "a1", lat: null, lng: null } }
            : { data: { lat: null, lng: null } },
      ),
    );

    const res = await post("coaches").set("Authorization", "Bearer good").expect(201);

    expect(res.body.reason).toBe("no_origin");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a students request with no providerId", async () => {
    await post("students", {}).set("Authorization", "Bearer good").expect(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a providerId that is not a uuid", async () => {
    await post("students", { providerId: "mine" }).set("Authorization", "Bearer good").expect(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an undeclared field rather than forwarding it", async () => {
    await post("students", { providerId: PROVIDER, limit: 500 })
      .set("Authorization", "Bearer good")
      .expect(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a listing that is not the caller's", async () => {
    from.mockImplementation(() => table({ data: null }));

    const res = await post("students", { providerId: PROVIDER })
      .set("Authorization", "Bearer good")
      .expect(201);

    expect(res.body).toEqual({ suggestions: [], reason: "not_a_provider" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not rank a feed that is mostly already contacted", async () => {
    from.mockImplementation(() => table({ data: { id: PROVIDER, provider_type: "individual" } }));
    // Four rows, but three already written to — below the threshold once
    // untouched rows are counted, which is the number that matters.
    rpc.mockResolvedValue({
      data: [
        { kind: "seeker", id: "1", contact_status: null },
        { kind: "seeker", id: "2", contact_status: "open" },
        { kind: "seeker", id: "3", contact_status: "open" },
        { kind: "group", id: "4", contact_status: "declined" },
      ],
      error: null,
    });

    const res = await post("students", { providerId: PROVIDER })
      .set("Authorization", "Bearer good")
      .expect(201);

    expect(res.body).toEqual({ suggestions: [], reason: "no_demand" });
    // students_for_provider only — no metering, because nothing was spent.
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
