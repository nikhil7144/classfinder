"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { GroupThread as Thread } from "@/lib/groups";

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

/** How often to pick up the other side's replies. No realtime channel yet. */
const POLL_MS = 15_000;

export default function GroupThreadPane({ thread, me, onChanged, onBack }: Props) {
  const requestId = thread.request_id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    <section className="cf-card flex min-h-[28rem] flex-col p-0">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <button
          onClick={onBack}
          className="shrink-0 text-sm text-muted transition hover:text-ink lg:hidden"
          aria-label="Back to all conversations"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/provider/${thread.provider_id}`}
            className="block truncate font-semibold text-ink transition hover:text-gold"
          >
            {thread.provider_name}
          </Link>
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
        <div className="border-b border-line bg-surface-2 px-5 py-4">
          <p className="cf-eyebrow">Who you&apos;re talking to</p>
          <p className="mt-2 text-sm text-ink">
            {contact.name || "The group"}
            {contact.society_name && <span className="text-muted"> · {contact.society_name}</span>}
          </p>
          {contact.shared && contact.phone ? (
            <a href={`tel:${contact.phone}`} className="cf-btn-ghost mt-3 inline-flex font-mono">
              {contact.phone}
            </a>
          ) : (
            <p className="mt-2 text-xs text-faint">
              They haven&apos;t shared a number — message them here instead.
            </p>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
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
        <div ref={bottom} />
      </div>

      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}

      <footer className="border-t border-line px-5 py-4">
        {open ? (
          <div className="flex gap-2">
            <input
              className="cf-input"
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="cf-btn-primary shrink-0"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
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
