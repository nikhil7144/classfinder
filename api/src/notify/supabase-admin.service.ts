import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Postgres as nobody in particular. The only one in this service.
 *
 * SupabaseService's header reserves this case explicitly — "if a future
 * endpoint genuinely needs to act as nobody in particular — a cron, an admin
 * console — it should get its own explicitly named provider rather than a
 * service role key smuggled in here" — and the push worker is that endpoint.
 * It drains a queue on behalf of everybody, so there is no caller to act as,
 * and the functions it calls (pending_push_notifications, mark_push_sent,
 * disable_device_tokens) are granted to the service role alone.
 *
 * Why it stays separate rather than becoming a method on SupabaseService: a
 * key that is one autocomplete away from every other query is a key that ends
 * up in one. This class is provided by NotifyModule and nothing else imports
 * it, so reaching the service role from a controller means adding an import
 * somebody has to review.
 *
 * Unset in development and in tests, where `configured` is false and the
 * worker says so rather than pretending to have sent something.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly log = new Logger(SupabaseAdminService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>("SUPABASE_URL") && this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }

  /** Throws rather than returning a client that would fail every call. */
  admin(): SupabaseClient {
    if (this.client) return this.client;

    const url = this.config.getOrThrow<string>("SUPABASE_URL");
    const key = this.config.getOrThrow<string>("SUPABASE_SERVICE_ROLE_KEY");

    this.log.log("Service-role client created for the notification worker.");
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }
}
