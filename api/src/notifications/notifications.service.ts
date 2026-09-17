import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  DeviceDto,
  ForgetDeviceDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationChannelDto,
  NotificationDto,
  NotificationListDto,
  NotificationSettingsDto,
  RegisterDeviceDto,
  UpdateNotificationSettingsDto,
} from "./dto/notification.dto";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string;
  thread_kind: string | null;
  thread_id: string | null;
  created_at: string;
  read_at: string | null;
};

type DeviceRow = {
  id: string;
  platform: string;
  app_flavor: string;
  last_seen_at: string;
  disabled_reason: string | null;
};

type SettingsRow = {
  push_enabled: boolean;
  email_enabled: boolean;
  muted_kinds: string[] | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
};

type ChannelRow = {
  kind: string;
  pushes: boolean;
  emails: boolean;
  audience: string;
  note: string | null;
};

const COLUMNS = "id, kind, title, body, url, thread_kind, thread_id, created_at, read_at";

const DEFAULT_LIMIT = 30;

/** What a client sees when it has never touched the settings screen. */
export const DEFAULT_SETTINGS: NotificationSettingsDto = {
  pushEnabled: true,
  emailEnabled: true,
  mutedKinds: [],
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: "Asia/Kolkata",
};

export const toNotification = (r: NotificationRow): NotificationDto => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  url: r.url,
  threadKind: r.thread_kind,
  threadId: r.thread_id,
  createdAt: r.created_at,
  readAt: r.read_at,
  unread: !r.read_at,
});

export const toDevice = (r: DeviceRow): DeviceDto => ({
  id: r.id,
  platform: r.platform,
  appFlavor: r.app_flavor,
  lastSeenAt: r.last_seen_at,
  disabledReason: r.disabled_reason,
});

/**
 * Postgres hands back a `time` as HH:MM:SS. A settings screen shows HH:MM and
 * sends HH:MM, so the seconds are trimmed here rather than in two clients.
 */
const toHhMm = (value: string | null): string | null => (value ? value.slice(0, 5) : null);

export const toSettings = (r: SettingsRow | null): NotificationSettingsDto =>
  r
    ? {
        pushEnabled: r.push_enabled,
        emailEnabled: r.email_enabled,
        mutedKinds: r.muted_kinds ?? [],
        quietHoursStart: toHhMm(r.quiet_hours_start),
        quietHoursEnd: toHhMm(r.quiet_hours_end),
        timezone: r.timezone ?? DEFAULT_SETTINGS.timezone,
      }
    : { ...DEFAULT_SETTINGS };

export const toChannel = (r: ChannelRow): NotificationChannelDto => ({
  kind: r.kind,
  pushes: r.pushes,
  emails: r.emails,
  audience: r.audience,
  note: r.note,
});

/**
 * The bell, its list, and the two things a phone has to tell the server
 * before any of it can reach it.
 *
 * Read as the caller throughout: "read own notifications" has been the policy
 * since 2N, so the list needs no ownership check here and a bug in this
 * service returns too little rather than somebody else's mail. The writes go
 * through definer functions for the reason phase3w's header gives — a
 * registration upserts a token that may currently belong to a different user,
 * which is not a rule RLS can express.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * The caller's notifications, newest first.
   *
   * Paged on `created_at` rather than an offset: notifications arrive while
   * somebody is scrolling, and an offset would shuffle the page under their
   * thumb every time one did.
   */
  async list(caller: Caller, params: ListNotificationsQueryDto): Promise<NotificationListDto> {
    const limit = params.limit ?? DEFAULT_LIMIT;

    let q = this.supabase
      .asUser(caller.accessToken)
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      // One more than asked for, so "is there another page" is an answer
      // rather than a second round trip that says zero.
      .limit(limit + 1);

    if (params.before) q = q.lt("created_at", params.before);
    if (params.unreadOnly) q = q.is("read_at", null);

    const { data, error } = await q;
    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data as unknown as NotificationRow[]) ?? [];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toNotification);

    return {
      items,
      unread: items.filter((n) => n.unread).length,
      nextBefore: hasMore ? items[items.length - 1].createdAt : null,
    };
  }

  /** How many are waiting, unpaged. The number a bell carries on its own. */
  async unreadCount(caller: Caller): Promise<number> {
    const { count, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);

    if (error) throw new InternalServerErrorException(error.message);
    return count ?? 0;
  }

  /**
   * Clear them.
   *
   * Three readings, narrowest first. A request naming both ids and `all` is a
   * client bug, and clearing the named ones is the recoverable half of it —
   * whereas clearing everything on a mistaken `all` cannot be undone.
   */
  async markRead(caller: Caller, body: MarkReadDto): Promise<number> {
    const db = this.supabase.asUser(caller.accessToken);

    if (body.ids?.length) {
      const { error } = await db.rpc("mark_notifications_read_ids", { p_ids: body.ids });
      if (error) throw new InternalServerErrorException(error.message);
    } else if (body.threadId) {
      const { error } = await db.rpc("mark_notifications_read", { p_thread_id: body.threadId });
      if (error) throw new InternalServerErrorException(error.message);
    } else if (body.all) {
      const { error } = await db.rpc("mark_notifications_read", { p_thread_id: null });
      if (error) throw new InternalServerErrorException(error.message);
    } else {
      // Rather than silently clearing the lot, which is the expensive way for
      // a client to discover it forgot a field.
      throw new BadRequestException("Say what to clear: ids, threadId, or all.");
    }

    return this.unreadCount(caller);
  }

  /**
   * A phone asking to be buzzed.
   *
   * Called on every launch, not only the first. FCM rotates tokens, and an
   * app that registers once and trusts it goes quiet weeks later with nothing
   * anywhere to say why.
   */
  async registerDevice(caller: Caller, body: RegisterDeviceDto): Promise<string> {
    const { data, error } = await this.supabase.asUser(caller.accessToken).rpc("register_device_token", {
      p_token: body.token.trim(),
      p_platform: body.platform,
      p_app_flavor: body.appFlavor,
      p_locale: body.locale ?? null,
    });

    if (error) throw new InternalServerErrorException(error.message);
    return data as string;
  }

  /** Signing out, on this device or on all of them. */
  async forgetDevice(caller: Caller, body: ForgetDeviceDto): Promise<number> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("forget_device_token", { p_token: body.token?.trim() ?? null });

    if (error) throw new InternalServerErrorException(error.message);
    return Number(data ?? 0);
  }

  /** Which devices are registered — a settings screen, and a support answer. */
  async devices(caller: Caller): Promise<DeviceDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("device_tokens")
      .select("id, platform, app_flavor, last_seen_at, disabled_reason")
      .order("last_seen_at", { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as unknown as DeviceRow[]) ?? []).map(toDevice);
  }

  /** Defaults for somebody who has never opened the settings screen. */
  async settings(caller: Caller): Promise<NotificationSettingsDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("notification_settings")
      .select("push_enabled, email_enabled, muted_kinds, quiet_hours_start, quiet_hours_end, timezone")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    return toSettings(data as unknown as SettingsRow | null);
  }

  /**
   * Change them.
   *
   * An upsert, because the row is created on first change rather than at
   * signup — and because a PATCH that 404s the first time somebody touches a
   * switch is a bug every client would have to work around identically.
   *
   * A partial body merges onto what is stored: reading first costs a round
   * trip and buys an honest PATCH, where an upsert of only the sent fields
   * would quietly reset the others to their defaults on insert.
   */
  async updateSettings(
    caller: Caller,
    body: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const current = await this.settings(caller);

    const start = body.quietHoursStart !== undefined ? body.quietHoursStart : current.quietHoursStart;
    const end = body.quietHoursEnd !== undefined ? body.quietHoursEnd : current.quietHoursEnd;

    // Checked here as well as by the constraint, so the message a client gets
    // names the field rather than the constraint.
    if ((start === null) !== (end === null)) {
      throw new BadRequestException("Quiet hours need a start and an end, or neither.");
    }

    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("notification_settings")
      .upsert(
        {
          user_id: caller.id,
          push_enabled: body.pushEnabled ?? current.pushEnabled,
          email_enabled: body.emailEnabled ?? current.emailEnabled,
          muted_kinds: body.mutedKinds ?? current.mutedKinds,
          quiet_hours_start: start,
          quiet_hours_end: end,
          timezone: body.timezone ?? current.timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("push_enabled, email_enabled, muted_kinds, quiet_hours_start, quiet_hours_end, timezone")
      .single();

    if (error) {
      // "write own settings" refused it. Only reachable if a caller sends
      // somebody else's id, which this method never does — so it is a guard
      // against a future edit, not against today's clients.
      if (error.code === "42501") throw new ForbiddenException("Those aren't your settings.");
      throw new InternalServerErrorException(error.message);
    }

    return toSettings(data as unknown as SettingsRow);
  }

  /**
   * Which kinds push and which email.
   *
   * A public read: the table is the product's decision rather than the
   * caller's, and a settings screen that knows it can say "we'll email this
   * one" instead of implying a switch does something it does not.
   */
  async channels(): Promise<NotificationChannelDto[]> {
    const { data, error } = await this.supabase
      .anon()
      .from("notification_channels")
      .select("kind, pushes, emails, audience, note")
      .order("kind");

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as unknown as ChannelRow[]) ?? []).map(toChannel);
  }
}
