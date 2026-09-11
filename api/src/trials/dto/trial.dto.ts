import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { THREAD_KINDS } from "../../threads/dto/thread.dto";

export const TRIAL_STATUSES = ["proposed", "confirmed", "declined"] as const;
export const TRIAL_OUTCOMES = ["happened", "no_show", "cancelled"] as const;

/**
 * A first class, arranged inside a conversation.
 *
 * The product's whole argument is that a family and a coach should end up in a
 * room together, and this is the row that says when. It hangs off a thread
 * rather than standing alone, because a trial with nobody talking about it is
 * a calendar entry, not an arrangement.
 *
 * `iProposed` and `myOutcome` are answers about the caller, so the same trial
 * reads differently to the two people in it. That is resolved by the function,
 * not here.
 */
export class TrialDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "date-time" })
  scheduledAt!: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty({ type: String, nullable: true, description: "A teaching place id, not a uuid." })
  place!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "What that place is called." })
  placeLabel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  placeNote!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "For a group, how many are coming." })
  studentCount!: number | null;

  @ApiProperty({ enum: TRIAL_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid" })
  proposedBy!: string;

  @ApiProperty({ description: "Whether the caller is the one who suggested it." })
  iProposed!: boolean;

  @ApiProperty({ type: String, nullable: true, enum: TRIAL_OUTCOMES })
  seekerOutcome!: string | null;

  @ApiProperty({ type: String, nullable: true, enum: TRIAL_OUTCOMES })
  providerOutcome!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: TRIAL_OUTCOMES,
    description:
      "Whichever of the two above belongs to the caller. Both sides record what happened " +
      "separately, so neither is asked to accept the other's account of it.",
  })
  myOutcome!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

/** Which conversation to read trials from. */
export class TrialsQueryDto {
  @ApiProperty({ enum: THREAD_KINDS })
  @IsIn(THREAD_KINDS)
  kind!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  threadId!: string;
}

export class ProposeTrialDto {
  @ApiProperty({ enum: THREAD_KINDS })
  @IsIn(THREAD_KINDS)
  kind!: string;

  @ApiProperty({ format: "uuid", description: "The conversation this is being arranged in." })
  @IsUUID()
  threadId!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601()
  scheduledAt!: string;

  @ApiPropertyOptional({ default: 60, minimum: 15, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "A teaching place id — 'own_centre', 'student_home', 'online'.",
  })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  place?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Directions, a landmark, a gate number." })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  placeNote?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "For a group thread: how many children are coming.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  studentCount?: number | null;
}

/**
 * Where the trial lives, carried on the writes.
 *
 * thread_trials() is the only reader, and it is keyed on the thread rather
 * than the trial. Adding a get-one to the database would be a second
 * definition of who may see a trial, so the client says which conversation it
 * is in and the answer comes back through the same function the list uses.
 */
class TrialThreadRefDto {
  @ApiProperty({ enum: THREAD_KINDS })
  @IsIn(THREAD_KINDS)
  kind!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  threadId!: string;
}

/** Saying yes or no to a time somebody suggested. */
export class RespondToTrialDto extends TrialThreadRefDto {
  @ApiProperty({ enum: ["confirmed", "declined"] })
  @IsIn(["confirmed", "declined"])
  status!: string;
}

/**
 * What actually happened, recorded per side.
 *
 * Both parties answer separately and neither sees the other's answer as their
 * own. A coach marking a no-show does not put that on the family's record, and
 * a family saying it was cancelled does not overwrite the coach's note.
 */
export class SetTrialOutcomeDto extends TrialThreadRefDto {
  @ApiProperty({ enum: TRIAL_OUTCOMES })
  @IsIn(TRIAL_OUTCOMES)
  outcome!: string;
}
