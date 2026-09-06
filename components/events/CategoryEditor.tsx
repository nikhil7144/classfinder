"use client";

import { useState } from "react";
import type { Event, EventCategory } from "@/lib/api/events";
import { replaceCategories, type CategoryInput } from "@/lib/api/my-events";

type Row = {
  /** Absent on a row the organiser has just added. */
  id?: string;
  name: string;
  entryType: "individual" | "team";
  teamSize: string;
  capacity: string;
  feeAmount: string;
  minAge: string;
  maxAge: string;
};

const field =
  "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block text-[0.62rem]";

const toRow = (c: EventCategory): Row => ({
  id: c.id,
  name: c.name,
  entryType: c.entryType,
  teamSize: c.teamSize?.toString() ?? "",
  capacity: c.capacity?.toString() ?? "",
  feeAmount: c.feeAmount?.toString() ?? "",
  minAge: c.minAge?.toString() ?? "",
  maxAge: c.maxAge?.toString() ?? "",
});

const emptyRow = (): Row => ({
  name: "",
  entryType: "individual",
  teamSize: "",
  capacity: "",
  feeAmount: "",
  minAge: "",
  maxAge: "",
});

/** Empty string means "not set", which is a null and not a zero. */
const num = (v: string): number | undefined => {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The categories, edited as a set.
 *
 * The whole list is sent on every save and the array's order becomes
 * `sortOrder`, so moving a row up is a splice here rather than a number to
 * keep straight — the API numbers them.
 *
 * Once 3K puts entries behind these rows this becomes a diff against stable
 * ids instead: a delete-then-insert cannot survive an entry pointing at a
 * category. Until then, replacing the set is what the endpoint does and
 * pretending otherwise here would be inventing a contract.
 */
export default function CategoryEditor({
  event,
  onSaved,
}: {
  event: Event;
  onSaved?: (event: Event) => void;
}) {
  const [rows, setRows] = useState<Row[]>(event.categories.map(toRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    setSaved(false);
  };

  const save = async () => {
    if (saving) return;
    setError("");
    setSaved(false);

    const named = rows.filter((r) => r.name.trim());
    if (named.length !== rows.length) {
      setError("Every category needs a name. Remove the blank ones or fill them in.");
      return;
    }

    // Caught here because the database says the same thing less kindly, and
    // because an organiser who has typed six rows should not lose the round
    // trip to find out about one of them.
    const teamWithoutSize = named.find((r) => r.entryType === "team" && !num(r.teamSize));
    if (teamWithoutSize) {
      setError(`How many players in a "${teamWithoutSize.name}" team?`);
      return;
    }

    const payload: CategoryInput[] = named.map((r) => ({
      // The id is what keeps a category — and everything entered into it —
      // across a save. Without it the API would read every row as new, delete
      // the old ones, and be refused by the entries pointing at them.
      ...(r.id ? { id: r.id } : {}),
      name: r.name.trim(),
      entryType: r.entryType,
      teamSize: r.entryType === "team" ? num(r.teamSize) : undefined,
      capacity: num(r.capacity),
      feeAmount: num(r.feeAmount),
      minAge: num(r.minAge),
      maxAge: num(r.maxAge),
    }));

    setSaving(true);
    const result = await replaceCategories(event.id, payload);
    setSaving(false);

    if (result.error || !result.event) {
      setError(result.error ?? "Couldn't save those categories.");
      return;
    }

    setRows(result.event.categories.map(toRow));
    setSaved(true);
    onSaved?.(result.event);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        One row per thing a family can enter — under-10 singles, under-14 team. The fee and the
        number of places belong to the category, not the event, because they differ between them.
      </p>

      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-faint">
          No categories yet. Add the first one below.
        </p>
      )}

      <ul className="space-y-4">
        {rows.map((row, index) => {
          const entered = event.categories.find((c) => c.id === row.id)?.entriesCount ?? 0;

          return (
          <li key={row.id ?? `new-${index}`} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="grow space-y-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                  <div>
                    <label className={label}>Category name</label>
                    <input
                      className={`${field} mt-1.5`}
                      value={row.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                      placeholder="Under-10 boys singles"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className={label}>Entry type</label>
                    <select
                      className={`${field} mt-1.5`}
                      value={row.entryType}
                      onChange={(e) =>
                        update(index, {
                          entryType: e.target.value as Row["entryType"],
                          // An individual category must carry no team size —
                          // the check constraint refuses one, and leaving a
                          // stale number in the box would fail the save for a
                          // field the form no longer shows.
                          teamSize: e.target.value === "team" ? row.teamSize : "",
                        })
                      }
                    >
                      <option value="individual">Individual</option>
                      <option value="team">Team</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Players per team</label>
                    <input
                      className={`${field} mt-1.5 disabled:opacity-40`}
                      value={row.teamSize}
                      onChange={(e) => update(index, { teamSize: e.target.value })}
                      disabled={row.entryType !== "team"}
                      inputMode="numeric"
                      placeholder="2 for doubles"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className={label}>Entry fee (₹ per entry)</label>
                    <input
                      className={`${field} mt-1.5`}
                      value={row.feeAmount}
                      onChange={(e) => update(index, { feeAmount: e.target.value })}
                      inputMode="decimal"
                      placeholder="750"
                    />
                  </div>
                  <div>
                    <label className={label}>Total places</label>
                    <input
                      className={`${field} mt-1.5`}
                      value={row.capacity}
                      onChange={(e) => update(index, { capacity: e.target.value })}
                      inputMode="numeric"
                      placeholder="Blank for no limit"
                    />
                  </div>
                  <div>
                    <label className={label}>Minimum age</label>
                    <input
                      className={`${field} mt-1.5`}
                      value={row.minAge}
                      onChange={(e) => update(index, { minAge: e.target.value })}
                      inputMode="numeric"
                      placeholder="Age on event day"
                    />
                  </div>
                  <div>
                    <label className={label}>Maximum age</label>
                    <input
                      className={`${field} mt-1.5`}
                      value={row.maxAge}
                      onChange={(e) => update(index, { maxAge: e.target.value })}
                      inputMode="numeric"
                      placeholder="Age on event day"
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  className="cf-btn-ghost px-2 py-1 text-xs"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move this category up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="cf-btn-ghost px-2 py-1 text-xs"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label="Move this category down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="cf-btn-ghost px-2 py-1 text-xs text-danger"
                  onClick={() => {
                    setRows(rows.filter((_, i) => i !== index));
                    setSaved(false);
                  }}
                  aria-label="Remove this category"
                >
                  ✕
                </button>
              </div>
            </div>

            {entered > 0 && (
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                {entered === 1 ? "1 entry" : `${entered} entries`} so far. Places cannot go below
                that, and the entry type is fixed now that someone has entered.
              </p>
            )}
          </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-teal">Categories saved.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="cf-btn-ghost"
          onClick={() => setRows([...rows, emptyRow()])}
        >
          Add a category
        </button>
        <button type="button" className="cf-btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save categories"}
        </button>
      </div>
    </div>
  );
}
