import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export const PITCH_STATUSES = ["pending", "accepted", "declined"] as const;

/** How far an extension pushes the expiry out. Matches EXTEND_DAYS in lib/groups.ts. */
export const GROUP_EXTEND_DAYS = 10;

/**
 * How long a group may run for, chosen at creation. Matches VALIDITY_OPTIONS
 * in lib/groups.ts — 1 week, 10 days, 3 weeks, 1 month.
 *
 * A range rather than the four exact values: the web offers four sensible
 * choices, and refusing 14 because it is not on that list would be the API
 * enforcing a picker's opinion rather than a rule.
 */
export const GROUP_MIN_VALIDITY_DAYS = 1;
export const GROUP_MAX_VALIDITY_DAYS = 30;

/**
 * The fewest children a group may ask for.
 *
 * Two, not one. A group of one family is an enquiry, and the whole argument
 * for groups is that neighbours asking together are worth travelling for. The
 * database allows one because the column predates that rule; the web's form
 * has said two since MIN_STUDENTS was written, and this makes the contract
 * agree with the product rather than with the column.
 */
export const GROUP_MIN_STUDENTS = 2;

/**
 * A group of neighbours asking for the same thing.
 *
 * The idea the product is built on: one family asking for a Kathak teacher is
 * a lead, four families in the same society asking together is a class worth
 * travelling for. A group carries where and what, and the names stay out of it
 * until somebody is let in.
 *
 * `isCreator`, `isActive` and `pendingRequests` are answers about the caller
 * and are resolved by my_groups() — only the creator is ever told how many
 * coaches have pitched.
 */
export class GroupDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  serviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  areaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Identifying detail. Never shown to anybody outside the group.",
  })
  societyName!: string | null;

  @ApiProperty({ description: "How many children the group is asking for." })
  studentCount!: number;

  @ApiProperty({ description: "How many families have joined." })
  memberCount!: number;

  @ApiProperty({
    format: "date-time",
    description: "Time-boxed on purpose: stale demand costs a coach's trust faster than none.",
  })
  expiresAt!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  closedAt!: string | null;

  @ApiProperty()
  isCreator!: boolean;

  @ApiProperty({ description: "Open, unexpired, and with enough families to be worth pitching to." })
  isActive!: boolean;

  @ApiProperty({ description: "Coaches waiting on an answer. Zero to anybody but the creator." })
  pendingRequests!: number;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

/**
 * A group as somebody following an invite link sees it.
 *
 * Deliberately not GroupDto. This one is readable by a person who is not in
 * the group yet, so it carries the notes and whether it is still open, and
 * nothing about who is in it.
 */
export class GroupInviteDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  serviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  areaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  societyName!: string | null;

  @ApiProperty()
  studentCount!: number;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;

  @ApiProperty({ description: "Whether it can still be joined." })
  isOpen!: boolean;

  @ApiProperty({ description: "Whether the caller is already in it. False when signed out." })
  alreadyMember!: boolean;
}

/** A coach's pitch to a group, and the conversation it opened. */
export class GroupPitchDto {
  @ApiProperty({ format: "uuid" })
  requestId!: string;

  @ApiProperty({ format: "uuid" })
  providerId!: string;

  @ApiProperty({ type: String, nullable: true })
  providerName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  providerPhotoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "What they wrote to the group." })
  pitch!: string | null;

  @ApiProperty({ enum: PITCH_STATUSES })
  status!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  lastMessage!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  lastMessageAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  lastSenderId!: string | null;

  @ApiProperty()
  messageCount!: number;

  @ApiProperty()
  unread!: boolean;

  @ApiProperty({ description: "Whether the caller made the group this was pitched to." })
  isCreator!: boolean;
}

/**
 * The other side's contact details, once there is a reason to have them.
 *
 * `phone` is null unless the group chose to share it, and `shared` says which
 * of the two situations a null means — withheld, or simply not on file.
 */
export class GroupContactDto {
  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  societyName!: string | null;

  @ApiProperty({ description: "Whether the group is sharing a number at all." })
  shared!: boolean;
}

export class CreateGroupDto {
  @ApiProperty({ format: "uuid", description: "What the group wants taught." })
  @IsUUID()
  serviceCategoryId!: string;

  @ApiProperty({ format: "uuid", description: "Roughly where they are." })
  @IsUUID()
  areaId!: string;

  @ApiProperty({
    minLength: 2,
    maxLength: 160,
    description:
      "The society or building. Identifying, so it is never shown outside the group — but it " +
      "is the thing that makes neighbours recognise their own group.",
  })
  @IsString()
  @Length(2, 160)
  societyName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string | null;

  @ApiPropertyOptional({ default: GROUP_MIN_STUDENTS, minimum: GROUP_MIN_STUDENTS, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GROUP_MIN_STUDENTS, {
    message: "A group is at least two families — one on its own is an enquiry.",
  })
  @Max(100)
  studentCount?: number;

  @ApiPropertyOptional({
    default: false,
    description: "Opt in, never a default. This is a parent's personal number.",
  })
  @IsOptional()
  @IsBoolean()
  sharePhone?: boolean;

  @ApiPropertyOptional({
    default: GROUP_EXTEND_DAYS,
    minimum: GROUP_MIN_VALIDITY_DAYS,
    maximum: GROUP_MAX_VALIDITY_DAYS,
    description:
      "How long it runs for. Groups are time-boxed because stale demand costs a coach's trust " +
      "faster than no demand does, and the creator picks the window rather than taking the " +
      "column default.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GROUP_MIN_VALIDITY_DAYS)
  @Max(GROUP_MAX_VALIDITY_DAYS)
  validityDays?: number;
}

/**
 * Editing one.
 *
 * Every field optional, and `closed` is here rather than as its own endpoint
 * because closing a group is not a state machine — it is a creator saying they
 * are done, and it is reversible while the group has not expired.
 */
export class UpdateGroupDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  societyName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string | null;

  @ApiPropertyOptional({ minimum: GROUP_MIN_STUDENTS, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GROUP_MIN_STUDENTS, {
    message: "A group is at least two families — one on its own is an enquiry.",
  })
  @Max(100)
  studentCount?: number;

  @ApiPropertyOptional({ description: "Whether coaches may see the group's number." })
  @IsOptional()
  @IsBoolean()
  sharePhone?: boolean;

  @ApiPropertyOptional({
    description:
      "True stops coaches pitching. Setting it false reopens the group — and pushes the " +
      "expiry out if it had already lapsed, because clearing closed_at alone would leave a " +
      "group that says it is open and that nobody can pitch to.",
  })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @ApiPropertyOptional({
    description:
      `True pushes the expiry ${GROUP_EXTEND_DAYS} days out from now. Groups are time-boxed ` +
      "because stale demand costs a coach's trust faster than no demand does, so this is the " +
      "creator saying it is still wanted rather than a date they pick.",
  })
  @IsOptional()
  @IsBoolean()
  extend?: boolean;
}

/** Accepting or declining a coach who pitched. */
export class RespondToPitchDto {
  @ApiProperty({ enum: ["accepted", "declined"] })
  @IsIn(["accepted", "declined"])
  status!: string;
}
