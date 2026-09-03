import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from "class-validator";

export const QUERY_STATUSES = [
  "new",
  "contacted",
  "callback_scheduled",
  "completed",
  "closed",
] as const;

/**
 * A parent asking to be contacted about a specific coach.
 *
 * Distinct from an enquiry, which is a conversation. This is a lead a coach
 * works through, and the two are linked rather than merged: answering one
 * opens an enquiry that carries `queryId`, so the parent can see why a coach
 * is suddenly messaging them.
 */
export class QueryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  providerId!: string;

  @ApiProperty({ type: String, nullable: true, description: "The coach's name, for the parent's list." })
  providerName!: string | null;

  @ApiProperty({ format: "uuid" })
  seekerId!: string;

  @ApiProperty({ description: "As given when the query was raised, not as the profile reads now." })
  contactName!: string;

  @ApiProperty({ description: "Only ever visible to the two parties." })
  contactPhone!: string;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  serviceCategoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  serviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  details!: string | null;

  @ApiProperty({ enum: QUERY_STATUSES })
  status!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  callbackAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  respondedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "uuid",
    description: "The conversation this query produced, once one exists.",
  })
  enquiryId!: string | null;
}

export class RaiseQueryDto {
  @ApiProperty({ format: "uuid", description: "The coach being asked. Must be approved." })
  @IsUUID()
  providerId!: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  contactName!: string;

  @ApiProperty({
    example: "+91 98765 43210",
    description:
      "Required, unlike on an enquiry. The point of a query is to be called, so one without a " +
      "number is a request nobody can act on. Prefilled from the profile and editable, so a " +
      "second number can be used without changing the account.",
  })
  // Deliberately loose — Indian numbers arrive with +91, spaces and dashes in
  // every combination, and a strict pattern rejects valid numbers to enforce
  // a format nothing downstream depends on.
  @Matches(/^[0-9+\-\s()]{6,20}$/, { message: "That doesn't look like a phone number." })
  contactPhone!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  details?: string;
}

export class UpdateQueryStatusDto {
  @ApiProperty({ enum: QUERY_STATUSES })
  @IsIn(QUERY_STATUSES as unknown as string[])
  status!: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Required when status is callback_scheduled, ignored otherwise.",
  })
  // Enforced here and again by a check constraint: a scheduled call with no
  // time is a status that says nothing.
  @ValidateIf((o: UpdateQueryStatusDto) => o.status === "callback_scheduled")
  @IsDateString()
  callbackAt?: string;
}

export class AnswerQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  message!: string;
}

export class AnsweredQueryDto {
  @ApiProperty({
    format: "uuid",
    description:
      "The conversation to open. An existing thread with this family if there was one, so a " +
      "parent never ends up with two conversations for one coach.",
  })
  enquiryId!: string;
}
