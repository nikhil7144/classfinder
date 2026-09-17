import { createSign } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Sending a push, over FCM's HTTP v1 API.
 *
 * **iOS goes through Firebase too.** APNs is a second protocol, a second
 * credential to rotate and a second thing to be woken up by; Firebase already
 * speaks it, and the cost of that choice is one field in the console rather
 * than a file in here.
 *
 * **No firebase-admin dependency.** All this needs is an RS256 JWT and two
 * HTTP calls, both of which Node does out of the box. The SDK would bring a
 * transitive tree and a service account loaded from a path, in exchange for
 * the fifty lines below.
 *
 * Credentials come from the environment as a service account JSON — either
 * raw or base64, because a private key with newlines in it survives exactly
 * one of the hosting dashboards it will be pasted into.
 */

export type PushMessage = {
  title: string;
  body: string | null;
  /** The web path the notification points at. The app maps it to its route. */
  url: string;
  kind: string;
  threadKind?: string | null;
  threadId?: string | null;
};

export type PushResult = {
  sent: number;
  /** Tokens FCM says are gone. The caller disables them. */
  dead: string[];
  /** Set when every token failed for a reason that is worth retrying. */
  error: string | null;
};

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const OAUTH_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** Google's tokens last an hour; a minute of slack avoids a race at the edge. */
const TOKEN_SKEW_MS = 60_000;

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private account: ServiceAccount | null | undefined;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return this.serviceAccount() !== null;
  }

  /**
   * Send one notification to every device it is addressed to.
   *
   * One HTTP call per token, because HTTP v1 has no multicast: the batch
   * endpoint was retired, and `send` takes exactly one token. The lists are
   * small — a person has a phone, sometimes a tablet — so this is a loop and
   * not a queue of its own.
   *
   * A dead token is not a failure. It is the normal way an uninstall reaches
   * us, and the notification is delivered as long as one device took it.
   */
  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const account = this.serviceAccount();
    if (!account) return { sent: 0, dead: [], error: "Firebase credentials are not configured." };

    let accessToken: string;
    try {
      accessToken = await this.googleAccessToken(account);
    } catch (error) {
      // Worth retrying: a bad clock, a network blip, or Google having a
      // moment. Not a reason to burn the notification's attempts on tokens
      // that were never contacted.
      return { sent: 0, dead: [], error: `Could not authenticate with Google: ${(error as Error).message}` };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
    const dead: string[] = [];
    const failures: string[] = [];
    let sent = 0;

    for (const token of tokens) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: this.envelope(token, message) }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          sent += 1;
          continue;
        }

        const text = (await response.text()).slice(0, 300);
        // 404 UNREGISTERED is the app being uninstalled or the token having
        // rotated; 400 on a token that shape is a token FCM will never accept.
        // Both mean stop sending to it, and neither is an error to retry.
        if (response.status === 404 || (response.status === 400 && text.includes("registration-token"))) {
          dead.push(token);
          continue;
        }
        failures.push(`${response.status}: ${text}`);
      } catch (error) {
        failures.push((error as Error).message);
      }
    }

    // Only a total failure is reported as one. A notification that reached the
    // phone and failed on the tablet has arrived.
    const error = sent === 0 && failures.length > 0 ? failures[0] : null;
    return { sent, dead, error };
  }

  /**
   * The message as FCM wants it.
   *
   * `data` carries what the app routes on. Every value must be a string —
   * FCM rejects a nested object, and silently so on some client versions,
   * which is a debugging afternoon nobody needs twice.
   *
   * The Android and APNs blocks exist for one reason each: a notification
   * about the same thread should replace the previous one rather than stack
   * (`tag` / `thread-id`), and iOS needs `content-available` to hand the
   * payload to the app when it is in the background.
   */
  private envelope(token: string, m: PushMessage): Record<string, unknown> {
    const collapse = m.threadId ?? m.kind;
    const body = m.body ?? undefined;

    return {
      token,
      notification: { title: m.title, body },
      data: {
        kind: m.kind,
        url: m.url,
        threadKind: m.threadKind ?? "",
        threadId: m.threadId ?? "",
      },
      android: {
        priority: "high",
        notification: {
          tag: collapse,
          // Tapping it should open the app at the right screen rather than at
          // the home tab. The app declares this intent filter; the path
          // travels in `data`.
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        headers: { "apns-collapse-id": collapse.slice(0, 64) },
        payload: { aps: { sound: "default", "thread-id": collapse, "content-available": 1 } },
      },
    };
  }

  /**
   * An OAuth token for the service account, cached until it is nearly stale.
   *
   * Signed here rather than fetched from a metadata server, because this
   * service is not required to run on Google infrastructure and a worker that
   * only works in one hosting environment is a worker that stops working the
   * week it moves.
   */
  private async googleAccessToken(account: ServiceAccount): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt - TOKEN_SKEW_MS > now) {
      return this.accessToken.value;
    }

    const issued = Math.floor(now / 1000);
    const claims = {
      iss: account.client_email,
      scope: SCOPE,
      aud: OAUTH_URL,
      iat: issued,
      exp: issued + 3600,
    };

    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify(claims));
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${payload}`)
      .sign(account.private_key, "base64url");

    const response = await fetch(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${payload}.${signature}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    const json = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  }

  /**
   * Read once and remembered, including the "there isn't one" answer — so a
   * service running without Firebase configured does not re-parse nothing on
   * every pass.
   */
  private serviceAccount(): ServiceAccount | null {
    if (this.account !== undefined) return this.account;

    const raw = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT")?.trim();
    if (!raw) {
      this.log.warn("FIREBASE_SERVICE_ACCOUNT is not set; push is disabled.");
      this.account = null;
      return null;
    }

    try {
      // Base64 is offered because a JSON blob with a PEM key inside it
      // survives pasting into roughly half the hosting dashboards in use.
      const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const parsed = JSON.parse(json) as ServiceAccount;

      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error("project_id, client_email and private_key are all required.");
      }

      // Env vars lose real newlines in most dashboards; the key arrives with
      // literal backslash-n and will not verify until they are put back.
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      this.account = parsed;
      return parsed;
    } catch (error) {
      this.log.error(`FIREBASE_SERVICE_ACCOUNT could not be read: ${(error as Error).message}`);
      this.account = null;
      return null;
    }
  }
}

const base64Url = (value: string): string => Buffer.from(value).toString("base64url");
