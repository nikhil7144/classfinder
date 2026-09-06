"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cancelEntry, fetchMyEntries, type Entry } from "@/lib/api/my-entries";
import { formatDateTime, formatFee, PAYMENT_BADGE } from "@/lib/events";

/**
 * What this family has entered.
 *
 * Cancelled entries stay on the list. A withdrawal is part of the record —
 * the receipt still exists, the refund may still be owed — and a page that
 * quietly drops them is one a parent cannot use to work out what happened.
 */
export default function MyEntriesPage() {
  const router = useRouter();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const result = await fetchMyEntries();
      if (!alive) return;

      if (result.error) setError(result.error);
      setEntries(result.entries);
      setLoading(false);
    };

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  const withdraw = async (entry: Entry) => {
    if (busy) return;
    setError("");
    setBusy(entry.id);

    const result = await cancelEntry(entry.id);
    setBusy("");

    if (result.error || !result.entry) {
      // The deadline, if it has passed, is refused by the database with a
      // sentence of its own. Showing it is the whole point.
      setError(result.error ?? "Couldn't withdraw that entry.");
      return;
    }
    setEntries(entries.map((e) => (e.id === entry.id ? result.entry! : e)));
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Your entries</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">Events you&apos;ve entered</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Each entry has a receipt number. Organisers take payment themselves and mark it against
          that number.
        </p>
      </header>

      {error && <p className="cf-card p-5 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <section className="cf-card p-7">
          <p className="text-sm text-muted">You haven&apos;t entered anything yet.</p>
          <Link href="/events" className="cf-btn-primary mt-5">
            See what&apos;s on
          </Link>
        </section>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => {
            const payment = PAYMENT_BADGE[entry.paymentStatus] ?? PAYMENT_BADGE.unpaid;
            const cancelled = entry.status === "cancelled";

            return (
              <li key={entry.id} className="cf-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/events/${entry.eventId}`}
                      className="font-display text-lg font-semibold text-ink hover:text-gold"
                    >
                      {entry.eventTitle ?? "An event"}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {entry.participantName} — {entry.categoryName}
                    </p>
                    {entry.eventStartsAt && (
                      <p className="mt-1 text-xs text-faint">
                        {formatDateTime(entry.eventStartsAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {cancelled ? (
                      <span className="cf-badge cf-badge-danger">Cancelled</span>
                    ) : (
                      <span className="cf-badge cf-badge-ok">Entered</span>
                    )}
                    <span className={`cf-badge ${payment.className}`}>{payment.label}</span>
                  </div>
                </div>

                {entry.members.length > 0 && (
                  <p className="mt-3 text-xs text-faint">
                    With {entry.members.map((m) => m.name).join(", ")}
                  </p>
                )}

                <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-sm">
                  <div>
                    <dt className="cf-eyebrow">Receipt</dt>
                    <dd className="mt-1 font-mono text-xs text-ink">{entry.receiptNo}</dd>
                  </div>
                  <div>
                    <dt className="cf-eyebrow">Fee</dt>
                    <dd className="mt-1 text-ink">{formatFee(entry.amountDue)}</dd>
                  </div>
                </dl>

                {cancelled ? (
                  <p className="mt-4 text-xs leading-relaxed text-muted">
                    {entry.cancelledReason ??
                      (entry.cancelledByMe ? "You withdrew this entry." : "This entry was cancelled.")}
                    {entry.paymentStatus === "refund_due" &&
                      " The organiser will be in touch about your refund — the money was paid to them, not to us."}
                  </p>
                ) : (
                  entry.eventStatus !== "completed" && (
                    <button
                      type="button"
                      className="cf-btn-ghost mt-4 text-danger"
                      onClick={() => withdraw(entry)}
                      disabled={busy !== ""}
                    >
                      {busy === entry.id ? "Withdrawing…" : "Withdraw this entry"}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
