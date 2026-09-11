import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export const RELATIONS = ["self", "mother", "father", "guardian", "relative", "other"] as const;
export const LEVELS = ["beginner", "improver", "advanced", "exam_prep"] as const;
export const PREFERRED_TIMES = [
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend",
  "flexible",
] as const;
export const BUDGET_PERIODS = ["per_hour", "per_session", "per_month", "per_course"] as const;
export const TEACHING_MODES = ["own_centre", "student_home", "online"] as const;

/**
 * A family's own profile, as they edit it.
 *
 * Deliberately not the seeker block on MeDto. That one is four fields for
 * deciding what to render; this is everything the form binds to, and the field
 * names match SaveSeekerProfileDto so a client can load, edit and send it back
 * with no translation layer.
 *
 * `profileComplete` is state, not input. The save endpoint refuses it and
 * save_seeker_profile() decides it.
 */
export class MySeekerDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: RELATIONS,
    description:
      "Who they are looking for. A fact about the person rather than the search — a father is " +
      "a father whether or not he is looking this month — and it changes what a coach is being " +
      "asked to do.",
  })
  relationToLearner!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  areaId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  lat!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lng!: number | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: [String], format: "uuid", description: "What they are looking for." })
  lookingFor!: string[];

  @ApiProperty({ type: Number, nullable: true })
  learnerAge!: number | null;

  @ApiProperty({ type: String, nullable: true, enum: LEVELS })
  level!: string | null;

  @ApiProperty({ type: [String], enum: TEACHING_MODES })
  preferredModes!: string[];

  @ApiProperty({ type: [String], example: ["sat", "sun"] })
  preferredDays!: string[];

  @ApiProperty({ type: String, nullable: true, enum: PREFERRED_TIMES })
  preferredTime!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  budgetMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  budgetMax!: number | null;

  @ApiProperty({ type: String, nullable: true, enum: BUDGET_PERIODS })
  budgetPeriod!: string | null;

  @ApiProperty({ type: String, nullable: true })
  requirementNotes!: string | null;

  @ApiProperty({
    description:
      "The consent switch, and nothing else here reads as one. Off hides them from " +
      "students_for_provider entirely and immediately.",
  })
  openToOffers!: boolean;

  @ApiProperty({ description: "Asked in plain words, and defaulted off." })
  marketingOptIn!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: "date-time",
    description: "Stamped on every save: the demand feed sorts on it.",
  })
  requirementUpdatedAt!: string | null;

  @ApiProperty({ description: "Whether the profile has ever been saved in full." })
  profileComplete!: boolean;
}

/**
 * A family's whole profile, saved in one call.
 *
 * The whole thing every time, not a patch — save_seeker_profile() upserts the
 * row, so a partial payload would clear what it omitted. The same shape
 * SaveProviderProfileDto uses, for the same reason.
 */
export class SaveSeekerProfileDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: RELATIONS })
  @IsIn(RELATIONS, { message: "Tell us who you are looking for." })
  relationToLearner!: string;

  @ApiProperty({ format: "uuid", description: "Where they are. This is what search is centred on." })
  @IsUUID()
  areaId!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "A Storage URL, never bytes." })
  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  lookingFor?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 2, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(99)
  learnerAge?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: LEVELS })
  @IsOptional()
  @IsIn(LEVELS)
  level?: string | null;

  @ApiPropertyOptional({ type: [String], enum: TEACHING_MODES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(TEACHING_MODES, { each: true })
  preferredModes?: string[];

  @ApiPropertyOptional({ type: [String], example: ["sat", "sun"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @Length(1, 12, { each: true })
  preferredDays?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, enum: PREFERRED_TIMES })
  @IsOptional()
  @IsIn(PREFERRED_TIMES)
  preferredTime?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMin?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMax?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: BUDGET_PERIODS })
  @IsOptional()
  @IsIn(BUDGET_PERIODS)
  budgetPeriod?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  requirementNotes?: string | null;

  @ApiPropertyOptional({
    default: true,
    description:
      "Whether coaches may approach them. Defaults true because a parent who has just typed " +
      "out what they want has, in the ordinary meaning of it, asked to be found.",
  })
  @IsOptional()
  @IsBoolean()
  openToOffers?: boolean;

  @ApiPropertyOptional({ default: false, description: "Defaulted off, and asked in plain words." })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}
