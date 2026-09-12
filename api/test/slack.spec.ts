import { SlackService } from "../src/notify/slack.service";

/**
 * Telling the team something happened.
 *
 * The one rule worth testing is the one that matters when it is three in the
 * morning and Slack is down: nothing here may ever throw, and nothing may ever
 * reach the person whose save triggered it.
 */
describe("SlackService", () => {
  const original = process.env.SLACK_WEBHOOK_URL;
  let slack: SlackService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    slack = new SlackService();
    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as never);
    global.fetch = fetchMock as unknown as typeof fetch;
    // Quiet: the service logs a warning on every failure, which is the point,
    // but it should not print through the test output.
    jest.spyOn(slack["log"], "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.SLACK_WEBHOOK_URL = original;
    jest.restoreAllMocks();
  });

  /** Lets the fire-and-forget promise settle before asserting on it. */
  const settle = () => new Promise((r) => setImmediate(r));

  describe("when no webhook is set", () => {
    beforeEach(() => delete process.env.SLACK_WEBHOOK_URL);

    it("reports itself unconfigured", () => {
      expect(slack.configured).toBe(false);
    });

    it("says nothing, and does not reach for the network", async () => {
      // Development and tests both run this way.
      slack.send("anything");
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("treats an empty or blank url as unset", () => {
      process.env.SLACK_WEBHOOK_URL = "   ";
      expect(new SlackService().configured).toBe(false);
    });
  });

  describe("when a webhook is set", () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/services/x";
    });

    it("posts json to the webhook", async () => {
      slack.send("hello");
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://hooks.slack.test/services/x");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ text: "hello" });
    });

    it("always sends text alongside blocks", async () => {
      // `text` is the fallback Slack shows in a notification and in clients
      // that cannot render blocks, so dropping it would make a push alert say
      // nothing at all.
      slack.send("fallback", [{ type: "section" }]);
      await settle();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toBe("fallback");
      expect(body.blocks).toHaveLength(1);
    });

    it("does not throw when Slack refuses the message", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 429 } as never);

      expect(() => slack.send("hello")).not.toThrow();
      await settle();
    });

    it("does not throw when Slack cannot be reached at all", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      expect(() => slack.send("hello")).not.toThrow();
      await settle();
    });

    it("returns before the request does, so nobody waits on it", () => {
      // send() is void and fire-and-forget: a coach finishing a listing must
      // not pay for a webhook round trip.
      let settled = false;
      fetchMock.mockImplementation(
        () => new Promise((r) => setTimeout(() => { settled = true; r({ ok: true } as never); }, 50)),
      );

      slack.send("hello");
      expect(settled).toBe(false);
    });
  });

  describe("the two registration messages", () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/services/x";
    });

    it("names a coach, their type and where they are", async () => {
      slack.providerRegistered({
        name: "Krishna Sports Academy",
        providerType: "institution",
        area: "Indirapuram, Ghaziabad",
        phone: "9876543210",
      });
      await settle();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain("Krishna Sports Academy");
      expect(body.text).toContain("institution");
      expect(body.text).toContain("Indirapuram, Ghaziabad");
      expect(body.blocks[0].text.text).toContain("waiting for approval");
    });

    it("says so plainly when a coach gave no area", async () => {
      slack.providerRegistered({
        name: null,
        providerType: "individual",
        area: null,
        phone: null,
      });
      await settle();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain("Unnamed");
      expect(body.text).toContain("area not given");
    });

    it("tells the team whether a family is reachable by any coach", async () => {
      // openToOffers off means no coach will ever see them, which changes what
      // the number means.
      slack.seekerRegistered({
        name: "Nikhil",
        area: "Vijay Nagar, Indore",
        lookingFor: 2,
        openToOffers: false,
      });
      await settle();

      const text = JSON.parse(fetchMock.mock.calls[0][1].body).blocks[0].text.text;
      expect(text).toContain("Nikhil");
      expect(text).toContain("2 things on their list");
      expect(text).toContain("not open to coaches");
    });

    it("gets the singular right for one thing", async () => {
      slack.seekerRegistered({
        name: "Asha",
        area: "Vijay Nagar",
        lookingFor: 1,
        openToOffers: true,
      });
      await settle();

      const text = JSON.parse(fetchMock.mock.calls[0][1].body).blocks[0].text.text;
      expect(text).toContain("1 thing on their list");
      expect(text).toContain("open to coaches");
    });
  });
});
