import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { ThreadDto } from "../threads/dto/thread.dto";
import { ThreadRow, toThread } from "../threads/threads.service";
import { CreateEnquiryDto, RespondToApproachDto, SetPhoneSharingDto } from "./dto/enquiry.dto";

@Injectable()
export class EnquiriesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * A family writing to a coach.
   *
   * Inserted as the caller, so "seeker sends enquiry" does the deciding: a
   * completed seeker profile, an approved coach, and one live enquiry per
   * pair. None of that is re-checked here — a second copy of a rule is the
   * copy that drifts.
   */
  async create(caller: Caller, body: CreateEnquiryDto): Promise<{ enquiryId: string }> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("enquiries")
      .insert({
        seeker_id: caller.id,
        provider_id: body.providerId,
        service_category_id: body.serviceCategoryId ?? null,
        message: body.message.trim(),
        show_phone: body.sharePhone ?? false,
      })
      .select("id")
      .single();

    if (error) {
      // enquiries_one_live. Two taps on a slow connection is the common cause,
      // and "you are already talking to them" is more use than an index name.
      if (error.code === "23505") {
        throw new BadRequestException("You already have a conversation open with this coach.");
      }
      // The insert policy refused it: not a seeker, profile incomplete, or the
      // coach is not approved.
      if (error.code === "42501") {
        throw new ForbiddenException("Finish your profile before writing to a coach.");
      }
      throw new InternalServerErrorException(error.message);
    }

    return { enquiryId: (data as { id: string }).id };
  }

  /**
   * A family answering a coach who approached them.
   *
   * Definer, because accepting has to flip the status and stamp the phone
   * decision together — and because declining must not be expressible as an
   * ordinary update by either party.
   */
  async respond(caller: Caller, id: string, body: RespondToApproachDto): Promise<ThreadDto> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("respond_to_approach", {
        p_enquiry_id: id,
        p_accept: body.accept,
        p_share_phone: body.sharePhone ?? false,
      });

    if (error) throw new ForbiddenException(error.message);
    return this.readBack(caller, id);
  }

  /** The coach taking back an approach the family has not answered. */
  async withdraw(caller: Caller, id: string): Promise<void> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("withdraw_approach", { p_enquiry_id: id });

    if (error) throw new ForbiddenException(error.message);
  }

  /** Turning the number on or off. Revocable, and immediately. */
  async setPhoneSharing(
    caller: Caller,
    id: string,
    body: SetPhoneSharingDto,
  ): Promise<ThreadDto> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("set_enquiry_phone_sharing", { p_enquiry_id: id, p_share: body.share });

    if (error) throw new ForbiddenException(error.message);
    return this.readBack(caller, id);
  }

  /**
   * The thread as it now reads, through the same function the inbox uses.
   *
   * Answering with the thread rather than the raw row means a client re-renders
   * from one shape, and `status`, `unread` and `iAmSeeker` are resolved for
   * whoever asked rather than left for it to work out.
   */
  private async readBack(caller: Caller, id: string): Promise<ThreadDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("my_threads");

    if (error) throw new InternalServerErrorException(error.message);

    const row = ((data as ThreadRow[]) ?? []).find(
      (t) => t.kind === "enquiry" && t.thread_id === id,
    );

    // my_threads() has no status filter on its enquiry branch, so a declined
    // thread still comes back — carrying status 'declined', which is exactly
    // what a client needs to render the answer. Missing here means the row is
    // genuinely gone, which neither of the callers above can cause.
    if (!row) {
      throw new NotFoundException("That conversation no longer exists.");
    }

    return toThread(row);
  }
}
