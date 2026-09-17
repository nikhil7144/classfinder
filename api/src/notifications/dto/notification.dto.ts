import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

/**
 * Every kind the queue can hold.
 *
 * Kept in step with the check constraint on `notifications.kind` by hand,
 * which is the same bargain every other enum in this API makes: the database
 * is the authority, this list is what a generated client gets to switch on.
 */
export const NOTIFICATION_KINDS = [
  "enquiry_received",
  "approach_received",
  "pitch_received",
  "message_received",
  "trial_proposed",
  "trial_answered",
  "query_received",
  "query_callback_scheduled",
  "query_callback_due",
  "entry_received",
  "entry_cancelled",
  "event_cancelled",
] as const;

export const DEVICE_PLATFORMS = ["ios", "android", "web"] as const;
export const APP_FLAVORS = ["provider", "seeker"] as const;

/**
 * One thing that happened, as the person it happened to reads it.
 *
 * The same row the email worker drains and the push worker sends. A client
 * showing a notification list and a client receiving a push are looking at
 * one object, so opening either lands in the same place.
 */
export class NotificationDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_KINDS })
  kind!: string;

  @ApiProperty({ description: "One line. Already written for a lock screen." })
  title!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "A preview, capped at 140 characters when it was queued — never the whole thing.",
  })
  body!: string | null;

  @ApiProperty({
    description:
      "Where it points, as a web path. A mobile client maps it to its own route rather than " +
      "opening a browser; the path is the same on both so one trigger serves both clients.",
    example: "/dashboard/queries?query=6f1b…",
  })
  url!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ["group", "enquiry"],
    description: "Set when this is about a conversation, so a client can mark that thread read.",
  })
  threadKind!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  threadId!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  readAt!: string | null;

  @ApiProperty({ description: "Convenience for a list that dots the unread ones." })
  unread!: boolean;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty({ description: "How many of the returned page are unread." })
  unread!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description:
      "Pass back as `before` for the next page. Null when this page is the end. Keyed on the " +
      "timestamp rather than an offset, so a notification arriving mid-scroll cannot shift the " +
      "page under somebody's thumb.",
  })
  nextBefore!: string | null;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Only notifications older than this. The previous page's `nextBefore`.",
  })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ description: "Only the ones not yet read." })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class MarkReadDto {
  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    maxItems: 200,
    description: "Specific notifications — swiping one away, or clearing what a screen showed.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    description: "Everything about one conversation — what opening a thread means.",
  })
  @IsOptional()
  @IsUUID()
  threadId?: string;

  @ApiPropertyOptional({
    description:
      "Everything. What opening the bell means. Ignored if ids or threadId are given, because " +
      "a request that says both is a client bug and the narrower reading is the safe one.",
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class MarkReadResultDto {
  @ApiProperty({ description: "Unread notifications left after the call, for the badge." })
  remaining!: number;
}

/**
 * A phone asking to be buzzed.
 *
 * Sent on every launch, not only the first: FCM rotates tokens, and a client
 * that registers once and trusts it goes quiet weeks later with nothing in
 * any log to say why.
 */
export class RegisterDeviceDto {
  @ApiProperty({
    minLength: 16,
    maxLength: 4096,
    description: "The FCM registration token. iOS reaches APNs through Firebase, so it is one field.",
  })
  @IsString()
  @Length(16, 4096)
  token!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS as unknown as string[])
  platform!: string;

  @ApiProperty({
    enum: APP_FLAVORS,
    description:
      "Which app this install is. The two flavours are separate builds, and a coach's phone " +
      "must never be sent a parent's notification because both happen to be installed.",
  })
  @IsIn(APP_FLAVORS as unknown as string[])
  appFlavor!: string;

  @ApiPropertyOptional({ example: "en-IN", maxLength: 16 })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  locale?: string;
}

export class RegisteredDeviceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;
}

export class ForgetDeviceDto {
  @ApiPropertyOptional({
    minLength: 16,
    maxLength: 4096,
    description:
      "The device signing out. Omit to stop push to every device on this account — which is " +
      "what somebody does after losing a phone.",
  })
  @IsOptional()
  @IsString()
  @Length(16, 4096)
  token?: string;
}

export class ForgetDeviceResultDto {
  @ApiProperty({ description: "Devices this turned off." })
  forgotten!: number;
}

export class DeviceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  platform!: string;

  @ApiProperty({ enum: APP_FLAVORS })
  appFlavor!: string;

  @ApiProperty({ format: "date-time", description: "Last time this device registered — each launch." })
  lastSeenAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Why push to this device stopped: 'signed out', or what FCM said.",
  })
  disabledReason!: string | null;

  // The token itself is never returned. It is a send credential for this
  // person's phone, a list screen has no use for it, and the fewer places it
  // is copied the better.
}

/** What this person wants to be told about, and when. */
export class NotificationSettingsDto {
  @ApiProperty()
  pushEnabled!: boolean;

  @ApiProperty()
  emailEnabled!: boolean;

  @ApiProperty({
    type: [String],
    enum: NOTIFICATION_KINDS,
    description: "Kinds this person has turned off individually, whatever the defaults say.",
  })
  mutedKinds!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: "22:00",
    description: "Start of the window where push is held. Email is unaffected.",
  })
  quietHoursStart!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "07:00" })
  quietHoursEnd!: string | null;

  @ApiProperty({ example: "Asia/Kolkata", description: "The zone quiet hours are read in." })
  timezone!: string;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], enum: NOTIFICATION_KINDS })
  @IsOptional()
  @IsArray()
  @IsIn(NOTIFICATION_KINDS as unknown as string[], { each: true })
  mutedKinds?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "22:00",
    description: "Send with quietHoursEnd, or send both as null to clear the window.",
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Use HH:MM, 24-hour." })
  quietHoursStart?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "07:00" })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Use HH:MM, 24-hour." })
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({ example: "Asia/Kolkata" })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;
}

/** Which kinds reach which channel — the product's decision, not the caller's. */
export class NotificationChannelDto {
  @ApiProperty({ enum: NOTIFICATION_KINDS })
  kind!: string;

  @ApiProperty({ description: "Whether this kind buzzes a phone." })
  pushes!: boolean;

  @ApiProperty({ description: "Whether this kind is emailed." })
  emails!: boolean;

  @ApiProperty({
    enum: [...APP_FLAVORS, "either"],
    description:
      "Which app buzzes. A coach who is also a parent has both installed, and the kind is what " +
      "knows which one should light up. Email ignores it — there is one inbox.",
  })
  audience!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Why it is set that way. Useful on a settings screen; kept honest in the table.",
  })
  note!: string | null;
}
