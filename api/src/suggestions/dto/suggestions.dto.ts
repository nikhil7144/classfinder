import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/**
 * The provider blob is passed through from search_providers() as-is.
 *
 * Not modelled column by column, deliberately: this is the same row the
 * search screen already renders, and re-declaring twenty optional fields here
 * would be two definitions of one shape, drifting apart. What the contract
 * promises is the envelope — what `reason` means, and when `ranked` is true.
 */
export class CoachSuggestionDto {
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "A row as search_providers() returns it, passed through unchanged.",
  })
  provider!: Record<string, unknown>;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Why the model placed this coach here. Null when the list was not ranked.",
  })
  reason!: string | null;
}

export class CoachSuggestionsDto {
  @ApiProperty({ type: [CoachSuggestionDto] })
  suggestions!: CoachSuggestionDto[];

  @ApiProperty({ description: "False when the list is in plain distance order." })
  ranked!: boolean;

  @ApiPropertyOptional({ description: "True when served from the stored ranking." })
  cached?: boolean;

  @ApiPropertyOptional({
    enum: ["not_a_seeker", "no_requirement", "no_origin", "nothing_nearby"],
    description:
      "Why there is nothing to show; absent when there is. The caller renders these very " +
      "differently — 'no_requirement' is an invitation to state one, 'not_a_seeker' is not.",
  })
  reason?: string;
}

/**
 * Which listing, and which slice of its demand feed.
 *
 * Filters only — never the rows themselves. The service fetches those, on the
 * grounds that what the model is shown about other people's families should
 * not be something a caller can compose.
 */
export class StudentSuggestionsQueryDto {
  @ApiProperty({ format: "uuid", description: "The coach's own listing. Must belong to them." })
  @IsUUID()
  providerId!: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  areaId?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 200, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  radiusKm?: number;
}

/**
 * Keys, not rows.
 *
 * `key` is "kind:id" and matches a row the caller already has on screen —
 * sending the families back would ship the same rows twice, and this response
 * is rendered as an overlay on a list that is already there.
 */
export class StudentSuggestionDto {
  @ApiProperty({ example: "seeker:6f1c...", description: "\"kind:id\" of a demand row." })
  key!: string;

  @ApiProperty({ description: "Why the model placed it here." })
  reason!: string;
}

export class StudentSuggestionsDto {
  @ApiProperty({ type: [StudentSuggestionDto] })
  suggestions!: StudentSuggestionDto[];

  @ApiPropertyOptional({
    enum: ["not_a_provider", "no_demand"],
    description:
      "Why there is nothing to rank. 'no_demand' also covers too few untouched rows to be " +
      "worth a model call — the caller keeps showing its own unranked list either way.",
  })
  reason?: string;
}
