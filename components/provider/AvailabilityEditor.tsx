"use client";

import { AvailabilitySlotInput, WEEK_DAYS, emptyAvailabilitySlot } from "@/lib/profile-rules";

type Props = {
  slots: AvailabilitySlotInput[];
  places: string[];
  onChange: (slots: AvailabilitySlotInput[]) => void;
  invalid?: boolean;
};

/**
 * Availability is day- AND place-wise: a provider may run group classes at
 * their academy at the weekend and travel to students on weekday evenings,
 * so a slot carries where it happens, not just when.
 *
 * `places` is derived from the rest of the form — branch names for an
 * institution, chosen teaching formats for an individual — so the options
 * always reflect what the provider actually said they do.
 */
export default function AvailabilityEditor({ slots, places, onChange, invalid }: Props) {
  const update = (index: number, patch: Partial<AvailabilitySlotInput>) =>
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const remove = (index: number) => onChange(slots.filter((_, i) => i !== index));

  const add = () =>
    onChange([...slots, { ...emptyAvailabilitySlot(), place: places[0] ?? "" }]);

  if (places.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add where you teach first — your branches, or the areas you serve — then you can say when
        you&apos;re available at each one.
      </p>
    );
  }

  return (
    <div className={invalid ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-4" : ""}>
      {slots.length === 0 ? (
        <p className="text-sm text-muted">
          No availability added yet. Parents can still contact you, but showing when you teach gets
          far more enquiries.
        </p>
      ) : (
        <div className="space-y-3">
          {slots.map((slot, index) => (
            <div key={index} className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-center">
                <select
                  className="cf-input"
                  value={slot.place}
                  onChange={(e) => update(index, { place: e.target.value })}
                  aria-label="Place"
                >
                  <option value="">Where…</option>
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  className="cf-input"
                  value={slot.day}
                  onChange={(e) => update(index, { day: e.target.value })}
                  aria-label="Day"
                >
                  {WEEK_DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>

                <input
                  type="time"
                  className="cf-input sm:w-[7.5rem]"
                  value={slot.start}
                  onChange={(e) => update(index, { start: e.target.value })}
                  aria-label="Start time"
                />
                <input
                  type="time"
                  className="cf-input sm:w-[7.5rem]"
                  value={slot.end}
                  onChange={(e) => update(index, { end: e.target.value })}
                  aria-label="End time"
                />

                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="justify-self-start rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-3 hover:text-danger"
                  aria-label={`Remove slot ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="mt-3 text-sm font-semibold text-gold transition hover:text-accent-ink"
      >
        + Add availability
      </button>
    </div>
  );
}
