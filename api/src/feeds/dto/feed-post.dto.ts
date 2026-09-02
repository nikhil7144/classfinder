import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * One post as the API describes it.
 *
 * camelCase, unlike the snake_case the database returns. That mapping is the
 * point of having a contract at all: the wire format is now something the API
 * promises and can keep promising, rather than whatever a Postgres function
 * happened to name its columns. Renaming a column in db/ stops being a
 * breaking change for an installed mobile app.
 */
export class FeedPostDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid", description: "The coach who wrote it." })
  providerId!: string;

  @ApiProperty({ nullable: true, type: String })
  displayName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  photoUrl!: string | null;

  @ApiProperty({ nullable: true, type: String, example: "Sports Academy" })
  categoryName!: string | null;

  @ApiProperty({ enum: ["photo", "video"] })
  kind!: "photo" | "video";

  @ApiProperty({ nullable: true, type: String })
  body!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Set when kind is photo." })
  imageUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The 11-character YouTube id. Set when kind is video.",
    example: "dQw4w9WgXcQ",
  })
  youtubeId!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ description: "Total, across everyone." })
  likes!: number;

  @ApiProperty()
  wows!: number;

  @ApiProperty()
  surprises!: number;

  @ApiPropertyOptional({
    enum: ["like", "wow", "surprise"],
    nullable: true,
    description: "This caller's own reaction. Absent on the public feed, which has no caller.",
  })
  myReaction?: "like" | "wow" | "surprise" | null;

  @ApiPropertyOptional({ description: "Whether this caller has already reported it." })
  iReported?: boolean;

  @ApiPropertyOptional({
    enum: ["following", "interest"],
    description:
      "Why this post is in the feed. 'following' means the caller follows this coach; " +
      "'interest' means we suggested them. Absent on the public feed.",
  })
  reason?: "following" | "interest";
}
