"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchTaxonomy } from "@/lib/api/reference";
import {
  BUDGET_PERIODS,
  LEVELS,
  PREFERRED_TIMES,
  Requirement,
  RequirementErrors,
  ServiceOption,
  WEEK_DAYS,
  groupServices,
} from "@/lib/requirements";

type TeachingPlace = { id: string; label: string; description: string | null };

type Props = {
  value: Requirement;
  onChange: (next: Requirement) => void;
  errors?: RequirementErrors;
  /**
   * The group form already asked "what are you looking for?" as a single
   * choice — a group is one class several families share — so it hides this
   * field and keeps its own. A parent may be looking for several things.
   */
  showLookingFor?: boolean;
  /** The group form asks for its own notes, in its own words. */
  showNotes?: boolean;
  /**
   * Who the seeker said they're looking for, from their profile — not asked
   * here and not saved here. Only the wording below depends on it: "how old
   * are you" and "how old is the learner" are the same field and a different
   * question. Blank on the group form, which has no single answer.
   */
  relation?: string;
};

const errorText = "mt-2 text-sm text-danger";

/**
 * The questions a coach needs answered before they can decide whether to get
 * in touch, asked once and rendered in two places.
 *
 * Everything here is optional. A parent who fills in none of it is still a
 * parent; they are simply harder to match, and the copy says so rather than
 * blocking them. The one exception is what they're looking for, which is
 * required only when they've asked to be found — enforced by the caller.
 */
export default function RequirementFields({
  value,
  onChange,
  errors = {},
  showLookingFor = true,
  showNotes = true,
  relation = "",
}: Props) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [places, setPlaces] = useState<TeachingPlace[]>([]);

  useEffect(() => {
    const load = async () => {
      const { serviceCategories: s, teachingPlaces: p } = await fetchTaxonomy();

      setServices((s as ServiceOption[]) || []);
      setPlaces((p as TeachingPlace[]) || []);
    };

    load();
  }, []);

  const set = <K extends keyof Requirement>(key: K, next: Requirement[K]) =>
    onChange({ ...value, [key]: next });

  const toggle = (key: "lookingFor" | "preferredModes" | "preferredDays", id: string) => {
    const current = value[key];
    set(
      key,
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  };

  return (
    <div className="space-y-5">
      {showLookingFor && (
        <div>
          <label className="mb-2 block text-sm text-muted">What are you looking for?</label>
          <p className="mb-3 text-xs text-faint">
            Pick everything that applies — one child learning two things, or two children, is the
            same list.
          </p>

          {services.length === 0 ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="space-y-4">
              {groupServices(services).map((g) => (
                <div key={g.group}>
                  <p className="cf-eyebrow">{g.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {g.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="cf-pill px-3 py-1.5 text-xs"
                        data-selected={value.lookingFor.includes(s.id)}
                        onClick={() => toggle("lookingFor", s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {errors.lookingFor?.[0] && <p className={errorText}>{errors.lookingFor[0]}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-muted">
            {relation === "self" ? "How old are you?" : "How old is the learner?"}
          </label>
          <input
            className="cf-input"
            inputMode="numeric"
            placeholder="e.g. 9"
            aria-invalid={Boolean(errors.learnerAge?.length)}
            value={value.learnerAge}
            onChange={(e) => set("learnerAge", e.target.value)}
          />
          <p className="mt-2 text-xs text-faint">
            Optional. Coaches often teach one age band.
          </p>
          {errors.learnerAge?.[0] && <p className={errorText}>{errors.learnerAge[0]}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm text-muted">
            {relation === "self"
              ? "Where are you starting from?"
              : "Where are they starting from?"}
          </label>
          <select
            className="cf-input"
            value={value.level}
            onChange={(e) => set("level", e.target.value)}
          >
            <option value="">Not sure / doesn&apos;t matter</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm text-muted">How would you like classes to run?</label>
        <div className="flex flex-wrap gap-2">
          {places.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.description || undefined}
              className="cf-pill px-3 py-1.5 text-xs"
              data-selected={value.preferredModes.includes(p.id)}
              onClick={() => toggle("preferredModes", p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">Leave blank if you&apos;re open to any of them.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-muted">Which days suit you?</label>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                className="cf-pill px-3 py-1.5 text-xs"
                data-selected={value.preferredDays.includes(d.value)}
                onClick={() => toggle("preferredDays", d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-muted">What time of day?</label>
          <select
            className="cf-input"
            value={value.preferredTime}
            onChange={(e) => set("preferredTime", e.target.value)}
          >
            <option value="">Any time</option>
            {PREFERRED_TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm text-muted">Roughly what were you thinking?</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="cf-input"
            inputMode="numeric"
            placeholder="From ₹"
            aria-invalid={Boolean(errors.budget?.length)}
            value={value.budgetMin}
            onChange={(e) => set("budgetMin", e.target.value)}
          />
          <input
            className="cf-input"
            inputMode="numeric"
            placeholder="To ₹"
            aria-invalid={Boolean(errors.budget?.length)}
            value={value.budgetMax}
            onChange={(e) => set("budgetMax", e.target.value)}
          />
          <select
            className="cf-input"
            value={value.budgetPeriod}
            onChange={(e) => set("budgetPeriod", e.target.value)}
          >
            <option value="">per…</option>
            {BUDGET_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-faint">
          Optional, and not binding. It stops coaches well outside your range getting in touch.
        </p>
        {errors.budget?.[0] && <p className={errorText}>{errors.budget[0]}</p>}
      </div>

      {showNotes && (
        <div>
          <label className="mb-2 block text-sm text-muted">Anything else? (optional)</label>
          <textarea
            className="cf-input min-h-24"
            placeholder="Preferred language, a school syllabus, an exam date, anything a coach should know before writing to you."
            value={value.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
