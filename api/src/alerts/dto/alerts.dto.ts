import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

/**
 * The badge numbers, all of them, in one read.
 *
 * my_alerts() answers for whoever is asking, so the same call means different
 * things to a parent and a coach — pendingPitches is a parent's decision to
 * make, pendingApproaches is a coach's. A client shows whichever apply to the
 * role it is running as rather than asking for a filtered set.
 *
 * `needsYou` is not the sum of the others. It counts unread notifications of
 * the kinds that want an action, which is the number a bell should carry.
 */
export class AlertsDto {
  @ApiProperty({ description: "Coach pitches waiting on a decision, for groups the caller made." })
  pendingPitches!: number;

  @ApiProperty({ description: "The caller's groups that are still short of the members to go live." })
  groupsNeedingMembers!: number;

  @ApiProperty({ description: "Pitches the caller accepted." })
  acceptedPitches!: number;

  @ApiProperty({ description: "Coaches who approached the caller and are waiting on them." })
  pendingApproaches!: number;

  @ApiProperty({ description: "Conversations with something arrived since the caller last looked." })
  unreadThreads!: number;

  @ApiProperty({ description: "Enquiries a coach has not answered." })
  unansweredEnquiries!: number;

  @ApiProperty({
    description:
      "Unread notifications of the kinds that want an action. The bell number, and not the sum " +
      "of the counters above.",
  })
  needsYou!: number;
}

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Mark only this conversation's notifications read. Omit to clear everything — which is " +
      "what opening the bell means.",
  })
  @IsOptional()
  @IsUUID()
  threadId?: string | null;
}
