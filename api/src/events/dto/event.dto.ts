import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export const BOOKING_MODES = ["platform", "external", "none"] as const;
export const ENTRY_TYPES = ["individual", "team"] as const;
export const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"] as const;

/**
 * What a family enters — the row that actually carries a price and a number
 * of places.
 *
 * Per category rather than per event because most competitions carry both an
 * under-10 singles and an under-14 team, at different fees and different
 * capacities. 3J's check constraint enforces the team_size rule underneath
 * this; the validator here exists to say which field is wrong.
 */
export class EventCategoryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Under-10 Singles" })
  name!: string;

  @ApiProperty({ enum: ENTRY_TYPES })
  entryType!: (typeof ENTRY_TYPES)[number];

  @ApiProperty({ type: Number, nullable: true, description: "Set for a team, null otherwise." })
  teamSize!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Null means uncapped." })
  capacity!: number | null;

  @ApiProperty({
    description:
      "Confirmed entries. A column on the row rather than a count, because RLS hides other " +
      "families' entries and anything counting as the caller would count only their own.",
  })
  entriesCount!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Per entry, in rupees." })
  feeAmount!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  minAge!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxAge!: number | null;

  @ApiProperty()
  sortOrder!: number;
}

/**
 * An event a coach or an event company is running.
 *
 * Owned by exactly one of the two, which is why `ownerKind` is reported
 * rather than left for the client to infer from which id is null. 3J's
 * `num_nonnulls(...) = 1` guarantees the answer exists.
 */
export class EventDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["provider", "organiser"] })
  ownerKind!: "provider" | "organiser";

  @ApiProperty({ format: "uuid" })
  ownerId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The company or coach running it. Null when the owner's row is not visible to this " +
      "caller, which RLS decides — a public page names who is behind an event, and a page " +
      "that cannot say is better than one that guesses.",
  })
  ownerName!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  about!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  serviceCategoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bannerUrl!: string | null;

  @ApiProperty({ format: "uuid" })
  cityId!: string;

  @ApiProperty({ type: String, nullable: true })
  venueName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  venueAddress!: string | null;

  @ApiProperty({
    enum: BOOKING_MODES,
    description:
      "Stated, never inferred from whether externalBookingUrl is set: platform takes entries " +
      "here, external sends them to the organiser's own site, none is an announcement.",
  })
  bookingMode!: (typeof BOOKING_MODES)[number];

  @ApiProperty({ type: String, nullable: true })
  externalBookingUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  bookingOpensAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  bookingClosesAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description:
      "After this a family can no longer withdraw itself. Falls back to bookingClosesAt and " +
      "then to startsAt; its own column because 'no withdrawals in the last week' cannot be " +
      "expressed by closing entries a week early.",
  })
  cancellationDeadline!: string | null;

  @ApiProperty({ format: "date-time" })
  startsAt!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  endsAt!: string | null;

  @ApiProperty({ enum: EVENT_STATUSES })
  status!: (typeof EVENT_STATUSES)[number];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: [EventCategoryDto] })
  categories!: EventCategoryDto[];
}

/**
 * The shared body of create and edit.
 *
 * Dates are ISO strings and are checked for order by 3J, not here: the
 * database is where that rule can be true for every writer, and a second copy
 * in TypeScript would be a copy that drifts. What this class does is reject
 * the shapes Postgres would report as an unreadable constraint violation.
 */
export class EventBodyDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 160 })
  @IsOptional()
  @IsString()
  @Length(3, 160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  about?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @ApiPropertyOptional({ format: "uri" })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  bannerUrl?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  venueName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  venueAddress?: string;

  @ApiPropertyOptional({ enum: BOOKING_MODES })
  @IsOptional()
  @IsIn(BOOKING_MODES)
  bookingMode?: (typeof BOOKING_MODES)[number];

  @ApiPropertyOptional({ format: "uri" })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  externalBookingUrl?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  bookingOpensAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  bookingClosesAt?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Leave unset and a family may withdraw until entries close.",
  })
  @IsOptional()
  @IsDateString()
  cancellationDeadline?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

/**
 * Creating one.
 *
 * `title`, `cityId` and `startsAt` are the three an event cannot exist
 * without, so they are required here rather than optional-with-a-database-
 * error. `status` is absent on purpose: 3J's insert policy only accepts a
 * draft, and publishing is a separate act with its own condition.
 */
export class CreateEventDto extends EventBodyDto {
  @ApiProperty({ minLength: 3, maxLength: 160 })
  @IsString()
  @Length(3, 160)
  declare title: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  declare cityId: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  declare startsAt: string;
}

/** Editing one. Every field optional; ownership columns are absent by design. */
export class UpdateEventDto extends EventBodyDto {}

/**
 * Moving an event along.
 *
 * Its own endpoint and its own body rather than a field on the edit DTO,
 * because publishing carries a condition editing does not: 3J's update policy
 * only accepts `published` from an owner who is approved and unsuspended.
 * Folding it into the general patch would hide that behind a field that looks
 * like any other.
 */
export class SetEventStatusDto {
  @ApiProperty({ enum: EVENT_STATUSES })
  @IsIn(EVENT_STATUSES)
  status!: (typeof EVENT_STATUSES)[number];
}

export class EventCategoryInputDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The row this replaces. Present means edit that category, absent means add one — which " +
      "is what lets a category keep its id, and therefore its entries, across a save.",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: ENTRY_TYPES })
  @IsIn(ENTRY_TYPES)
  entryType!: (typeof ENTRY_TYPES)[number];

  @ApiPropertyOptional({ minimum: 2, description: "Required when entryType is team." })
  @IsOptional()
  @IsInt()
  @Min(2)
  teamSize?: number;

  @ApiPropertyOptional({ minimum: 1, description: "Omit for uncapped." })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional({ minimum: 2, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  minAge?: number;

  @ApiPropertyOptional({ minimum: 2, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  maxAge?: number;
}

/**
 * The whole set, replaced at once.
 *
 * A form edits categories as a list — add a row, retitle one, delete another —
 * and sending that list back is one round trip and one obvious meaning.
 * Per-row CRUD would need the client to track which rows are new and to
 * sequence three kinds of request to land what the user did in one save.
 *
 * Order is the order sent; sortOrder is assigned from the index rather than
 * asked for, because a client that has to number its own rows will eventually
 * send two number 3s.
 */
export class ReplaceEventCategoriesDto {
  @ApiProperty({ type: [EventCategoryInputDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EventCategoryInputDto)
  categories!: EventCategoryInputDto[];
}
