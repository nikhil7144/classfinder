import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { AlertsDto } from "./dto/alerts.dto";

type AlertsJson = Record<string, unknown>;

/** Every counter is a count(*) — bigint, and a string by the time it lands. */
const count = (value: unknown): number => Number(value ?? 0);

export const toAlerts = (row: AlertsJson): AlertsDto => ({
  pendingPitches: count(row.pending_pitches),
  groupsNeedingMembers: count(row.groups_needing_members),
  acceptedPitches: count(row.accepted_pitches),
  pendingApproaches: count(row.pending_approaches),
  unreadThreads: count(row.unread_threads),
  unansweredEnquiries: count(row.unanswered_enquiries),
  needsYou: count(row.needs_you),
});

@Injectable()
export class AlertsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Read as the caller. my_alerts() resolves auth.uid() itself and answers for
   * whoever asks, which is why there is no role parameter: the same call means
   * different things to a parent and a coach, and the client shows whichever
   * counters its role uses.
   */
  async mine(caller: Caller): Promise<AlertsDto> {
    const { data, error } = await this.supabase.asUser(caller.accessToken).rpc("my_alerts");

    if (error) throw new InternalServerErrorException(error.message);
    // A caller with nothing pending still gets an object of zeroes rather than
    // null, so a client never has to branch on "no alerts yet".
    return toAlerts((data as AlertsJson) ?? {});
  }

  /**
   * Clear notifications, optionally just one conversation's.
   *
   * A definer write: it stamps read_at on rows belonging to the caller, and
   * RLS cannot express "update only your own, and only this column".
   */
  async markRead(caller: Caller, threadId: string | null): Promise<void> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("mark_notifications_read", { p_thread_id: threadId });

    if (error) throw new InternalServerErrorException(error.message);
  }
}
