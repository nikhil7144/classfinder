import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export const AUDIENCES = ["organiser", "provider", "advertiser"] as const;
export const PLAN_KINDS = ["subscription", "per_event"] as const;
export const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "card", "other"] as const;

/**
 * A row in one of the three catalogues.
 *
 * `maxActiveEvents` carries the whole model: null is uncapped, a number is a
 * tier, and 0 is a listing that grants no event rights at all — which is how
 * a coach's plan says "findable, buy the event separately".
 */
export class PlanDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: AUDIENCES })
  audience!: (typeof AUDIENCES)[number];

  @ApiProperty({ enum: PLAN_KINDS })
  kind!: (typeof PLAN_KINDS)[number];

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  blurb!: string | null;

  @ApiProperty({ description: "In rupees." })
  priceAmount!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Null for a per-event purchase." })
  periodMonths!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Null is uncapped, 0 grants no event rights.",
  })
  maxActiveEvents!: number | null;

  @ApiProperty({ description: "What a party of this audience is on before they buy anything." })
  isDefault!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  sortOrder!: number;
}

/**
 * What the caller's own business is on, and what it may still do.
 *
 * The arithmetic is done here rather than by each screen: "2 of 5 used" is
 * one subtraction, and three clients doing it themselves is three chances to
 * disagree about whether a finished tournament still counts.
 */
export class MyPlanDto {
  @ApiProperty({ enum: ["provider", "organiser"] })
  partyKind!: "provider" | "organiser";

  @ApiProperty({ format: "uuid" })
  partyId!: string;

  @ApiProperty({ type: PlanDto, nullable: true, description: "Null when nothing is seeded." })
  plan!: PlanDto | null;

  @ApiProperty({ description: "Published and still to come." })
  liveEvents!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "How many more may be published. Null means no limit.",
  })
  remaining!: number | null;

  @ApiProperty({
    description:
      "Whether another event could be published right now. False on a listing plan with no " +
      "per-event purchase, which is a coach who has not bought this event yet.",
  })
  canPublishAnother!: boolean;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  startsOn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date",
    description: "Null is open-ended — a default plan, or one nobody has put an end date on.",
  })
  endsOn!: string | null;
}

/** One recorded purchase: a subscription window, or a single event. */
export class SubscriptionDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["provider", "organiser"] })
  partyKind!: "provider" | "organiser";

  @ApiProperty({ format: "uuid" })
  partyId!: string;

  @ApiProperty({ type: String, nullable: true })
  partyName!: string | null;

  @ApiProperty({ format: "uuid" })
  planId!: string;

  @ApiProperty({ type: String, nullable: true })
  planName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "uuid",
    description: "Set for a per-event purchase, which entitles that event and never expires.",
  })
  eventId!: string | null;

  @ApiProperty({ format: "date" })
  startsOn!: string;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  endsOn!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  amountPaid!: number | null;

  @ApiProperty({ type: String, nullable: true, enum: PAYMENT_MODES })
  paymentMode!: (typeof PAYMENT_MODES)[number] | null;

  @ApiProperty({ type: String, nullable: true })
  paymentReference!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  paidOn!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

export class PlanBodyDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ maxLength: 400 })
  @IsOptional()
  @IsString()
  @Length(0, 400)
  blurb?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceAmount?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 60, description: "Omit for a per-event purchase." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  periodMonths?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: "Omit for uncapped. Zero grants no event rights.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxActiveEvents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreatePlanDto extends PlanBodyDto {
  @ApiProperty({ enum: AUDIENCES })
  @IsIn(AUDIENCES)
  audience!: (typeof AUDIENCES)[number];

  @ApiProperty({ enum: PLAN_KINDS })
  @IsIn(PLAN_KINDS)
  kind!: (typeof PLAN_KINDS)[number];

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  declare name: string;
}

/**
 * Recording that somebody paid.
 *
 * Exactly one party, the way an event names exactly one owner. `eventId`
 * turns it into a per-event purchase, which is a coach paying for one
 * tournament.
 */
export class RecordSubscriptionDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  organiserId?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  planId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;

  @ApiPropertyOptional({ enum: PAYMENT_MODES })
  @IsOptional()
  @IsIn(PAYMENT_MODES)
  paymentMode?: (typeof PAYMENT_MODES)[number];

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  paymentReference?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  paidOn?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}
