import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Access to Postgres, always as somebody.
 *
 * This service never holds the service role key. That is deliberate and it is
 * the whole security posture of this API: every query runs as the caller, so
 * the 74 RLS policies in db/ stay in force underneath. A forgotten ownership
 * check in a controller is then a bug that returns too little, not a breach
 * that returns somebody else's rows.
 *
 * If a future endpoint genuinely needs to act as nobody in particular — a
 * cron, an admin console — it should get its own explicitly named provider
 * rather than a service role key smuggled in here.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly url: string;
  private readonly anonKey: string;
  private readonly anonClient: SupabaseClient;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>("SUPABASE_URL");
    this.anonKey = config.getOrThrow<string>("SUPABASE_ANON_KEY");

    this.anonClient = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** For genuinely public reads — the guest city feed and the city list. */
  anon(): SupabaseClient {
    return this.anonClient;
  }

  /**
   * A client that carries the caller's token, so PostgREST and every policy
   * see the real user rather than `anon`.
   *
   * A fresh client per request: the Authorization header is per-caller state
   * and sharing one instance across requests would leak it between them.
   */
  asUser(accessToken: string): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  /**
   * Who this token belongs to, or null.
   *
   * Verified against Supabase rather than by decoding locally, which costs a
   * network hop per authenticated request. Worth revisiting with local
   * signature verification if it shows up in latency; correctness first while
   * the shape of this service is still being decided.
   */
  async userFromToken(accessToken: string): Promise<{ id: string } | null> {
    const { data, error } = await this.anonClient.auth.getUser(accessToken);
    if (error || !data.user) {
      this.logger.debug(`Rejected token: ${error?.message ?? "no user"}`);
      return null;
    }
    return { id: data.user.id };
  }
}
