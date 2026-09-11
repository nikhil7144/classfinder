import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";

/** What the demand feed calls the two things a coach can write to. */
export const APPROACH_KINDS = ["student", "group"] as const;

/**
 * A coach writing first.
 *
 * The consent rule is the database's and this endpoint does not restate it: an
 * enquiry a coach opens starts 'pending', never 'open', pinned by a check
 * constraint. While it is pending the coach cannot send a second message, is
 * not told the parent's name, and cannot be given their phone number. The
 * family decides whether any of that changes.
 */
export class ApproachDto {
  @ApiProperty({ format: "uuid", description: "The coach's own listing. Must belong to them." })
  @IsUUID()
  providerId!: string;

  @ApiProperty({
    minLength: 20,
    maxLength: 1000,
    description:
      "The pitch. Twenty characters is the database's own floor for a group request and the " +
      "web's for both — a family judges a stranger on this, and three words is not enough to " +
      "judge on.",
  })
  @IsString()
  @Length(20, 1000)
  message!: string;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Which service this is about. Ignored for a group, which already names one.",
  })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string | null;
}

/** What came of it. */
export class ApproachResultDto {
  @ApiProperty({ format: "uuid", description: "The enquiry or the group request." })
  id!: string;

  @ApiProperty({ enum: APPROACH_KINDS })
  kind!: string;

  @ApiProperty({
    description: "Always 'pending' for a coach's first message. The family decides what follows.",
  })
  status!: string;
}
