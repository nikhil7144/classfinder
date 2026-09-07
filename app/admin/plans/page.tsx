"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPlan,
  fetchPlans,
  formatAllowance,
  formatPeriod,
  formatPrice,
  updatePlan,
  type Plan,
} from "@/lib/api/subscriptions";

const AUDIENCES: { key: "organiser" | "provider" | "advertiser"; label: string; note: string }[] = [
  {
    key: "organiser",
    label: "Event companies",
    note: "Tiers. The tier says how many events may be live at once.",
  },
  {
    key: "provider",
    label: "Coaches & academies",
    note: "A listing subscription. Running an event is bought per event.",
  },
  {
    key: "advertiser",
    label: "Advertisers",
    note: "Phase 5. Nothing here yet, and nothing enforced.",
  },
];

const field =
  "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block text-[0.62rem]";

const emptyDraft = () => ({
  audience: "organiser" as "organiser" | "provider" | "advertiser",
  kind: "subscription" as "subscription" | "per_event",
  name: "",
  blurb: "",
  priceAmount: "",
  periodMonths: "",
  maxActiveEvents: "",
});

const num = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The price list, and the one screen that sets it.
 *
 * Three catalogues on one page because the whole point of the model is that
 * they are separate — a coach's listing fee and an events tier being visibly
 * different lists is what stops one being mistaken for the other.
 *
 * Everything goes through the API rather than through Supabase directly: the
 * quota arithmetic and the refusal messages live there, and a second writer
 * would be a second place for the rules to drift.
 */
export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchPlans();
    if (result.error) setError(result.error);
    setPlans(result.plans);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (busy) return;
    setError("");

    if (draft.name.trim().length < 2) {
      setError("Give the plan a name.");
      return;
    }

    setBusy("new");
    const result = await createPlan({
      audience: draft.audience,
      kind: draft.kind,
      name: draft.name.trim(),
      ...(draft.blurb.trim() ? { blurb: draft.blurb.trim() } : {}),
      priceAmount: num(draft.priceAmount) ?? 0,
      // A per-event plan carries neither, and the database says so too.
      ...(draft.kind === "subscription" && num(draft.periodMonths) !== undefined
        ? { periodMonths: num(draft.periodMonths) }
        : {}),
      ...(draft.kind === "subscription" && num(draft.maxActiveEvents) !== undefined
        ? { maxActiveEvents: num(draft.maxActiveEvents) }
        : {}),
    });
    setBusy("");

    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft(emptyDraft());
    setAdding(false);
    load();
  };

  const toggle = async (plan: Plan, patch: { isActive?: boolean; isDefault?: boolean }) => {
    if (busy) return;
    setError("");
    setBusy(plan.id);
    const result = await updatePlan(plan.id, patch);
    setBusy("");

    if (result.error) {
      setError(result.error);
      return;
    }
    load();
  };

  return (
    <main className="space-y-6">
      <header>
        <h1 className="cf-display text-2xl text-ink">Plans</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Three separate catalogues. What a plan allows is one field:{" "}
          <strong className="text-ink">events at a time</strong> — blank for unlimited, a number for
          a tier, and <strong className="text-ink">0</strong> for a listing that carries no event
          rights. Setting the coach default to 0 is what ends the free period for coach events.
        </p>
      </header>

      {error && <p className="cf-card p-4 text-sm text-danger">{error}</p>}

      {!adding ? (
        <button type="button" className="cf-btn-primary" onClick={() => setAdding(true)}>
          Add a plan
        </button>
      ) : (
        <section className="cf-card space-y-4 p-6">
          <h2 className="cf-eyebrow">New plan</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Sold to</label>
              <select
                className={`${field} mt-1.5`}
                value={draft.audience}
                onChange={(e) =>
                  setDraft({ ...draft, audience: e.target.value as typeof draft.audience })
                }
              >
                {AUDIENCES.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Billed</label>
              <select
                className={`${field} mt-1.5`}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as typeof draft.kind })}
              >
                <option value="subscription">As a subscription</option>
                <option value="per_event">Per event</option>
              </select>
            </div>
            <div>
              <label className={label}>Plan name</label>
              <input
                className={`${field} mt-1.5`}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Pro"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Price (₹)</label>
              <input
                className={`${field} mt-1.5`}
                value={draft.priceAmount}
                onChange={(e) => setDraft({ ...draft, priceAmount: e.target.value })}
                inputMode="decimal"
                placeholder="4999"
              />
            </div>
            <div>
              <label className={label}>Runs for (months)</label>
              <input
                className={`${field} mt-1.5 disabled:opacity-40`}
                value={draft.periodMonths}
                onChange={(e) => setDraft({ ...draft, periodMonths: e.target.value })}
                disabled={draft.kind !== "subscription"}
                inputMode="numeric"
                placeholder="12"
              />
            </div>
            <div>
              <label className={label}>Events at a time</label>
              <input
                className={`${field} mt-1.5 disabled:opacity-40`}
                value={draft.maxActiveEvents}
                onChange={(e) => setDraft({ ...draft, maxActiveEvents: e.target.value })}
                disabled={draft.kind !== "subscription"}
                inputMode="numeric"
                placeholder="Blank = unlimited"
              />
            </div>
          </div>

          <div>
            <label className={label}>What it says on the plan</label>
            <input
              className={`${field} mt-1.5`}
              value={draft.blurb}
              onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
              placeholder="Up to five events live at once, for a year."
              maxLength={400}
            />
          </div>

          <div className="flex gap-3">
            <button type="button" className="cf-btn-primary" onClick={add} disabled={busy !== ""}>
              {busy === "new" ? "Adding…" : "Add this plan"}
            </button>
            <button
              type="button"
              className="cf-btn-ghost"
              onClick={() => {
                setAdding(false);
                setDraft(emptyDraft());
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {plans === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        AUDIENCES.map((audience) => {
          const rows = plans.filter((p) => p.audience === audience.key);

          return (
            <section key={audience.key} className="cf-card p-6">
              <h2 className="cf-display text-lg text-ink">{audience.label}</h2>
              <p className="mt-1 text-sm text-muted">{audience.note}</p>

              {rows.length === 0 ? (
                <p className="mt-4 text-sm text-faint">Nothing in this catalogue yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {rows.map((plan) => (
                    <li
                      key={plan.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base text-ink">{plan.name}</span>
                          {plan.isDefault && <span className="cf-badge cf-badge-ok">Default</span>}
                          {!plan.isActive && (
                            <span className="cf-badge cf-badge-neutral">Off</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {formatPrice(plan.priceAmount)} {formatPeriod(plan)} ·{" "}
                          {plan.kind === "per_event"
                            ? "one event"
                            : formatAllowance(plan.maxActiveEvents)}
                        </p>
                        {plan.blurb && <p className="mt-1 text-xs text-faint">{plan.blurb}</p>}
                      </div>

                      <div className="flex shrink-0 gap-2">
                        {plan.kind === "subscription" && !plan.isDefault && (
                          <button
                            type="button"
                            className="cf-btn-ghost text-xs"
                            onClick={() => toggle(plan, { isDefault: true })}
                            disabled={busy !== ""}
                          >
                            Make default
                          </button>
                        )}
                        <button
                          type="button"
                          className="cf-btn-ghost text-xs"
                          onClick={() => toggle(plan, { isActive: !plan.isActive })}
                          disabled={busy !== ""}
                        >
                          {plan.isActive ? "Turn off" : "Turn on"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
