import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";

export const POST_KINDS = ["photo", "video"] as const;
export const REACTIONS = ["like", "wow", "surprise"] as const;

/**
 * A coach's Space — the page a family reads while deciding.
 *
 * get_space() applies the visibility rule itself: public Spaces, plus your own
 * whatever state it is in. `suspendedReason` is null to everyone but the
 * owner, which is why it comes from the function rather than being assembled
 * from columns here.
 */
export class SpaceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  providerId!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  headline!: string | null;

  @ApiProperty({ type: String, nullable: true })
  about!: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null;

  @ApiProperty()
  followerCount!: number;

  @ApiProperty({ description: "Hidden posts are not counted." })
  postCount!: number;

  @ApiProperty({ description: "Whether the caller follows it. False when signed out." })
  iFollow!: boolean;

  @ApiProperty({ description: "Whether the caller owns it." })
  isMine!: boolean;

  @ApiProperty()
  isSuspended!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Why it was taken down. The owner's business and nobody else's, so null to them.",
  })
  suspendedReason!: string | null;
}

/** One post on a Space, with the counts and this viewer's own reaction. */
export class SpacePostDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: POST_KINDS })
  kind!: string;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The 11-character YouTube id." })
  youtubeId!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({
    description:
      "A hidden post stays in the table — the report queue is about it, and deleting the " +
      "evidence when the complaint arrives is the wrong instinct. Only the owner sees one.",
  })
  isHidden!: boolean;

  @ApiProperty({ type: String, nullable: true, description: "Owner-only, like suspendedReason." })
  hiddenReason!: string | null;

  @ApiProperty()
  likes!: number;

  @ApiProperty()
  wows!: number;

  @ApiProperty()
  surprises!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: REACTIONS,
    description: "The caller's own. Counted server-side: space_reactions is readable only for your own rows.",
  })
  myReaction!: string | null;

  @ApiProperty()
  iReported!: boolean;
}

/** A Space the caller follows. The roster, not the reading surface. */
export class FollowedSpaceDto {
  @ApiProperty({ format: "uuid" })
  providerId!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  headline!: string | null;

  @ApiProperty()
  postCount!: number;

  @ApiProperty({ format: "date-time" })
  followedAt!: string;
}

export class SpacePostsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 60, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;

  @ApiPropertyOptional({ format: "date-time", description: "Posts older than this." })
  @IsOptional()
  @IsISO8601()
  before?: string;
}

/**
 * What a coach is posting.
 *
 * The bytes never come through here. An image is uploaded to Storage against a
 * signed URL and its public URL arrives as `imageUrl`; PLAN.md keeps that door
 * open, and forwarding 5 MB through the API to hand it to Supabase is waste.
 */
export class CreateSpacePostDto {
  @ApiProperty({ enum: POST_KINDS })
  @IsIn(POST_KINDS)
  kind!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  body?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Storage URL for a photo post. The database refuses anything not http(s).",
  })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "The 11-character id only." })
  @IsOptional()
  @IsString()
  @Length(11, 11)
  youtubeId?: string | null;
}

export class SetReactionDto {
  @ApiProperty({
    enum: REACTIONS,
    nullable: true,
    description: "Null clears the caller's reaction. Sending the same one again is not a toggle.",
  })
  @IsOptional()
  @IsIn(REACTIONS)
  reaction!: string | null;
}

export class SpaceIdParamDto {
  @IsUUID()
  providerId!: string;
}
