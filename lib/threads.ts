import { inboxTime } from "@/lib/groups";
import { supabase } from "@/lib/supabase";

export { inboxTime };

/**
 * Live updates for one thread's rows.
 *
 * Deliberately a nudge rather than a payload: the callback refetches instead
 * of splicing `payload.new` into state. MentBridge appended the row and then
 * needed de-duplication logic against its own optimistic sends; refetching is
 * one more round trip per message and cannot drift out of order.
 *
 * Realtime is an accelerator here, never the source of truth. Callers keep
 * their explicit reload after their own writes and their slow poll, so a
 * dropped socket degrades to exactly the behaviour that shipped before it.
 */
export function subscribeToThreadRows(
  table: string,
  fk: string,
  id: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`${table}:${id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `${fk}=eq.${id}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * A conversation, whichever way it started.
 *
 * A parent talking to two coaches about a group and a third directly has one
 * inbox in their head, not two, so `my_threads()` returns both kinds in one
 * shape and everything above this line stops caring which is which.
 */
export type ThreadKind = "group" | "enquiry";

export type Thread = {
  kind: ThreadKind;
  thread_id: string;
  /** Null for a direct enquiry. */
  group_id: string | null;
  provider_id: string;
  /** The other side, as this viewer is allowed to know them. */
  title: string;
  subtitle: string;
  photo_url: string | null;
  /** The pitch, or the parent's first question. Whatever opened the thread. */
  opening: string;
  /**
   * group: pending | accepted | declined.
   * enquiry: pending | open | declined — pending only ever means a coach has
   * approached a parent and the parent has not yet agreed to hear it.
   */
  status: string;
  /** Who spoke first. A group pitch is always the coach's, and says so. */
  initiated_by: "seeker" | "provider";
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  message_count: number;
  unread: boolean;
  i_am_seeker: boolean;
};

/**
 * The two tables and four functions that differ between the kinds. Everything
 * else — the pane, the list, the trial card — is written once against this.
 */
export const THREAD_API: Record<
  ThreadKind,
  {
    messages: string;
    fk: string;
    markRead: string;
    contact: string;
    idArg: string;
  }
> = {
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
};

/** Can these two write to each other right now? */
export function threadIsOpen(t: Thread): boolean {
  return t.kind === "group" ? t.status === "accepted" : t.status === "open";
}

/** Closed for good, rather than merely waiting on someone. */
export function threadIsClosed(t: Thread): boolean {
  return t.status === "declined";
}

/** What the row says under the name. Falls back to whatever opened the thread. */
export function threadPreview(t: Thread, myId: string | null): string {
  const body = t.last_message ?? t.opening;
  // With no replies yet the preview is the opening, so whose it was depends on
  // who started the thread — which, since phase2r, is no longer implied by the
  // kind: a coach can open an enquiry too.
  const openingIsMine = t.initiated_by === "seeker" ? t.i_am_seeker : !t.i_am_seeker;
  const mine = t.last_message ? t.last_sender_id === myId : openingIsMine;
  return mine ? `You: ${body}` : body;
}

/** The one-line state, in the words of whoever is reading it. */
export function threadStatusLabel(t: Thread): string {
  if (t.kind === "group") {
    if (t.status === "pending") {
      return t.i_am_seeker ? "Wants to teach your group" : "Waiting for the group to reply";
    }
    if (t.status === "declined") return "Not taken up";
  } else if (t.initiated_by === "provider") {
    // A coach's approach. The parent owes an answer before anything else can
    // happen, so that is what the row says on both sides.
    if (t.status === "pending") {
      return t.i_am_seeker ? "Would like to teach your child" : "Waiting for them to answer";
    }
    if (t.status === "declined") {
      return t.i_am_seeker ? "You turned this down" : "They weren't looking for this";
    }
    if (t.message_count === 0) {
      return t.i_am_seeker ? "You accepted — say hello" : "They accepted — write back";
    }
  } else {
    if (t.status === "declined") {
      return t.i_am_seeker ? "This coach couldn't take it on" : "You turned this down";
    }
    if (t.message_count === 0) {
      return t.i_am_seeker ? "Sent — no reply yet" : "Waiting on your reply";
    }
  }
  return `${t.message_count} message${t.message_count === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------
// Trial classes
// ---------------------------------------------------------------------

export type TrialStatus = "proposed" | "confirmed" | "declined" | "cancelled";
export type TrialOutcome = "happened" | "no_show" | "cancelled";

export type Trial = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  place: string | null;
  place_label: string | null;
  place_note: string | null;
  student_count: number;
  status: TrialStatus;
  proposed_by: string;
  i_proposed: boolean;
  seeker_outcome: TrialOutcome | null;
  provider_outcome: TrialOutcome | null;
  /** Whichever outcome column belongs to the person reading. */
  my_outcome: TrialOutcome | null;
  created_at: string;
};

export const TRIAL_DURATIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1½ hours" },
  { minutes: 120, label: "2 hours" },
];

/** "Sat 6 Sep, 10:00" — a date a parent can check against their week. */
export function trialWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Has the slot passed? Only then is "did it happen?" a sensible question. */
export function trialIsPast(t: Trial): boolean {
  return new Date(t.scheduled_at).getTime() + t.duration_minutes * 60_000 < Date.now();
}

/** The one thing this person can do about this trial, if anything. */
export function trialPrompt(t: Trial): string {
  if (t.status === "declined") return "This time didn't work — suggest another.";
  if (t.status === "cancelled") return "Called off.";
  if (t.status === "proposed") {
    return t.i_proposed ? "Waiting for them to confirm." : "Can you make this?";
  }
  if (!trialIsPast(t)) return "Confirmed.";
  if (t.my_outcome === "happened") return "You marked this as attended.";
  if (t.my_outcome === "no_show") return "You marked this as a no-show.";
  return "Did this go ahead?";
}

/**
 * A datetime-local value for the proposal form: the next whole hour, rather
 * than an empty field or this exact minute.
 */
export function defaultTrialSlot(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
