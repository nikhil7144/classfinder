"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchPlans,
  fetchSubscriptions,
  formatPrice,
  recordSubscription,
  type Plan,
  type Subscription,
} from "@/lib/api/subscriptions";

type Party = { id: string; name: string; kind: "organiser" | "provider" };

const field =
  "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block text-[0.62rem]";

const MODES = ["cash", "upi", "bank_transfer", "card", "other"] as const;
const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

const emptyDraft = () => ({
  partyId: "",
  planId: "",
  eventId: "",
  startsOn: "",
  endsOn: "",
  amountPaid: "",
  paymentMode: "",
  paymentReference: "",
  note: "",
});

/**
 * Recording that somebody paid.
 *
 * No money moves here and none ever will: this is a ledger of what arrived by
 * UPI, cash or transfer, kept by the person who saw it arrive. Phase 6
 * replaces the entering, not the record.
 *
 * The party list is read straight from Supabase because organisers and
 * providers both have admin read policies and there is no shaping to do; the
 * writes all go through the API, which is where the rules are.
 */
export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());

  const load = useCallback(async () => {
    const [list, catalogue, organisers, providers] = await Promise.all([
      fetchSubscriptions(),
      fetchPlans(),
      supabase.from("organisers").select("id, name").order("name"),
      supabase.from("providers").select("id, display_name").order("display_name"),
    ]);

    if (list.error) setError(list.error);
    setSubscriptions(list.subscriptions);
    setPlans(catalogue.plans.filter((p) => p.isActive));

    setParties([
      ...(organisers.data ?? []).map((o) => ({
        id: (o as { id: string }).id,
        name: (o as { name: string | null }).name || "Unnamed company",
        kind: "organiser" as const,
      })),
      ...(providers.data ?? []).map((p) => ({
        id: (p as { id: string }).id,
        name: (p as { display_name: string | null }).display_name || "Unnamed coach",
        kind: "provider" as const,
      })),
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const party = parties.find((p) => p.id === draft.partyId);
  const plan = plans.find((p) => p.id === draft.planId);

  // Only the catalogue this party can actually buy from. Offering a coach an
  // organiser tier would be offering something the model does not sell.
  const availablePlans = party
    ? plans.filter((p) => p.audience === party.kind)
    : plans.filter((p) => p.audience !== "advertiser");

  const save = async () => {
    if (busy) return;
    setError("");

    if (!party) {
      setError("Which company or coach paid?");
      return;
    }
    if (!plan) {
      setError("Pick the plan they bought.");
      return;
    }
    if (plan.kind === "per_event" && !draft.eventId.trim()) {
      setError("A per-event purchase needs the event it paid for.");
      return;
    }

    setBusy(true);
    const result = await recordSubscription({
      ...(party.kind === "organiser" ? { organiserId: party.id } : { providerId: party.id }),
      planId: plan.id,
      ...(draft.eventId.trim() ? { eventId: draft.eventId.trim() } : {}),
      ...(draft.startsOn ? { startsOn: draft.startsOn } : {}),
      ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
      ...(draft.amountPaid.trim() ? { amountPaid: Number(draft.amountPaid) } : {}),
      ...(draft.paymentMode
        ? { paymentMode: draft.paymentMode as (typeof MODES)[number] }
        : {}),
      ...(draft.paymentReference.trim() ? { paymentReference: draft.paymentReference.trim() } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft(emptyDraft());
    load();
  };

  return (
    <main className="space-y-6">
      <header>
        <h1 className="cf-display text-2xl text-ink">Subscriptions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          A record of what has been paid, kept by whoever saw it arrive. Nothing is charged here —
          a gateway arrives in Phase 6 and will fill these same columns in.
        </p>
      </header>

      {error && <p className="cf-card p-4 text-sm text-danger">{error}</p>}

      <section className="cf-card space-y-4 p-6">
        <h2 className="cf-eyebrow">Record a payment</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Who paid</label>
            <select
              className={`${field} mt-1.5`}
              value={draft.partyId}
              onChange={(e) => setDraft({ ...draft, partyId: e.target.value, planId: "" })}
            >
              <option value="">Pick a company or coach</option>
              <optgroup label="Event companies">
                {parties
                  .filter((p) => p.kind === "organiser")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Coaches & academies">
                {parties
                  .filter((p) => p.kind === "provider")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className={label}>What they bought</label>
            <select
              className={`${field} mt-1.5`}
              value={draft.planId}
              onChange={(e) => setDraft({ ...draft, planId: e.target.value })}
            >
              <option value="">Pick a plan</option>
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p.priceAmount)}
                  {p.kind === "per_event" ? " per event" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {plan?.kind === "per_event" && (
          <div>
            <label className={label}>Which event it paid for</label>
            <input
              className={`${field} mt-1.5`}
              value={draft.eventId}
              onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}
              placeholder="Event id, from the event's own page"
            />
            <p className="mt-1 text-xs text-faint">
              One purchase per event — a second is a double-recorded payment, which is a refund
              conversation rather than two entitlements.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className={label}>Starts on</label>
            <input
              type="date"
              className={`${field} mt-1.5`}
              value={draft.startsOn}
              onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Ends on</label>
            <input
              type="date"
              className={`${field} mt-1.5`}
              value={draft.endsOn}
              onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Amount paid (₹)</label>
            <input
              className={`${field} mt-1.5`}
              value={draft.amountPaid}
              onChange={(e) => setDraft({ ...draft, amountPaid: e.target.value })}
              inputMode="decimal"
              placeholder={plan ? String(plan.priceAmount) : "4999"}
            />
          </div>
          <div>
            <label className={label}>How they paid</label>
            <select
              className={`${field} mt-1.5`}
              value={draft.paymentMode}
              onChange={(e) => setDraft({ ...draft, paymentMode: e.target.value })}
            >
              <option value="">Not recorded</option>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Reference</label>
            <input
              className={`${field} mt-1.5`}
              value={draft.paymentReference}
              onChange={(e) => setDraft({ ...draft, paymentReference: e.target.value })}
              placeholder="UPI reference, cheque number"
              maxLength={120}
            />
          </div>
          <div>
            <label className={label}>Note</label>
            <input
              className={`${field} mt-1.5`}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Anything the next admin would want to know"
              maxLength={500}
            />
          </div>
        </div>

        <button type="button" className="cf-btn-primary" onClick={save} disabled={busy}>
          {busy ? "Recording…" : "Record this payment"}
        </button>
      </section>

      <section className="cf-card p-6">
        <h2 className="cf-display text-lg text-ink">Recorded</h2>

        {subscriptions === null ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : subscriptions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {subscriptions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {s.partyName ?? "Unnamed"}{" "}
                    <span className="text-faint">
                      · {s.partyKind === "organiser" ? "company" : "coach"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {s.planName}
                    {s.eventId && " · one event"} · {s.startsOn}
                    {s.endsOn ? ` – ${s.endsOn}` : " – open-ended"}
                  </p>
                  {s.note && <p className="mt-1 text-xs text-faint">{s.note}</p>}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-display text-base text-ink">
                    {s.amountPaid === null ? "—" : formatPrice(s.amountPaid)}
                  </p>
                  <p className="text-xs text-faint">
                    {s.paymentMode ? MODE_LABEL[s.paymentMode] : "Method not recorded"}
                    {s.paymentReference && ` · ${s.paymentReference}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
