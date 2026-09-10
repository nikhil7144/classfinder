import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export const DEMAND_KINDS = ["student", "group"] as const;

/**
 * The coach's own demand feed, filtered.
 *
 * providerId is required and must be theirs. students_for_provider() is
 * security definer and checks `p.user_id = auth.uid()` itself, so passing
 * somebody else's listing returns nothing rather than their families — the
 * ownership rule stays in one place. Mirrors StudentSuggestionsQueryDto,
 * which asks for the same thing for the same reason.
 */
export class StudentsQueryDto {
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

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 200, default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * One family, or one group of them, who said what they want.
 *
 * A `student` is a single parent's requirement; a `group` is several families
 * who agreed on one before approaching anybody, and `memberCount` says how
 * many. Answering a group once reaches all of them.
 *
 * Carries no name, no email and no phone number. A coach sees the requirement
 * and answers through Aspire91; contact details only ever arrive later, and
 * only if the family shares them.
 */
export class DemandRowDto {
  @ApiProperty({ enum: DEMAND_KINDS })
  kind!: string;

  @ApiProperty({ format: "uuid", description: "The seeker or the group. Unique within its kind." })
  id!: string;

  @ApiProperty({ type: [String], format: "uuid" })
  serviceCategoryIds!: string[];

  @ApiProperty({ type: [String], description: "The service names, as they read today." })
  serviceNames!: string[];

  @ApiProperty({ type: [String], description: "Which taxonomy groups those services sit in." })
  serviceGroups!: string[];

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  areaId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  areaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Kilometres from the nearest place this coach can be found at.",
  })
  distanceKm!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "The learner's age. Never their name." })
  learnerAge!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "beginner" })
  level!: string | null;

  @ApiProperty({ type: [String], description: "At home, at your centre, online." })
  preferredModes!: string[];

  @ApiProperty({ type: [String] })
  preferredDays!: string[];

  @ApiProperty({ type: String, nullable: true })
  preferredTime!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  budgetMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  budgetMax!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "per_month" })
  budgetPeriod!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Whatever the family typed." })
  notes!: string | null;

  @ApiProperty({ description: "How many children this is for." })
  studentCount!: number;

  @ApiProperty({ description: "Families in the group. 1 for a single parent's requirement." })
  memberCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: "date-time",
    description: "When a group stops accepting answers. Null for a single requirement.",
  })
  expiresAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Set once this coach has written to them, and null until. Rows with a status are pushed " +
      "below the untouched ones and are not re-ranked by the suggestions endpoint.",
  })
  contactStatus!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "uuid",
    description: "The conversation, once one exists.",
  })
  threadId!: string | null;
}
