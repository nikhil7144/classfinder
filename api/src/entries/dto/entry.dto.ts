import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from "class-validator";

export const ENTRY_STATUSES = ["confirmed", "cancelled"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid", "refund_due", "refunded", "waived"] as const;
export const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "card", "other"] as const;

/** One of the other players in a team entry. */
export class EntryMemberDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  dob!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

/**
 * A registration.
 *
 * Carries the event and category it is against, denormalised into a name and
 * a date, because both screens that show an entry — the family's list and the
 * organiser's register — are useless without them, and neither should have to
 * make a second request per row to find out what somebody entered.
 */
export class EntryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  eventId!: string;

  @ApiProperty({ type: String, nullable: true })
  eventTitle!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  eventStartsAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The event's own status." })
  eventStatus!: string | null;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null;

  @ApiProperty({ format: "uuid", description: "The account that entered." })
  seekerId!: string;

  @ApiProperty()
  participantName!: string;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  participantDob!: string | null;

  @ApiProperty({ enum: ENTRY_STATUSES })
  status!: (typeof ENTRY_STATUSES)[number];

  @ApiProperty({
    enum: PAYMENT_STATUSES,
    description:
      "Money is a separate axis from attendance, so a late withdrawal can be cancelled without " +
      "becoming a refund.",
  })
  paymentStatus!: (typeof PAYMENT_STATUSES)[number];

  @ApiProperty({ type: String, nullable: true, enum: PAYMENT_MODES })
  paymentMode!: (typeof PAYMENT_MODES)[number] | null;

  @ApiProperty({ type: String, nullable: true })
  paymentReference!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  paidAt!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Copied from the category when the entry was made, never read back through it.",
  })
  amountDue!: number | null;

  @ApiProperty()
  receiptNo!: string;

  @ApiProperty({ format: "date-time" })
  enteredAt!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  cancelledAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelledReason!: string | null;

  @ApiProperty({
    type: Boolean,
    description: "Whether the caller cancelled it themselves, rather than the other side.",
  })
  cancelledByMe!: boolean;

  @ApiProperty({ type: [EntryMemberDto] })
  members!: EntryMemberDto[];
}

export class EntryMemberInputDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  dob?: string;
}

/**
 * What a family sends to enter.
 *
 * No event id: the category names its event, and accepting both would let the
 * two disagree. No fee either — what an entry costs is the category's to say.
 */
export class CreateEntryDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: "Aarav Sharma" })
  @IsString()
  @Length(2, 120)
  participantName!: string;

  @ApiPropertyOptional({
    format: "date",
    description:
      "Checked against the category's age range as it will be on the day of the event, which " +
      "is what an under-10 tournament means.",
  })
  @IsOptional()
  @IsDateString()
  participantDob?: string;

  @ApiPropertyOptional({
    type: [EntryMemberInputDto],
    description:
      "The rest of a team: the entrant plus these must come to the category's team size. Empty " +
      "for an individual category.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EntryMemberInputDto)
  members?: EntryMemberInputDto[];
}

export class CancelEntryDto {
  @ApiPropertyOptional({ example: "Withdrawn — injured." })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  reason?: string;

  @ApiPropertyOptional({
    description:
      "The organiser's call and ignored for anybody else: false cancels the entry without " +
      "marking a refund due, which is what a non-refundable late withdrawal is.",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  refund?: boolean;
}

export class SetEntryPaymentDto {
  @ApiProperty({ enum: PAYMENT_STATUSES })
  @IsIn(PAYMENT_STATUSES)
  status!: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_MODES })
  @IsOptional()
  @IsIn(PAYMENT_MODES)
  mode?: (typeof PAYMENT_MODES)[number];

  @ApiPropertyOptional({ example: "UPI 4471…", description: "A UPI reference, a cheque number." })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  reference?: string;
}
