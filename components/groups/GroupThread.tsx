"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { GroupThread as Thread } from "@/lib/groups";
import { subscribeToThreadRows } from "@/lib/threads";
import TrialCard from "@/components/threads/TrialCard";
import MessageComposer from "@/components/threads/MessageComposer";

type Message = { id: string; sender_id: string; body: string; created_at: string };
type Contact = { phone: string | null; name: string | null; society_name: string | null; shared: boolean };

type Props = {
  thread: Thread;
  me: string | null;
  /** Ask the parent to refetch the inbox — status and previews have moved. */
  onChanged: () => void;
  /** Shown on narrow screens, where the list and the thread can't share a row. */
  onBack: () => void;
};

/** A safety net behind the realtime channel below, not the way replies arrive. */
const POLL_MS = 60_000;

export default function GroupThreadPane({ thread, me, onChanged, onBack }: Props) {
  const requestId = thread.request_id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("group_messages")
      .select("id, sender_id, body, created_at")
      .eq("request_id", requestId)
      .order("created_at");
    setMessages((data as Message[]) || []);
  }, [requestId]);

  // Opening the thread is what marks it read; the inbox is refetched so its
  // badge clears in the same breath rather than on the next navigation.
  useEffect(() => {
    let alive = true;
    (async () => {
      setMessages([]);
      setContact(null);
      setError("");
      await loadMessages();
      if (!alive) return;
      const { data } = await supabase.rpc("get_request_contact", { p_request_id: requestId });
      if (alive) setContact((data as Contact | null) ?? null);
      if (thread.unread) {
        await supabase.rpc("mark_thread_read", { p_request_id: requestId });
        if (alive) onChanged();
      }
      // Clears the email debounce for this thread — see phase2n.
      await supabase.rpc("mark_notifications_read", { p_thread_id: requestId });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    const t = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(
    () => subscribeToThreadRows("group_messages", "request_id", requestId, loadMessages),
    [requestId, loadMessages]
  );

  // Scroll the list, not the page — see the note on the section below.
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
      .from("group_messages")
      .insert({ request_id: requestId, sender_id: me, body });
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setDraft("");
    await loadMessages();
    onChanged();
  };

  const answer = async (status: "accepted" | "declined") => {
    setAnswering(true);
    setError("");
    const { error: answerError } = await supabase
      .from("group_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", requestId);
    setAnswering(false);
    if (answerError) {
      setError(answerError.message);
      return;
    }
    onChanged();
  };

  const open = thread.status === "accepted";

  return (
    // The pane owns a height and hides its own overflow, so the message list
    // is what scrolls. Without that, flex-1 + overflow-y-auto grows to fit the
    // conversation and the whole page scrolls instead.
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
          {/* Only the parent is looking at a coach worth linking to. A coach
              is looking at a group, and linking them to their own listing was
              the visible half of the phase2p bug. */}
          {thread.is_creator ? (
            <Link
              href={`/provider/${thread.provider_id}`}
              className="block truncate font-semibold text-ink transition hover:text-gold"
            >
              {thread.title}
            </Link>
          ) : (
            <p className="truncate font-semibold text-ink">{thread.title}</p>
          )}
          <p className="truncate text-xs text-muted">
            {thread.status === "pending"
              ? thread.is_creator
                ? "Wants to teach your group"
                : "Waiting for the group to reply"
              : thread.status === "declined"
                ? "Not taken up"
                : `${thread.message_count} message${thread.message_count === 1 ? "" : "s"}`}
          </p>
        </div>
        <span
          className={`cf-badge shrink-0 ${
            thread.status === "accepted"
              ? "cf-badge-ok"
              : thread.status === "declined"
                ? "cf-badge-neutral"
                : "cf-badge-warn"
          }`}
        >
          {thread.status === "pending" ? "New" : thread.status}
        </span>
      </header>

      {contact && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-5 py-2.5">
          <span className="cf-eyebrow shrink-0">Talking to</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink">
            {contact.name || "The group"}
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

      {/* A group conversation ends in the same event a direct one does: a
          first session that either happens or doesn't. Same card, same table. */}
      <TrialCard
        kind="group"
        threadId={requestId}
        open={open}
        isSeeker={thread.is_creator}
      />

      <div
        ref={scroller}
        className="min-h-40 flex-1 space-y-3 overflow-y-auto px-5 py-5"
      >
        {/* The pitch opens the thread — it is what the parent judged. */}
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <p className="cf-eyebrow">First message</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{thread.pitch}</p>
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
          <MessageComposer
            value={draft}
            onChange={setDraft}
            onSend={send}
            sending={sending}
          />
        ) : thread.status === "pending" && thread.is_creator ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => answer("accepted")}
              disabled={answering}
              className="cf-btn-primary px-5 py-2 text-sm"
            >
              Accept &amp; message
            </button>
            <button
              onClick={() => answer("declined")}
              disabled={answering}
              className="cf-btn-ghost px-5 py-2 text-sm"
            >
              Not interested
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {thread.status === "declined"
              ? "This wasn't taken up, so the conversation is closed."
              : "Waiting for the group to reply. You can message once they accept."}
          </p>
        )}
      </footer>
    </section>
  );
}
