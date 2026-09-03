"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUERY_STATUS_LABEL,
  type Query,
  type QueryStatus,
  answerQuery,
  fetchQueries,
  setQueryStatus,
} from "@/lib/api/queries";

type Props = {
  /** A coach works these; a parent only watches them. */
  side: "provider" | "seeker";
};

const OPEN: QueryStatus[] = ["new", "contacted", "callback_scheduled"];

const badgeFor = (status: string) =>
  status === "new"
    ? "cf-badge-warn"
    : status === "completed"
      ? "cf-badge-ok"
      : "cf-badge-neutral";

/** "in 2 days" / "yesterday" — a booked call is about when, not what date. */
function when(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const time = new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (days === 0) return `today, ${time.split(", ").pop()}`;
  if (days === 1) return `tomorrow, ${time.split(", ").pop()}`;
  if (days === -1) return `yesterday, ${time.split(", ").pop()}`;
  return time;
}

/**
 * The worklist a chat thread could never be.
 *
 * A coach with twenty enquiries had twenty conversations and no way to record
 * which they had rung, which wanted calling back on Tuesday, and which went
 * nowhere. This is that record. Writing is still available — it just stops
 * being the only thing a coach can do with a request.
 */
export default function QueryList({ side }: Props) {
  const router = useRouter();
  const [queries, setQueries] = useState<Query[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const { queries: rows, error: loadError } = await fetchQueries();
    setError(loadError ?? "");
    setQueries(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchQueries().then(({ queries: rows, error: loadError }) => {
      if (!alive) return;
      setError(loadError ?? "");
      setQueries(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const move = async (id: string, status: QueryStatus, callbackAt?: string) => {
    setBusyId(id);
    const { error: writeError } = await setQueryStatus(id, status, callbackAt);
    setBusyId(null);
    if (writeError) return setError(writeError);
    await load();
  };

  const scheduleCall = async (id: string) => {
    // A date input rather than a picker component: the coach is agreeing a
    // time on the phone, and anything more elaborate is in the way.
    const answer = window.prompt("When is the call? e.g. 2026-09-10 17:30");
    if (!answer) return;
    const at = new Date(answer.replace(" ", "T"));
    if (Number.isNaN(at.getTime())) return setError("Couldn't read that date.");
    await move(id, "callback_scheduled", at.toISOString());
  };

  const send = async (id: string) => {
    if (!reply.trim()) return;
    setBusyId(id);
    const { enquiryId, error: sendError } = await answerQuery(id, reply.trim());
    setBusyId(null);
    if (sendError) return setError(sendError);
    setReply("");
    setReplyTo(null);
    // Straight into the conversation it opened — or the one it joined.
    router.push(`/dashboard/messages?thread=${enquiryId}`);
  };

  if (!queries) return <div className="cf-card h-64 animate-pulse p-8" />;

  const open = queries.filter((q) => OPEN.includes(q.status as QueryStatus));
  const done = queries.filter((q) => !OPEN.includes(q.status as QueryStatus));
  const shown = showDone ? done : open;

  return (
    <div className="space-y-5">
      {error && (
        <div className="cf-card border-danger/50 bg-danger-soft/30 p-5">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {done.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowDone(false)}
            className={`cf-badge ${!showDone ? "cf-badge-ok" : "cf-badge-neutral"}`}
          >
            Open ({open.length})
          </button>
          <button
            onClick={() => setShowDone(true)}
            className={`cf-badge ${showDone ? "cf-badge-ok" : "cf-badge-neutral"}`}
          >
            Finished ({done.length})
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <section className="cf-card p-8 text-center">
          <p className="text-sm text-muted">
            {side === "provider"
              ? showDone
                ? "Nothing finished yet."
                : "No one has asked you to call them yet."
              : "You haven't asked anyone to call you yet."}
          </p>
        </section>
      ) : (
        <ul className="space-y-4">
          {shown.map((q) => (
            <li key={q.id} className="cf-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-ink">
                    {side === "provider" ? q.contactName : q.providerName || "A coach"}
                  </h3>
                  <p className="mt-1 text-xs text-faint">
                    {q.serviceName ? `${q.serviceName} · ` : ""}
                    {new Date(q.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`cf-badge ${badgeFor(q.status)}`}>
                  {QUERY_STATUS_LABEL[q.status] ?? q.status}
                </span>
              </div>

              {q.details && <p className="mt-4 text-sm leading-relaxed text-muted">{q.details}</p>}

              {/* The number is the point of a query, so it is the one thing
                  that does not hide behind a click. */}
              {side === "provider" && (
                <a
                  href={`tel:${q.contactPhone}`}
                  className="mt-4 inline-block font-mono text-base text-gold hover:text-accent-ink"
                >
                  {q.contactPhone}
                </a>
              )}

              {q.callbackAt && (
                <p className="mt-3 text-sm text-ink">
                  <span className="cf-eyebrow">Call booked</span> — {when(q.callbackAt)}
                </p>
              )}

              {side === "provider" && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {q.status === "new" && (
                    <button onClick={() => move(q.id, "contacted")} disabled={busyId === q.id} className="cf-btn-ghost">
                      Mark contacted
                    </button>
                  )}
                  {q.status !== "completed" && q.status !== "closed" && (
                    <>
                      <button onClick={() => scheduleCall(q.id)} disabled={busyId === q.id} className="cf-btn-ghost">
                        {q.callbackAt ? "Change call time" : "Schedule a call"}
                      </button>
                      <button
                        onClick={() => setReplyTo(replyTo === q.id ? null : q.id)}
                        className="cf-btn-ghost"
                      >
                        Message
                      </button>
                      <button onClick={() => move(q.id, "completed")} disabled={busyId === q.id} className="cf-btn-primary">
                        Completed
                      </button>
                      <button onClick={() => move(q.id, "closed")} disabled={busyId === q.id} className="cf-btn-ghost">
                        Close
                      </button>
                    </>
                  )}
                </div>
              )}

              {side === "seeker" && q.enquiryId && (
                <button
                  onClick={() => router.push(`/account/messages?thread=${q.enquiryId}`)}
                  className="cf-btn-ghost mt-5"
                >
                  Open the conversation
                </button>
              )}

              {replyTo === q.id && (
                <div className="mt-4">
                  <textarea
                    className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-gold"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Hi ${q.contactName.split(" ")[0]} — happy to help.`}
                  />
                  <p className="mt-2 text-xs text-faint">
                    They&apos;ll see this came from their request, so it won&apos;t arrive out of
                    the blue.
                  </p>
                  <button
                    onClick={() => send(q.id)}
                    disabled={busyId === q.id || !reply.trim()}
                    className="cf-btn-primary mt-3"
                  >
                    {busyId === q.id ? "Sending…" : "Send and open chat"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
