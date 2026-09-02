/**
 * What a family is looking for.
 *
 * One vocabulary, used by three screens that were previously asking three
 * different things (or, in the parent's case, nothing at all): the seeker
 * profile, the group form, and the coach's demand feed. A coach filtering on
 * "beginner, weekends, at my academy" has to be filtering the same words a
 * parent picked, so the lists live here and nowhere else.
 *
 * Every value is mirrored by a check constraint in
 * db/2026-09-03-phase2r-find-students.sql — they must move together.
 */

/**
 * Who the seeker is looking for classes for.
 *
 * Lives here with the rest of the shared vocabulary, but it is NOT part of a
 * requirement and is not asked with one — see SeekerProfileInput.relation in
 * profile-rules. It is a fact about the person, it is required, and it is
 * asked alongside their name and area, so it is known for everyone rather
 * than only for the people who filled in an optional block.
 *
 * 'self' is first because it is what the product silently assumed before it
 * thought to ask. Mother and father are kept apart rather than folded into
 * 'parent': it is a thing people state about themselves, it costs nothing to
 * record, and the aggregate collapses them anyway (audience_segments, 2T).
 */
export const RELATIONS = [
  { value: "self", label: "Myself" },
  { value: "mother", label: "My child — I'm their mother" },
  { value: "father", label: "My child — I'm their father" },
  { value: "guardian", label: "A child I'm the guardian of" },
  { value: "relative", label: "A child I'm related to" },
  { value: "other", label: "Someone else" },
] as const;

export const LEVELS = [
  { value: "beginner", label: "Complete beginner" },
  { value: "improver", label: "Knows the basics" },
  { value: "advanced", label: "Advanced or competitive" },
  { value: "exam_prep", label: "Exam or board preparation" },
] as const;

export const PREFERRED_TIMES = [
  { value: "weekday_morning", label: "Weekday mornings" },
  { value: "weekday_afternoon", label: "Weekday afternoons" },
  { value: "weekday_evening", label: "Weekday evenings" },
  { value: "weekend", label: "Weekends" },
  { value: "flexible", label: "Flexible" },
] as const;

/** Same values and order as the provider form's fee period. */
export { FEE_PERIODS as BUDGET_PERIODS, WEEK_DAYS } from "@/lib/profile-rules";

/**
 * The taxonomy groups, labelled. Duplicated from nowhere — the search page and
 * the group form each carried their own copy of this map and had already
 * drifted (the group form's list was missing nothing yet, but it was two
 * edits away from it).
 */
export const SERVICE_GROUP_LABEL: Record<string, string> = {
  sport: "Sports",
  wellness_fitness: "Wellness & Fitness",
  mind_game: "Mind Games",
  indoor_game: "Indoor Games",
  dance: "Dance",
  music: "Music",
  subject: "School Subjects",
  exam_board: "Boards & Exams",
};

export const SERVICE_GROUP_ORDER = Object.keys(SERVICE_GROUP_LABEL);

export type ServiceOption = { id: string; name: string; group: string };

/** Options for a `<select>`, grouped into `<optgroup>`s in taxonomy order. */
export function groupServices(services: ServiceOption[]) {
  const grouped = services.reduce<Record<string, ServiceOption[]>>((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return SERVICE_GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => ({
    group: g,
    label: SERVICE_GROUP_LABEL[g],
    items: grouped[g],
  }));
}

/**
 * The requirement itself. Both a parent's profile and a group carry one; the
 * only difference is that a group's subject is a single choice made at
 * creation, while a parent may be looking for several things at once.
 */
export type Requirement = {
  lookingFor: string[];
  learnerAge: string;
  level: string;
  preferredModes: string[];
  preferredDays: string[];
  preferredTime: string;
  budgetMin: string;
  budgetMax: string;
  budgetPeriod: string;
  notes: string;
};

export const emptyRequirement = (): Requirement => ({
  lookingFor: [],
  learnerAge: "",
  level: "",
  preferredModes: [],
  preferredDays: [],
  preferredTime: "",
  budgetMin: "",
  budgetMax: "",
  budgetPeriod: "",
  notes: "",
});

export type RequirementErrors = Partial<
  Record<"lookingFor" | "learnerAge" | "budget", string[]>
>;

/**
 * Deliberately thin. A requirement is not a gate on anything — a parent can
 * browse and message with none of it filled in, and the one field that must
 * be there for a coach to find them (what they want) is only required when
 * they have asked to be found.
 */
export function getRequirementErrors(
  req: Requirement,
  opts: { requireLookingFor: boolean }
): RequirementErrors {
  const errors: RequirementErrors = {};
  const add = (field: keyof RequirementErrors, message: string) => {
    errors[field] = [...(errors[field] || []), message];
  };

  if (opts.requireLookingFor && req.lookingFor.length === 0) {
    add("lookingFor", "Pick at least one thing you're looking for.");
  }

  if (req.learnerAge.trim()) {
    const age = Number(req.learnerAge.trim());
    if (!Number.isInteger(age) || age < 2 || age > 99) {
      add("learnerAge", "Enter an age between 2 and 99.");
    }
  }

  const min = req.budgetMin.trim() ? Number(req.budgetMin) : null;
  const max = req.budgetMax.trim() ? Number(req.budgetMax) : null;

  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
    add("budget", "Budget must be a number.");
  } else if (min !== null && max !== null && max < min) {
    add("budget", "The upper budget can't be lower than the lower one.");
  } else if ((min !== null || max !== null) && !req.budgetPeriod) {
    add("budget", "Choose what the budget is per — hour, session, month or course.");
  }

  return errors;
}

/** Form strings to the column values the database expects. */
export function requirementToColumns(req: Requirement) {
  const int = (v: string) => (v.trim() ? Math.round(Number(v)) : null);

  return {
    learner_age: int(req.learnerAge),
    level: req.level || null,
    preferred_modes: req.preferredModes,
    preferred_days: req.preferredDays,
    preferred_time: req.preferredTime || null,
    budget_min: int(req.budgetMin),
    budget_max: int(req.budgetMax),
    budget_period: req.budgetPeriod || null,
  };
}

type RequirementRow = {
  learner_age?: number | null;
  level?: string | null;
  preferred_modes?: string[] | null;
  preferred_days?: string[] | null;
  preferred_time?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_period?: string | null;
};

export function requirementFromRow(
  row: RequirementRow | null,
  extras: { lookingFor?: string[]; notes?: string | null } = {}
): Requirement {
  return {
    lookingFor: extras.lookingFor || [],
    learnerAge: row?.learner_age != null ? String(row.learner_age) : "",
    level: row?.level || "",
    preferredModes: row?.preferred_modes || [],
    preferredDays: row?.preferred_days || [],
    preferredTime: row?.preferred_time || "",
    budgetMin: row?.budget_min != null ? String(row.budget_min) : "",
    budgetMax: row?.budget_max != null ? String(row.budget_max) : "",
    budgetPeriod: row?.budget_period || "",
    notes: extras.notes || "",
  };
}

// ---------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------

/**
 * Shorter than the form's own wording, which is a sentence answering a
 * question ("My child — I'm their mother") and reads badly as a chip.
 */
const RELATION_LABEL: Record<string, string> = {
  self: "Learning themselves",
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  relative: "Relative",
  other: "Someone else",
};
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]));
const TIME_LABEL = Object.fromEntries(PREFERRED_TIMES.map((t) => [t.value, t.label]));

export const relationLabel = (v: string | null | undefined) =>
  (v ? RELATION_LABEL[v] ?? null : null);
export const levelLabel = (v: string | null | undefined) => (v ? LEVEL_LABEL[v] ?? null : null);
export const timeLabel = (v: string | null | undefined) => (v ? TIME_LABEL[v] ?? null : null);

const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "Mon, Wed, Fri" — or null when they didn't narrow it down. */
export function daysLabel(days: string[] | null | undefined): string | null {
  if (!days?.length || days.length === 7) return null;
  return days.map((d) => DAY_LABEL[d] ?? d).join(", ");
}

/** "Around ₹1,500–2,500/month" — the parent's side of formatFees. */
export function budgetLabel(
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined
): string | null {
  if (min == null && max == null) return null;

  const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const suffix =
    period === "per_hour"
      ? "/hour"
      : period === "per_session"
        ? "/session"
        : period === "per_month"
          ? "/month"
          : period === "per_course"
            ? "/course"
            : "";

  if (min != null && max != null && min !== max) return `${money(min)}–${money(max)}${suffix}`;
  return `${money((min ?? max) as number)}${suffix}`;
}

/**
 * "For a 9-year-old" — reads better than a bare number on a card.
 *
 * Takes the relation because the same number means two different sentences:
 * an adult who signed themselves up is not looking "for a 26-year-old".
 */
export function learnerLabel(
  age: number | null | undefined,
  relation?: string | null
): string | null {
  if (age == null) return relation === "self" ? "Adult learner" : null;
  if (relation === "self") return `Adult learner, ${age}`;
  if (age >= 18) return `For an adult (${age})`;
  return `For a ${age}-year-old`;
}
