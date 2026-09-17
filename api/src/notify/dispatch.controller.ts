import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Public } from "../auth/public.decorator";
import { PushService } from "./push.service";
import { SupabaseAdminService } from "./supabase-admin.service";

type PendingPush = {
  id: string;
  recipient_id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string;
  thread_kind: string | null;
  thread_id: string | null;
  tokens: string[];
};

const BATCH = 100;

/**
 * Drains the push leg of the notification queue.
 *
 * Deliberately a worker rather than a send-at-write-time call, for the reason
 * 2N gives about email: a trigger queues a row and returns, so Firebase being
 * down delays a buzz instead of failing the message that caused it, and a
 * retry is just a second pass over the same rows.
 *
 * It lives here rather than beside the email worker in the Next app for two
 * reasons. Push is a mobile concern and mobile should not ride the web
 * deploy; and the credential it needs — a Firebase service account — has no
 * business being in a process that renders pages.
 *
 * Not in the OpenAPI document. Nothing generates a client for this: it is
 * called by a scheduler with a shared secret, and a worker endpoint in the
 * spec is an invitation for an app to call it.
 */
@ApiExcludeController()
@Controller({ path: "notify", version: "1" })
export class DispatchController {
  constructor(
    private readonly config: ConfigService,
    private readonly admin: SupabaseAdminService,
    private readonly push: PushService,
  ) {}

  /**
   * What the worker would do, without doing it.
   *
   * Exists because every failure mode here is silent: a missing credential, a
   * service role key that was never set, a scheduler calling with the wrong
   * secret. All three look identical from the outside — nobody's phone buzzes
   * — and this is the one call that tells them apart. Same secret as POST,
   * reports no key material.
   */
  @Get("status")
  @Public()
  status(@Headers("authorization") authorization?: string): Record<string, unknown> {
    this.assertSecret(authorization);

    return {
      supabaseServiceRole: this.admin.configured,
      firebase: this.push.configured,
      // Both false is a service that will accept every dispatch call and
      // deliver nothing, which is worth being able to see at a glance.
      ready: this.admin.configured && this.push.configured,
    };
  }

  /**
   * One pass: queue whatever callbacks have come due, then send what is
   * waiting.
   *
   * The reminder queuer runs first on purpose — a call due in twenty minutes
   * should go out on this pass rather than wait for the next one, and it is a
   * single statement against an indexed column.
   *
   * Called on a schedule with the shared secret. Every five minutes is about
   * right: the debounce in queue_notification is half an hour, and the
   * callback reminder's lead time is thirty minutes, so a five-minute cadence
   * makes both accurate to well within what anybody notices.
   */
  @Post("dispatch")
  @Public()
  @HttpCode(200)
  async dispatch(@Headers("authorization") authorization?: string): Promise<Record<string, unknown>> {
    this.assertSecret(authorization);

    if (!this.admin.configured) {
      throw new ServiceUnavailableException("SUPABASE_SERVICE_ROLE_KEY is not set.");
    }
    if (!this.push.configured) {
      // Refused rather than attempted. A pass that ran without credentials
      // would burn an attempt on every row it touched, and three of those
      // park a notification for good.
      throw new ServiceUnavailableException("FIREBASE_SERVICE_ACCOUNT is not set.");
    }

    const db = this.admin.admin();

    const { data: reminded, error: reminderError } = await db.rpc("queue_callback_reminders");
    if (reminderError) {
      // Not fatal. The reminders are one kind among twelve, and failing the
      // whole pass over them would hold up every message notification queued
      // behind them.
      console.warn(`queue_callback_reminders failed: ${reminderError.message}`);
    }

    const { data, error } = await db.rpc("pending_push_notifications", { p_limit: BATCH });
    if (error) throw new ServiceUnavailableException(error.message);

    const pending = (data as PendingPush[]) ?? [];
    const dead = new Set<string>();
    let sent = 0;
    let failed = 0;

    // Sequential, like the email worker, and for the same reason: the batch is
    // small and a burst that trips a rate limit turns one late notification
    // into a hundred.
    for (const row of pending) {
      const result = await this.push.send(row.tokens, {
        title: row.title,
        body: row.body,
        url: row.url,
        kind: row.kind,
        threadKind: row.thread_kind,
        threadId: row.thread_id,
      });

      result.dead.forEach((t) => dead.add(t));

      // Every device being gone counts as delivered, not as a failure to
      // retry: there is nowhere left to send it, and retrying twice more
      // would only park the row with a misleading error on it.
      const noneLeft = result.sent === 0 && result.dead.length === row.tokens.length;
      const failure = noneLeft ? null : result.error;

      await db.rpc("mark_push_sent", { p_id: row.id, p_error: failure });

      if (failure) failed += 1;
      else sent += 1;
    }

    if (dead.size > 0) {
      await db.rpc("disable_device_tokens", {
        p_tokens: [...dead],
        p_reason: "unregistered with FCM",
      });
    }

    return {
      remindersQueued: Number(reminded ?? 0),
      considered: pending.length,
      sent,
      failed,
      tokensDisabled: dead.size,
    };
  }

  /**
   * The only thing standing in front of this controller.
   *
   * @Public() turns the global guard off, so there is no caller to check —
   * which is correct, because a scheduler has no account. The secret is the
   * whole authentication, so an unset one refuses rather than waves through:
   * a misconfigured deploy must not leave this open.
   */
  private assertSecret(authorization?: string): void {
    const secret = this.config.get<string>("NOTIFICATION_DISPATCH_SECRET")?.trim();
    if (!secret) throw new UnauthorizedException("Dispatch is not configured.");
    if (authorization !== `Bearer ${secret}`) throw new UnauthorizedException("Bad secret.");
  }
}
