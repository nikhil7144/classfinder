import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { MessageDto, MessagesQueryDto } from "./dto/message.dto";
import { QueryOriginDto, ThreadDto } from "./dto/thread.dto";

/** A row exactly as my_threads() returns it. */
export type ThreadRow = {
  kind: string;
  thread_id: string;
  group_id: string | null;
  provider_id: string | null;
  title: string | null;
  subtitle: string | null;
  photo_url: string | null;
  opening: string | null;
  status: string | null;
  initiated_by: string;
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  /** bigint — arrives as a string, because 64 bits do not survive JSON. */
  message_count: number | string | null;
  unread: boolean;
  i_am_seeker: boolean;
};

export type MessageRow = {
  id: string;
  request_id?: string;
  enquiry_id?: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/**
 * The two kinds under one contract.
 *
 * group_messages/enquiry_messages, mark_thread_read/mark_enquiry_read and
 * get_request_contact/get_enquiry_contact are pairs that do the same job under
 * different names, and the web branches on `kind` in every component that
 * touches a thread. Deciding it once, here, is precisely the shaping the API
 * tier is for: a client says which kind and stops caring.
 */
const SURFACE = {
  group: {
    messages: "group_messages",
    fk: "request_id",
    markRead: "mark_thread_read",
    contact: "get_request_contact",
    idArg: "p_request_id",
  },
  enquiry: {
    messages: "enquiry_messages",
    fk: "enquiry_id",
    markRead: "mark_enquiry_read",
    contact: "get_enquiry_contact",
    idArg: "p_enquiry_id",
  },
} as const;

export type ThreadKind = keyof typeof SURFACE;

const count = (value: unknown): number => Number(value ?? 0);

/** enquiries joined to the query that produced them, as PostgREST returns it. */
type OriginRow = {
  id: string;
  show_phone: boolean | null;
  query_id: string | null;
  queries: {
    created_at: string;
    service_category_master: { name: string | null } | null;
  } | null;
};

export const toThread = (
  row: ThreadRow,
  origins: Map<string, QueryOriginDto> = new Map(),
  phones: Map<string, boolean> = new Map(),
): ThreadDto => ({
  kind: row.kind,
  threadId: row.thread_id,
  groupId: row.group_id,
  providerId: row.provider_id,
  title: row.title,
  subtitle: row.subtitle,
  photoUrl: row.photo_url,
  opening: row.opening,
  status: row.status,
  initiatedBy: row.initiated_by,
  createdAt: row.created_at,
  lastMessage: row.last_message,
  lastMessageAt: row.last_message_at,
  lastSenderId: row.last_sender_id,
  messageCount: count(row.message_count),
  unread: Boolean(row.unread),
  iAmSeeker: Boolean(row.i_am_seeker),
  // Null rather than false for a group thread: it has no such switch, and
  // false would read as "not shared" on something that cannot be.
  showPhone: row.kind === "enquiry" ? (phones.get(row.thread_id) ?? false) : null,
  origin: origins.get(row.thread_id) ?? null,
});

export const toMessage = (row: MessageRow, kind: ThreadKind): MessageDto => ({
  id: row.id,
  threadId: (kind === "group" ? row.request_id : row.enquiry_id) as string,
  senderId: row.sender_id,
  body: row.body,
  createdAt: row.created_at,
});

@Injectable()
export class ThreadsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Every conversation the caller is party to, both kinds.
   *
   * my_threads() takes no arguments and resolves auth.uid() itself, which is
   * the whole access rule — read as the caller and nothing is left to check.
   * `title`, `subtitle`, `unread` and `iAmSeeker` are computed for whoever is
   * asking, so one thread reads differently to the two people in it. That is
   * why this is a function rather than a table read plus branching in the
   * client.
   */
  async mine(caller: Caller): Promise<ThreadDto[]> {
    const { data, error } = await this.supabase.asUser(caller.accessToken).rpc("my_threads");

    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data as ThreadRow[]) ?? [];
    const { origins, phones } = await this.enquiryExtras(caller, rows);
    return rows.map((row) => toThread(row, origins, phones));
  }

  /**
   * The two things about an enquiry thread that my_threads() does not carry:
   * whether the number is shared, and whether it began as a request for a call.
   *
   * One query for the whole inbox rather than one per thread. ThreadPane does
   * both reads itself, per thread, straight from the table — which a mobile
   * client is not allowed to do, and which is why they land here.
   *
   * Deliberately not part of my_threads(). Changing that function's return
   * columns needs a drop and recreate, and that is a live error window for
   * every inbox open at the time. See phase3q.
   *
   * Failure is swallowed: an inbox that renders without a context line is
   * worth more than an inbox that does not render. The phone then reads as not
   * shared, which is the safe direction to be wrong in — it understates what a
   * coach can see rather than overstating it.
   */
  private async enquiryExtras(
    caller: Caller,
    rows: ThreadRow[],
  ): Promise<{ origins: Map<string, QueryOriginDto>; phones: Map<string, boolean> }> {
    const origins = new Map<string, QueryOriginDto>();
    const phones = new Map<string, boolean>();

    const ids = rows.filter((r) => r.kind === "enquiry").map((r) => r.thread_id);
    if (ids.length === 0) return { origins, phones };

    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("enquiries")
      .select("id, show_phone, query_id, queries(created_at, service_category_master(name))")
      .in("id", ids);

    if (error) return { origins, phones };

    for (const row of (data as unknown as OriginRow[]) ?? []) {
      phones.set(row.id, Boolean(row.show_phone));

      if (!row.query_id || !row.queries) continue;
      origins.set(row.id, {
        queryId: row.query_id,
        serviceName: row.queries.service_category_master?.name ?? null,
        askedAt: row.queries.created_at,
      });
    }

    return { origins, phones };
  }

  /**
   * The conversation, oldest first once reversed by the caller.
   *
   * Read as the caller: the policies on both message tables already restrict
   * these to the parties, so a thread id belonging to somebody else returns an
   * empty list rather than their conversation. Nothing here re-checks that.
   */
  async messages(
    caller: Caller,
    kind: ThreadKind,
    threadId: string,
    query: MessagesQueryDto,
  ): Promise<MessageDto[]> {
    const surface = SURFACE[kind];
    let q = this.supabase
      .asUser(caller.accessToken)
      .from(surface.messages)
      .select("*")
      .eq(surface.fk, threadId)
      .order("created_at", { ascending: false })
      .limit(query.limit ?? 100);

    if (query.before) q = q.lt("created_at", query.before);

    const { data, error } = await q;
    if (error) throw new InternalServerErrorException(error.message);
    return ((data as MessageRow[]) ?? []).map((row) => toMessage(row, kind));
  }

  /**
   * Say something.
   *
   * sender_id is the caller's, never the request's. The row policy requires it
   * to match auth.uid() anyway, so a forged one is refused rather than
   * written — but there is no reason to accept the field and find out.
   */
  async send(
    caller: Caller,
    kind: ThreadKind,
    threadId: string,
    body: string,
  ): Promise<MessageDto> {
    const surface = SURFACE[kind];
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from(surface.messages)
      .insert({ [surface.fk]: threadId, sender_id: caller.id, body })
      .select("*")
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return toMessage(data as MessageRow, kind);
  }

  /**
   * Mark it read, for whichever side is asking.
   *
   * A definer write: it sets creator_read_at or provider_read_at depending on
   * who the caller is, and RLS cannot restrict which column an UPDATE touches.
   * Reimplementing it here would hand the client both columns, which is the
   * thing it exists to withhold.
   */
  async markRead(caller: Caller, kind: ThreadKind, threadId: string): Promise<void> {
    const surface = SURFACE[kind];
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc(surface.markRead, { [surface.idArg]: threadId });

    if (error) throw new InternalServerErrorException(error.message);
  }
}
