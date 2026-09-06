import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  CancelEntryDto,
  CreateEntryDto,
  EntryDto,
  EntryMemberDto,
  SetEntryPaymentDto,
} from "./dto/entry.dto";

type MemberRow = {
  id: string;
  name: string;
  dob: string | null;
  sort_order: number;
};

type EntryRow = {
  id: string;
  event_id: string;
  event_category_id: string;
  seeker_id: string;
  participant_name: string;
  participant_dob: string | null;
  status: "confirmed" | "cancelled";
  payment_status: "unpaid" | "paid" | "refund_due" | "refunded" | "waived";
  payment_mode: "cash" | "upi" | "bank_transfer" | "card" | "other" | null;
  payment_reference: string | null;
  paid_at: string | null;
  amount_due: number | string | null;
  receipt_no: string;
  entered_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  events?: { title: string; starts_at: string; status: string } | null;
  event_categories?: { name: string } | null;
  event_entry_members?: MemberRow[] | null;
};

const COLUMNS =
  "id, event_id, event_category_id, seeker_id, participant_name, participant_dob, status, " +
  "payment_status, payment_mode, payment_reference, paid_at, amount_due, receipt_no, " +
  "entered_at, cancelled_at, cancelled_by, cancelled_reason, " +
  "events(title, starts_at, status), event_categories(name), " +
  "event_entry_members(id, name, dob, sort_order)";

const toMemberDto = (r: MemberRow): EntryMemberDto => ({
  id: r.id,
  name: r.name,
  dob: r.dob,
  sortOrder: r.sort_order,
});

/**
 * `cancelled_by` is a profile id and is not returned.
 *
 * A family does not need to be told which employee of the company cancelled
 * their entry, and the organiser's register does not need the parent's user
 * id to know a parent withdrew. What either side actually asks is "was this
 * us or them", so that is the field.
 */
const toDto = (r: EntryRow, viewerId: string): EntryDto => ({
  id: r.id,
  eventId: r.event_id,
  eventTitle: r.events?.title ?? null,
  eventStartsAt: r.events?.starts_at ?? null,
  eventStatus: r.events?.status ?? null,
  categoryId: r.event_category_id,
  categoryName: r.event_categories?.name ?? null,
  seekerId: r.seeker_id,
  participantName: r.participant_name,
  participantDob: r.participant_dob,
  status: r.status,
  paymentStatus: r.payment_status,
  paymentMode: r.payment_mode,
  paymentReference: r.payment_reference,
  paidAt: r.paid_at,
  // numeric(10,2) arrives as a string, for the reason the events service
  // documents. A fee in rupees is well inside a double.
  amountDue: r.amount_due === null || r.amount_due === undefined ? null : Number(r.amount_due),
  receiptNo: r.receipt_no,
  enteredAt: r.entered_at,
  cancelledAt: r.cancelled_at,
  cancelledReason: r.cancelled_reason,
  cancelledByMe: r.cancelled_by !== null && r.cancelled_by === viewerId,
  members: [...(r.event_entry_members ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(toMemberDto),
});

@Injectable()
export class EntriesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * 3K's functions raise with sentences written for a person — "That category
   * is full", "Entries have closed", "The deadline for withdrawing has
   * passed". Postgres reports every one of them as P0001, so the message is
   * passed through and the status is 400: the request was refused on its
   * merits, which is what a bad request is.
   *
   * The distinction between "full" and "not yours" is a status code nobody
   * reads and a sentence everybody does. If it ever needs to be a status, the
   * fix is `raise ... using errcode` in db/, so the database says which kind
   * of refusal it was rather than this guessing from the words.
   */
  private fail(error: { code?: string; message: string }): never {
    if (error.code === "P0001" || error.code === "23505" || error.code === "23514") {
      // 23505 is the duplicate-entry index: the same child, twice, in one
      // category — a double tap, which deserves a sentence and not a stack.
      throw new BadRequestException(
        error.code === "23505"
          ? "That name is already entered in this category."
          : error.message,
      );
    }
    throw new InternalServerErrorException(error.message);
  }

  private async one(db: SupabaseClient, id: string, viewerId: string): Promise<EntryDto> {
    const { data, error } = await db.from("event_entries").select(COLUMNS).eq("id", id).maybeSingle();

    if (error) this.fail(error);
    // The policies let a family read their own and an owner read their
    // event's. Anything else is a 404 rather than a 403, so a stranger cannot
    // learn that a receipt number exists.
    if (!data) throw new NotFoundException("No such entry.");
    return toDto(data as unknown as EntryRow, viewerId);
  }

  /**
   * Enter.
   *
   * Everything that decides whether this is allowed — the event being live,
   * the window being open, the age band, the team size, and the last place —
   * happens inside enter_event under a row lock. Re-checking any of it here
   * would be a second copy that cannot hold the lock and so cannot be right.
   */
  async create(caller: Caller, body: CreateEntryDto): Promise<EntryDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db.rpc("enter_event", {
      p_category_id: body.categoryId,
      p_participant_name: body.participantName.trim(),
      p_participant_dob: body.participantDob ?? null,
      p_members: (body.members ?? []).map((m) => ({ name: m.name.trim(), dob: m.dob ?? null })),
    });

    if (error) this.fail(error);
    return this.one(db, data as string, caller.id);
  }

  /** What this family has entered, newest first. */
  async mine(caller: Caller): Promise<EntryDto[]> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("event_entries")
      .select(COLUMNS)
      .eq("seeker_id", caller.id)
      .order("entered_at", { ascending: false });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toDto(r as unknown as EntryRow, caller.id));
  }

  /**
   * The register for one event.
   *
   * No ownership check: the read policy shows an owner their own event's
   * entries and shows everybody else none, so a stranger asking for somebody
   * else's register gets an empty list rather than a refusal — which is also
   * what they should get, since a refusal would confirm the event has entries.
   */
  async forEvent(caller: Caller, eventId: string): Promise<EntryDto[]> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("event_entries")
      .select(COLUMNS)
      .eq("event_id", eventId)
      .order("entered_at", { ascending: false });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toDto(r as unknown as EntryRow, caller.id));
  }

  /** Either side may, and 3K decides who may when. */
  async cancel(caller: Caller, id: string, body: CancelEntryDto): Promise<EntryDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { error } = await db.rpc("cancel_entry", {
      p_entry_id: id,
      p_reason: body.reason?.trim() ?? null,
      p_refund: body.refund ?? true,
    });

    if (error) this.fail(error);
    return this.one(db, id, caller.id);
  }

  /** The organiser's, and only theirs — set_entry_payment enforces that. */
  async setPayment(caller: Caller, id: string, body: SetEntryPaymentDto): Promise<EntryDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { error } = await db.rpc("set_entry_payment", {
      p_entry_id: id,
      p_status: body.status,
      p_mode: body.mode ?? null,
      p_reference: body.reference?.trim() ?? null,
    });

    if (error) this.fail(error);
    return this.one(db, id, caller.id);
  }
}
