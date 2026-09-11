import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  ProposeTrialDto,
  RespondToTrialDto,
  SetTrialOutcomeDto,
  TrialDto,
  TrialsQueryDto,
} from "./dto/trial.dto";

/** A row exactly as thread_trials() returns it. */
type Row = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  place: string | null;
  place_label: string | null;
  place_note: string | null;
  student_count: number | null;
  status: string;
  proposed_by: string;
  i_proposed: boolean;
  seeker_outcome: string | null;
  provider_outcome: string | null;
  my_outcome: string | null;
  created_at: string;
};

export const toTrial = (r: Row): TrialDto => ({
  id: r.id,
  scheduledAt: r.scheduled_at,
  durationMinutes: r.duration_minutes,
  place: r.place,
  placeLabel: r.place_label,
  placeNote: r.place_note,
  studentCount: r.student_count,
  status: r.status,
  proposedBy: r.proposed_by,
  iProposed: Boolean(r.i_proposed),
  seekerOutcome: r.seeker_outcome,
  providerOutcome: r.provider_outcome,
  myOutcome: r.my_outcome,
  createdAt: r.created_at,
});

@Injectable()
export class TrialsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Every trial arranged in one conversation.
   *
   * thread_trials() resolves `iProposed` and `myOutcome` for whoever asks and
   * restricts itself to participants, which is the whole access rule — a
   * thread id belonging to somebody else answers empty rather than theirs.
   */
  async forThread(caller: Caller, query: TrialsQueryDto): Promise<TrialDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("thread_trials", { p_kind: query.kind, p_thread_id: query.threadId });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as Row[]) ?? []).map(toTrial);
  }

  /**
   * Suggest a time.
   *
   * The function decides whether the caller may — they have to be in the
   * thread, and the thread has to be live. It returns the new id, which is
   * read back through thread_trials() so the answer has the same shape the
   * list does rather than a second one to learn.
   */
  async propose(caller: Caller, body: ProposeTrialDto): Promise<TrialDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("propose_trial", {
        p_kind: body.kind,
        p_thread_id: body.threadId,
        p_scheduled_at: body.scheduledAt,
        p_duration_minutes: body.durationMinutes ?? 60,
        p_place: body.place ?? null,
        p_place_note: body.placeNote ?? null,
        p_student_count: body.studentCount ?? null,
      });

    if (error) throw new ForbiddenException(error.message);

    return this.readBack(caller, body.kind, body.threadId, data as string);
  }

  /** Saying yes or no to a time. */
  async respond(
    caller: Caller,
    id: string,
    kind: string,
    threadId: string,
    body: RespondToTrialDto,
  ): Promise<TrialDto> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("respond_to_trial", { p_trial_id: id, p_status: body.status });

    if (error) throw new ForbiddenException(error.message);
    return this.readBack(caller, kind, threadId, id);
  }

  /** What happened, from this side. */
  async setOutcome(
    caller: Caller,
    id: string,
    kind: string,
    threadId: string,
    body: SetTrialOutcomeDto,
  ): Promise<TrialDto> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("mark_trial_outcome", { p_trial_id: id, p_outcome: body.outcome });

    if (error) throw new ForbiddenException(error.message);
    return this.readBack(caller, kind, threadId, id);
  }

  /**
   * One trial, read through the list function.
   *
   * There is no get-one in the database and adding one would be a second
   * definition of who may see a trial. The thread is small — a handful of
   * rows — so filtering here costs nothing and keeps that rule in one place.
   */
  private async readBack(
    caller: Caller,
    kind: string,
    threadId: string,
    id: string,
  ): Promise<TrialDto> {
    const trials = await this.forThread(caller, { kind, threadId });
    const trial = trials.find((t) => t.id === id);

    if (!trial) throw new NotFoundException("That trial is no longer there.");
    return trial;
  }
}
