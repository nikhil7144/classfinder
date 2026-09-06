"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchMyEvent } from "@/lib/api/my-events";
import {
  cancelEntry,
  fetchEventEntries,
  setEntryPayment,
  type Entry,
  type PaymentMode,
  type PaymentStatus,
} from "@/lib/api/my-entries";
import type { Event } from "@/lib/api/events";
import {
  formatDateTime,
  formatFee,
  formatWhen,
  PAYMENT_BADGE,
  PAYMENT_MODE_LABEL,
} from "@/lib/events";

type Props = { params: Promise<{ id: string }> };

type Filter = "all" | "unpaid" | "refund_due" | "cancelled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "unpaid", label: "Not paid" },
  { key: "refund_due", label: "Refund due" },
  { key: "cancelled", label: "Cancelled" },
];

const MODES: PaymentMode[] = ["cash", "upi", "bank_transfer", "card", "other"];

/**
 * The register: who is coming, what they owe, and what to do about it.
 *
 * This is the screen an organiser opens on the morning of an event, so it is
 * a list they can work down rather than a dashboard — a name, an age, a
 * category, and the two actions that change anything.
 *
 * "Refund due" is a filter because it is a to-do list. Nothing here moves
 * money; it records what the organiser did with it.
 */
export default function EventEntriesPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const [own, list] = await Promise.all([fetchMyEvent(id), fetchEventEntries(id)]);
      if (!alive) return;

      if (own.error || !own.event) {
        setError(own.error ?? "No such event.");
      } else {
        setEvent(own.event);
      }
      if (list.error) setError(list.error);
      setEntries(list.entries);
      setLoading(false);
    };

    load();
    return () => {
      alive = false;
    };
  }, [id, router]);

  const shown = useMemo(() => {
    if (filter === "all") return entries.filter((e) => e.status === "confirmed");
    if (filter === "cancelled") return entries.filter((e) => e.status === "cancelled");
    return entries.filter((e) => e.status === "confirmed" && e.paymentStatus === filter);
  }, [entries, filter]);

  const owed = entries
    .filter((e) => e.status === "confirmed" && e.paymentStatus === "unpaid")
    .reduce((sum, e) => sum + (e.amountDue ?? 0), 0);

  const replace = (updated: Entry) =>
    setEntries((current) => current.map((e) => (e.id === updated.id ? updated : e)));

  const mark = async (entry: Entry, status: PaymentStatus, mode?: PaymentMode) => {
    if (busy) return;
    setError("");
    setBusy(entry.id);
    const result = await setEntryPayment(entry.id, { status, ...(mode ? { mode } : {}) });
    setBusy("");

    if (result.error || !result.entry) {
      setError(result.error ?? "Couldn't record that.");
      return;
    }
    replace(result.entry);
  };

  const cancel = async (entry: Entry, refund: boolean) => {
    if (busy) return;
    setError("");
    setBusy(entry.id);
    const result = await cancelEntry(entry.id, {
      reason: "Cancelled by the organiser.",
      refund,
    });
    setBusy("");

    if (result.error || !result.entry) {
      setError(result.error ?? "Couldn't cancel that.");
      return;
    }
    replace(result.entry);
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-10">
      <Link href={`/events/${id}/edit`} className="cf-eyebrow text-faint hover:text-muted">
        ← Edit this event
      </Link>

      <header className="cf-card p-7">
        <p className="cf-eyebrow">Entries</p>
        <h1 className="cf-display mt-3 text-2xl text-ink">{event?.title ?? "This event"}</h1>
        {event && (
          <p className="mt-2 text-sm text-muted">{formatWhen(event.startsAt, event.endsAt)}</p>
        )}

        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="cf-eyebrow">Entered</dt>
            <dd className="mt-1 font-display text-xl text-ink">
              {entries.filter((e) => e.status === "confirmed").length}
            </dd>
          </div>
          <div>
            <dt className="cf-eyebrow">Still owed</dt>
            <dd className="mt-1 font-display text-xl text-ink">{formatFee(owed)}</dd>
          </div>
          <div>
            <dt className="cf-eyebrow">Refunds to make</dt>
            <dd className="mt-1 font-display text-xl text-ink">
              {entries.filter((e) => e.paymentStatus === "refund_due").length}
            </dd>
          </div>
        </dl>

        <nav className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="cf-pill"
              data-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p className="cf-card p-5 text-sm text-danger">{error}</p>}

      {shown.length === 0 ? (
        <p className="cf-card p-7 text-sm text-muted">
          {entries.length === 0
            ? "Nobody has entered yet. Entries arrive here the moment they do."
            : "Nothing under this filter."}
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map((entry) => {
            const payment = PAYMENT_BADGE[entry.paymentStatus] ?? PAYMENT_BADGE.unpaid;
            const cancelled = entry.status === "cancelled";

            return (
              <li key={entry.id} className="cf-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-ink">
                      {entry.participantName}
                    </p>
                    <p className="mt-1 text-sm text-muted">{entry.categoryName}</p>
                    {entry.members.length > 0 && (
                      <p className="mt-1 text-xs text-faint">
                        With {entry.members.map((m) => m.name).join(", ")}
                      </p>
                    )}
                    <p className="mt-2 font-mono text-xs text-faint">
                      {entry.receiptNo} · {formatFee(entry.amountDue)}
                      {entry.paymentMode && ` · ${PAYMENT_MODE_LABEL[entry.paymentMode]}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {cancelled && <span className="cf-badge cf-badge-danger">Cancelled</span>}
                    <span className={`cf-badge ${payment.className}`}>{payment.label}</span>
                    {entry.participantDob && (
                      <span className="text-xs text-faint">
                        Born {new Date(entry.participantDob).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>

                {cancelled ? (
                  <div className="mt-4 border-t border-line-soft pt-4">
                    <p className="text-xs leading-relaxed text-muted">
                      {entry.cancelledByMe
                        ? "You cancelled this."
                        : entry.cancelledReason ?? "Withdrawn by the family."}
                      {entry.cancelledAt && ` ${formatDateTime(entry.cancelledAt)}`}
                    </p>
                    {entry.paymentStatus === "refund_due" && (
                      <button
                        type="button"
                        className="cf-btn-ghost mt-3 text-xs"
                        onClick={() => mark(entry, "refunded")}
                        disabled={busy !== ""}
                      >
                        Mark refunded
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
                    {entry.paymentStatus === "unpaid" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cf-eyebrow">Paid by</span>
                        {MODES.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className="cf-pill text-xs"
                            onClick={() => mark(entry, "paid", mode)}
                            disabled={busy !== ""}
                          >
                            {PAYMENT_MODE_LABEL[mode]}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="cf-pill text-xs"
                          onClick={() => mark(entry, "waived")}
                          disabled={busy !== ""}
                        >
                          Waive
                        </button>
                      </div>
                    ) : (
                      entry.paidAt && (
                        <p className="text-xs text-faint">
                          Recorded {formatDateTime(entry.paidAt)}
                        </p>
                      )
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="cf-btn-ghost text-xs text-danger"
                        onClick={() => cancel(entry, true)}
                        disabled={busy !== ""}
                      >
                        Cancel {entry.paymentStatus === "paid" ? "and refund" : "this entry"}
                      </button>
                      {/* The two axes, separated. A late withdrawal an
                          organiser accepts but does not refund is exactly
                          this button, and it is why cancelling and refunding
                          were never one action. */}
                      {entry.paymentStatus === "paid" && (
                        <button
                          type="button"
                          className="cf-btn-ghost text-xs"
                          onClick={() => cancel(entry, false)}
                          disabled={busy !== ""}
                        >
                          Cancel without a refund
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
