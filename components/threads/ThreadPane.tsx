"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  THREAD_API,
  Thread,
  subscribeToThreadRows,
  threadIsOpen,
  threadStatusLabel,
} from "@/lib/threads";
import TrialCard from "./TrialCard";
import MessageComposer from "./MessageComposer";

type Message = { id: string; sender_id: string; body: string; created_at: string };
type Contact = {
  phone: string | null;
  name: string | null;
  society_name?: string | null;
  shared: boolean;
};

type Props = {
  thread: Thread;
  me: string | null;
  /** Ask the inbox to refetch — status, previews and badges have moved. */
  onChanged: () => void;
  /** Shown on narrow screens, where the list and the thread can't share a row. */
  onBack: () => void;
};

/**
 * A safety net behind the realtime channel, not the way messages arrive.
 * Sockets drop, tabs sleep, and a channel that silently stops delivering
 * looks exactly like nobody replying — so a slow poll still catches up.
 */
const POLL_MS = 60_000;

/**
 * One conversation, whichever way it started.
 *
 * A group pitch and a direct enquiry differ in two tables and four functions
 * — collected in THREAD_API — and in nothing a reader would notice. Writing
 * this twice would have meant maintaining the trial card, the contact panel
 * and the polling in two places that slowly drifted apart.
 */
export default function ThreadPane({ thread, me, onChanged, onBack }: Props) {
  const api = THREAD_API[thread.kind];
  const id = thread.thread_id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from(api.messages)
      .select("id, sender_id, body, created_at")
      .eq(api.fk, id)
      .order("created_at");
    setMessages((data as Message[]) || []);
  }, [api.messages, api.fk, id]);

  // Opening the thread is what marks it read; the inbox is refetched so its
  // badge clears in the same breath rather than on the next navigation.
  useEffect(() => {
    let alive = true;
    (async () => {
      setMessages([]);
      setContact(null);
      setSharing(null);
      setError("");
      await loadMessages();
      if (!alive) return;

      // The coach's view of who they're talking to. A parent already knows.
      if (!thread.i_am_seeker) {
        const { data } = await supabase.rpc(api.contact, { [api.idArg]: id });
        if (alive) setContact((data as Contact | null) ?? null);
      } else if (thread.kind === "enquiry") {
        const { data } = await supabase
          .from("enquiries")
          .select("show_phone")
          .eq("id", id)
          .maybeSingle();
        if (alive) setSharing((data as { show_phone: boolean } | null)?.show_phone ?? null);
      }

      if (thread.unread) {
        await supabase.rpc(api.markRead, { [api.idArg]: id });
        if (alive) onChanged();
      }

      // Unconditional, unlike the thread's own read state: the email debounce
      // in phase2n suppresses a second mail only while the first is unread, so
      // leaving these unread would silence the next reply for half an hour.
      await supabase.rpc("mark_notifications_read", { p_thread_id: id });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const t = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(t);
  }, [loadMessages]);

  // Realtime, subscribed with this user's own JWT so the same RLS that guards
  // the table guards the socket.
  useEffect(
    () => subscribeToThreadRows(api.messages, api.fk, id, loadMessages),
    [api.messages, api.fk, id, loadMessages]
  );

  // Scroll the list itself rather than calling scrollIntoView on a sentinel.
  // With the pane now a fixed height, scrollIntoView would still be free to
  // scroll the page as well as the list; setting scrollTop cannot.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError("");
    const { error: sendError } = await supabase
      .from(api.messages)
      .insert({ [api.fk]: id, sender_id: me, body });
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setDraft("");
    await loadMessages();
    onChanged();
  };

  // Three decisions, one button in three different hands: a parent answers a
  // coach's pitch to their group, a parent answers a coach's approach, and a
  // coach bows out of an enquiry they can't take on. Which one it is follows
  // from the kind and who opened the thread, never from a prop.
  const answer = async (accept: boolean) => {
    setAnswering(true);
    setError("");

    const { error: answerError } =
      thread.kind === "group"
        ? await supabase
            .from("group_requests")
            .update({
              status: accept ? "accepted" : "declined",
              responded_at: new Date().toISOString(),
            })
            .eq("id", id)
        : thread.status === "pending"
          ? await supabase.rpc("respond_to_approach", {
              p_enquiry_id: id,
              p_accept: accept,
              // The parent turns their number on afterwards, from the same
              // control every other thread uses — one decision at a time.
              p_share_phone: false,
            })
          : await supabase.rpc("decline_enquiry", { p_enquiry_id: id });

    setAnswering(false);
    if (answerError) {
      setError(answerError.message);
      return;
    }
    onChanged();
  };

  /** A coach can take back an approach nobody has answered yet. */
  const withdraw = async () => {
    setAnswering(true);
    setError("");

    const { error: withdrawError } = await supabase.rpc("withdraw_approach", {
      p_enquiry_id: id,
    });

    setAnswering(false);
    if (withdrawError) {
      setError(withdrawError.message);
      return;
    }
    onChanged();
  };

  const toggleSharing = async () => {
    const next = !sharing;
    const { error: shareError } = await supabase.rpc("set_enquiry_phone_sharing", {
      p_enquiry_id: id,
      p_share: next,
    });
    if (shareError) {
      setError(shareError.message);
      return;
    }
    setSharing(next);
  };

  const open = threadIsOpen(thread);
  // Anything still awaiting the parent's answer: a pitch to their group, or a
  // coach's approach to them directly.
  const awaitingAnswer = thread.status === "pending";

  return (
    // A fixed height with overflow-hidden is what makes the message list the
    // thing that scrolls. Without it the list grows to fit its content — a
    // flex child defaults to min-height:auto — the card grows with it, and the
    // page scrolls instead, carrying the header and composer off screen.
    <section className="cf-card flex h-[70vh] min-h-[30rem] flex-col overflow-hidden p-0">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
        <button
          onClick={onBack}
          className="shrink-0 text-sm text-muted transition hover:text-ink lg:hidden"
          aria-label="Back to all conversations"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          {thread.i_am_seeker ? (
            <Link
              href={`/provider/${thread.provider_id}`}
              className="block truncate font-semibold text-ink transition hover:text-gold"
            >
              {thread.title}
            </Link>
          ) : (
            <p className="truncate font-semibold text-ink">{thread.title}</p>
          )}
          <p className="truncate text-xs text-muted">{threadStatusLabel(thread)}</p>
        </div>
        {thread.group_id && (
          <Link
            href={`/groups/${thread.group_id}`}
            className="shrink-0 text-xs text-muted transition hover:text-ink"
          >
            Group
          </Link>
        )}
        <span
          className={`cf-badge shrink-0 ${
            open ? "cf-badge-ok" : thread.status === "declined" ? "cf-badge-neutral" : "cf-badge-warn"
          }`}
        >
          {thread.status === "pending"
            ? thread.i_am_seeker
              ? "New"
              : "Sent"
            : thread.status === "open"
              ? "Open"
              : thread.status}
        </span>
      </header>

      {/* One row, like every other strip. This was a four-line block, and on a
          phone it and the trial panel together left no conversation visible. */}
      {contact && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-5 py-2.5">
          <span className="cf-eyebrow shrink-0">Talking to</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink">
            {contact.name || "A parent"}
            {contact.society_name && <span className="text-muted"> · {contact.society_name}</span>}
          </span>
          {contact.shared && contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="cf-btn-ghost shrink-0 px-3 py-1.5 font-mono text-xs"
            >
              {contact.phone}
            </a>
          )}
        </div>
      )}

      {sharing !== null && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-5 py-2.5">
          <span className="cf-eyebrow shrink-0">Your number</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {sharing ? "Shared with this coach" : "Not shared"}
          </span>
          <button onClick={toggleSharing} className="cf-btn-ghost shrink-0 px-3 py-1.5 text-xs">
            {sharing ? "Stop sharing" : "Let them call me"}
          </button>
        </div>
      )}

      <TrialCard
        kind={thread.kind}
        threadId={id}
        open={open}
        isSeeker={thread.i_am_seeker}
      />

      <div
        ref={scroller}
        className="min-h-40 flex-1 space-y-3 overflow-y-auto px-5 py-5"
      >
        {/* Whatever opened the thread stays visible: it is what the other side
            was judged on, and it is the question a coach is answering. */}
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <p className="cf-eyebrow">
            {thread.kind === "group" ? "First message" : "The enquiry"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{thread.opening}</p>
        </div>

        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  mine ? "bg-accent-ink text-[#1a0d06]" : "border border-line bg-surface-2 text-ink"
                }`}
              >
                {m.body}
                <div className={`mt-1 font-mono text-[0.65rem] ${mine ? "opacity-60" : "text-faint"}`}>
                  {new Date(m.created_at).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}

      <footer className="shrink-0 border-t border-line px-5 py-4">
        {open ? (
          <div className="space-y-3">
            <MessageComposer
              value={draft}
              onChange={setDraft}
              onSend={send}
              sending={sending}
            />
            {/* A coach can end an enquiry they can't take on. A parent just
                stops replying, so they are not offered this. */}
            {thread.kind === "enquiry" && !thread.i_am_seeker && (
              <button
                onClick={() => answer(false)}
                disabled={answering}
                className="text-xs text-faint transition hover:text-muted"
              >
                I can&apos;t take this on
              </button>
            )}
          </div>
        ) : awaitingAnswer && thread.i_am_seeker ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => answer(true)}
                disabled={answering}
                className="cf-btn-primary px-5 py-2 text-sm"
              >
                Accept &amp; message
              </button>
              <button
                onClick={() => answer(false)}
                disabled={answering}
                className="cf-btn-ghost px-5 py-2 text-sm"
              >
                Not interested
              </button>
            </div>
            {thread.kind === "enquiry" && (
              <p className="text-xs text-faint">
                They have your area and what you&apos;re looking for — not your name, photo or
                number. Accepting shares your name; your number stays yours to offer.
              </p>
            )}
          </div>
        ) : awaitingAnswer ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {thread.kind === "group"
                ? "Waiting for the group to reply. You can message once they accept."
                : "Waiting for them to answer. You can message once they accept."}
            </p>
            {thread.kind === "enquiry" && (
              <button
                onClick={withdraw}
                disabled={answering}
                className="text-xs text-faint transition hover:text-muted"
              >
                Withdraw this
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            This wasn&apos;t taken up, so the conversation is closed.
          </p>
        )}
      </footer>
    </section>
  );
}
