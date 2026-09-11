import { ApiProperty } from "@nestjs/swagger";

export const THREAD_KINDS = ["group", "enquiry"] as const;

/**
 * One conversation in the inbox, from either side of it.
 *
 * my_threads() unions two things that are the same thing to a reader: a coach
 * pitching a group of neighbours, and a family enquiring with a coach. The
 * columns are named so one list renders both — `title`, `subtitle` and
 * `photoUrl` already resolve to whichever side the caller is on, which is why
 * there is no "otherPartyName" here to compute.
 *
 * The messages themselves are not in this list. It carries the last one and a
 * count; opening a thread is a separate read, and new messages arrive over
 * Realtime rather than by polling this.
 */
/** Where a conversation came from, when it came from a request for a call. */
export class QueryOriginDto {
  @ApiProperty({ format: "uuid" })
  queryId!: string;

  @ApiProperty({ type: String, nullable: true, description: "What they asked about." })
  serviceName!: string | null;

  @ApiProperty({ format: "date-time", description: "When they asked, not when the coach replied." })
  askedAt!: string;
}

export class ThreadDto {
  @ApiProperty({
    enum: THREAD_KINDS,
    description:
      "Which surface the conversation belongs to. It decides where the messages live and which " +
      "actions the thread offers, so a client must branch on it.",
  })
  kind!: string;

  @ApiProperty({
    format: "uuid",
    description:
      "The group request or the enquiry. Unique within its kind, not across both — pair it with " +
      "kind before using it as a key.",
  })
  threadId!: string;

  @ApiProperty({ type: String, nullable: true, format: "uuid", description: "Group threads only." })
  groupId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  providerId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Already resolved for this reader." })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true })
  subtitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The message that started it." })
  opening!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Where the approach or enquiry stands." })
  status!: string | null;

  @ApiProperty({
    enum: ["provider", "seeker"],
    description: "Who opened it. A group pitch is always the coach's approach.",
  })
  initiatedBy!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  lastMessage!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  lastMessageAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  lastSenderId!: string | null;

  @ApiProperty()
  messageCount!: number;

  @ApiProperty({
    description:
      "Something arrived after this reader last looked, and they did not send it. Computed for " +
      "the caller, so it means different things to the two sides of the same thread.",
  })
  unread!: boolean;

  @ApiProperty({ description: "Which side of this conversation the caller is on." })
  iAmSeeker!: boolean;

  @ApiProperty({
    type: () => QueryOriginDto,
    nullable: true,
    description:
      "Set when this conversation began with a request for a call. A message from somebody you " +
      "never wrote to is what makes contact feel unsolicited, so the parent is told which of " +
      "their own requests produced it. Null for every other thread.",
  })
  origin!: QueryOriginDto | null;
}
