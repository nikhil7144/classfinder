import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  AnswerQueryDto,
  AnsweredQueryDto,
  QueryDto,
  RaiseQueryDto,
  UpdateQueryStatusDto,
} from "./dto/query.dto";

type Row = {
  id: string;
  provider_id: string;
  seeker_id: string;
  contact_name: string;
  contact_phone: string;
  service_category_id: string | null;
  details: string | null;
  status: string;
  callback_at: string | null;
  created_at: string;
  responded_at: string | null;
  providers?: { display_name: string | null } | null;
  service_category_master?: { name: string | null } | null;
  enquiries?: { id: string }[] | null;
};

// Joined by name so one round trip answers the whole list. PostgREST resolves
// these through the foreign keys declared in phase3h.
// The client is untyped — there are no generated database types in this
// project — so supabase-js cannot infer the shape of an embedded select and
// returns GenericStringError. Casting through unknown is the escape; `Row`
// above is the hand-written truth, and the tests exercise the mapping.
const COLUMNS =
  "id, provider_id, seeker_id, contact_name, contact_phone, service_category_id, details, " +
  "status, callback_at, created_at, responded_at, " +
  "providers(display_name), service_category_master(name), enquiries(id)";

const toDto = (r: Row): QueryDto => ({
  id: r.id,
  providerId: r.provider_id,
  providerName: r.providers?.display_name ?? null,
  seekerId: r.seeker_id,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  serviceCategoryId: r.service_category_id,
  serviceName: r.service_category_master?.name ?? null,
  details: r.details,
  status: r.status,
  callbackAt: r.callback_at,
  createdAt: r.created_at,
  respondedAt: r.responded_at,
  enquiryId: r.enquiries?.[0]?.id ?? null,
});

@Injectable()
export class QueriesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Every query the caller is party to.
   *
   * One method for both sides: "participants read queries" returns a coach
   * their leads and a parent their own requests, so the same read serves the
   * dashboard tab and the parent's list without either asking who is calling.
   */
  async list(caller: Caller, status?: string): Promise<QueryDto[]> {
    let q = this.supabase
      .asUser(caller.accessToken)
      .from("queries")
      .select(COLUMNS)
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw new InternalServerErrorException(error.message);
    return ((data as unknown as Row[]) ?? []).map(toDto);
  }

  /**
   * Raise one.
   *
   * Inserted as the caller, so "seeker raises query" does the deciding: a
   * completed seeker profile, an approved coach, and a row that starts 'new'.
   * None of that is re-checked here — a second copy of a rule is the copy that
   * drifts.
   */
  async raise(caller: Caller, body: RaiseQueryDto): Promise<QueryDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("queries")
      .insert({
        seeker_id: caller.id,
        provider_id: body.providerId,
        contact_name: body.contactName.trim(),
        contact_phone: body.contactPhone.trim(),
        service_category_id: body.serviceCategoryId ?? null,
        details: body.details?.trim() || null,
      })
      .select(COLUMNS)
      .single();

    if (error) {
      // queries_one_live. Pressing the button twice is the common cause, and
      // "you already have one open" is more use than a unique-index message.
      if (error.code === "23505") {
        throw new BadRequestException("You've already asked this coach to get in touch.");
      }
      // The insert policy refused it — not a seeker, profile incomplete, or
      // the coach is not approved.
      if (error.code === "42501") {
        throw new ForbiddenException("Finish your profile before asking a coach to call you.");
      }
      throw new InternalServerErrorException(error.message);
    }

    return toDto(data as unknown as Row);
  }

  /** The coach moves the lead along. Ownership is checked inside the function. */
  async setStatus(caller: Caller, id: string, body: UpdateQueryStatusDto): Promise<QueryDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { error } = await db.rpc("set_query_status", {
      p_query_id: id,
      p_status: body.status,
      p_callback_at: body.callbackAt ?? null,
    });
    if (error) throw new ForbiddenException(error.message);

    const { data } = await db.from("queries").select(COLUMNS).eq("id", id).single();
    return toDto(data as unknown as Row);
  }

  /**
   * Answer it in writing.
   *
   * The database decides where the message lands: an existing live thread with
   * this family if there is one, a new one otherwise. That reconciliation has
   * to happen there, because enquiries_one_live would otherwise reject the
   * insert, and because a parent must never end up with two conversations for
   * one coach.
   */
  async answer(caller: Caller, id: string, body: AnswerQueryDto): Promise<AnsweredQueryDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("answer_query", { p_query_id: id, p_message: body.message.trim() });

    if (error) throw new ForbiddenException(error.message);
    return { enquiryId: data as string };
  }

  async markRead(caller: Caller, id: string): Promise<void> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("mark_query_read", { p_query_id: id });
    if (error) throw new InternalServerErrorException(error.message);
  }
}
