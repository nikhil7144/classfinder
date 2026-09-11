import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from "class-validator";

/** The floor the web sets on a first message, and the reason it exists. */
export const MIN_ENQUIRY_MESSAGE = 20;

/**
 * A family writing to a coach.
 *
 * The other direction — a coach approaching a family — is
 * POST /students/{kind}/{id}/approach, and it is a different endpoint on
 * purpose: it carries a provider id, starts the row `pending` rather than
 * `open`, and is refused unless the family is open to being approached. Two
 * inserts into one table under two policies with every clause inverted, so one
 * endpoint pretending to serve both would have to re-derive which it was.
 */
export class CreateEnquiryDto {
  @ApiProperty({ format: "uuid", description: "The coach being written to. Must be approved." })
  @IsUUID()
  providerId!: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "What they are asking about. Optional: a parent may just want to talk, and forcing a " +
      "taxonomy pick before the first message is friction at exactly the wrong moment.",
  })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @ApiProperty({
    minLength: MIN_ENQUIRY_MESSAGE,
    maxLength: 4000,
    description: "A coach is judging a stranger on this, so there is a floor.",
  })
  @IsString()
  @Length(MIN_ENQUIRY_MESSAGE, 4000, {
    message: `Write at least ${MIN_ENQUIRY_MESSAGE} characters — a coach is deciding on this.`,
  })
  message!: string;

  @ApiPropertyOptional({
    default: false,
    description:
      "Whether the coach may see this family's number. Opt in, never a default, and per " +
      "enquiry rather than per account: sharing it with one coach is not sharing it with every " +
      "coach who ever writes.",
  })
  @IsOptional()
  @IsBoolean()
  sharePhone?: boolean;
}

/**
 * A family answering a coach who approached them.
 *
 * Accepting opens the thread; declining closes it. The phone is asked for in
 * the same breath because that is the moment a parent is actually deciding how
 * reachable they want to be — asking later, on a screen of its own, got
 * answered by nobody.
 */
export class RespondToApproachDto {
  @ApiProperty({ description: "True opens the conversation, false declines it." })
  @IsBoolean()
  accept!: boolean;

  @ApiPropertyOptional({ default: false, description: "Ignored when declining." })
  @IsOptional()
  @IsBoolean()
  sharePhone?: boolean;
}

/** Turning the number on or off, after the fact. */
export class SetPhoneSharingDto {
  @ApiProperty({
    description:
      "Revocable on purpose. A parent who shared a number and then thought better of it can " +
      "take it back, and the contact endpoints stop answering immediately.",
  })
  @IsBoolean()
  share!: boolean;
}
