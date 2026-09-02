import { GoogleGenAI, Type } from "@google/genai";
import { supabaseServerAdmin } from "@/lib/supabase-server";

// Swap the model here in one place if it gets deprecated or a cheaper/better
// option ships — nothing else in this file should reference a model name.
// gemini-2.5-flash-lite is blocked for accounts created after its cutover
// date ("no longer available to new users"); gemini-3.5-flash-lite is the
// current flash-lite-tier model confirmed working against this project.
const MODEL = "gemini-3.5-flash-lite";

// $ per 1M tokens, input/output — used only for the rough cost estimate on
// the admin usage page. Flash-lite-tier placeholder rate; confirm against
// Google's current pricing page and update alongside MODEL if it changes.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
};

function getClient() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set.");
  }
  return new GoogleGenAI({ apiKey });
}

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function readUsage(response: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}): LlmUsage {
  const usage = response.usageMetadata || {};
  return {
    promptTokens: usage.promptTokenCount || 0,
    completionTokens: usage.candidatesTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0,
  };
}

// ---------------------------------------------------------------------
// Which of these families is worth this coach's time?
// ---------------------------------------------------------------------

/** The coach, in the terms that decide a match. Assembled by the API route. */
export type CoachContext = {
  displayName: string;
  providerType: string;
  teaches: string[];
  areas: string[];
  teachingPlaces: string[];
  experienceYears: number | null;
  feeMin: number | null;
  feeMax: number | null;
  feePeriod: string | null;
  helpStatement: string;
  bio: string;
  availability: { day: string; place: string; start: string; end: string }[];
};

/** One row of demand, flattened. Carries no identity — see students.ts. */
export type DemandContext = {
  key: string;
  kind: string;
  wants: string[];
  area: string;
  distance_km: number | null;
  learner_age: number | null;
  level: string | null;
  preferred_modes: string[] | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_period: string | null;
  notes: string | null;
  students: number;
};

export type RankedDemand = { key: string; reason: string };

/**
 * Ranks demand the coach can already see.
 *
 * Deliberately not a search. The database has already decided who is eligible
 * — the right subject, a served area, a parent who agreed to be found — and
 * those are rules, not judgement calls, so they stay in SQL where they can be
 * audited. What is left is the judgement: this family wants a nine-year-old
 * beginner taught at home on Saturday mornings, and you already run a
 * Saturday morning batch four streets away. A filter cannot say that.
 *
 * The model may only return keys it was given, and is asked for a reason per
 * pick because an unexplained ranking is one a coach cannot disagree with.
 */
export async function rankDemandForCoach(
  coach: CoachContext,
  demand: DemandContext[],
  limit = 8
): Promise<{ result: RankedDemand[]; usage: LlmUsage }> {
  const ai = getClient();
  const keys = demand.map((d) => d.key);

  const money = (min: number | null, max: number | null, period: string | null) => {
    if (min === null && max === null) return "not stated";
    const range = min !== null && max !== null && min !== max ? `${min}-${max}` : `${min ?? max}`;
    return `INR ${range} ${period || ""}`.trim();
  };

  const coachLines = [
    `Name: ${coach.displayName}`,
    `Type: ${coach.providerType}`,
    `Teaches: ${coach.teaches.join(", ") || "not stated"}`,
    `Serves areas: ${coach.areas.join(", ") || "not stated"}`,
    `Runs classes: ${coach.teachingPlaces.join(", ") || "not stated"}`,
    `Experience: ${coach.experienceYears ?? "not stated"} years`,
    `Fees: ${money(coach.feeMin, coach.feeMax, coach.feePeriod)}`,
    `Available: ${
      coach.availability.map((a) => `${a.day} ${a.start}-${a.end} (${a.place})`).join("; ") ||
      "not stated"
    }`,
    `How they say they help: ${coach.helpStatement || "not stated"}`,
    `Bio: ${coach.bio || "not stated"}`,
  ].join("\n");

  const demandLines = demand
    .map((d) =>
      [
        `key: ${d.key}`,
        `type: ${d.kind === "group" ? `group of ${d.students} students` : "one family"}`,
        `wants: ${d.wants.join(", ")}`,
        `area: ${d.area}${d.distance_km !== null ? ` (${d.distance_km.toFixed(1)} km away)` : ""}`,
        `learner age: ${d.learner_age ?? "not stated"}`,
        `level: ${d.level ?? "not stated"}`,
        `prefers classes: ${d.preferred_modes?.join(", ") || "no preference"}`,
        `days: ${d.preferred_days?.join(", ") || "no preference"}`,
        `time: ${d.preferred_time ?? "no preference"}`,
        `budget: ${money(d.budget_min, d.budget_max, d.budget_period)}`,
        `notes: ${d.notes || "none"}`,
      ].join(" | ")
    )
    .join("\n");

  const prompt = `You are helping a coach or tutor in India decide which families to approach first, on a marketplace where parents post what they are looking for.

Below is the coach, then a numbered list of families and groups who want something the coach teaches, near enough to reach. All of them are already eligible — you are ranking, not filtering.

Pick at most ${limit}, best first. Judge on fit a database cannot see: whether the coach's own timings, format, fee range, experience and stated strengths actually match what this family asked for. Prefer specific evidence over generic enthusiasm. If a family is a poor fit, leave them out rather than padding the list — returning three good ones is a better answer than eight mediocre ones.

For each pick, write ONE short sentence addressed to the coach, naming the concrete reason. Good: "They want Saturday-morning badminton for a 9-year-old beginner, which is the slot you already run in Sector 62." Bad: "This looks like a great match for your skills."

Only use a key from the list. Never invent one.

COACH
${coachLines}

FAMILIES
${demandLines}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          picks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING, format: "enum", enum: keys },
                reason: { type: Type.STRING },
              },
              required: ["key", "reason"],
            },
          },
        },
        required: ["picks"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    picks?: { key: string; reason: string }[];
  };

  const allowed = new Set(keys);
  const seen = new Set<string>();

  // A model that repeats a key, or invents one, must not be able to put a
  // family on this screen twice or a stranger on it at all.
  const result = (parsed.picks || [])
    .filter((p) => allowed.has(p.key) && !seen.has(p.key) && seen.add(p.key))
    .slice(0, limit)
    .map((p) => ({ key: p.key, reason: p.reason }));

  return { result, usage: readUsage(response) };
}

// ---------------------------------------------------------------------
// Which of these coaches is worth this parent's time?
// ---------------------------------------------------------------------

/** The requirement, as the parent stated it. */
export type SeekerContext = {
  wants: string[];
  area: string;
  learnerAge: number | null;
  level: string | null;
  preferredModes: string[];
  preferredDays: string[];
  preferredTime: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetPeriod: string | null;
  notes: string;
};

/** One coach search already returned. A public listing, so it is named. */
export type CoachOption = {
  id: string;
  name: string;
  teaches: string[];
  area: string;
  distanceKm: number | null;
  experienceYears: number | null;
  feeMin: number | null;
  feeMax: number | null;
  feePeriod: string | null;
  teachingPlaces: string[];
  helpStatement: string;
  bio: string;
};

export type RankedCoaches = { providerId: string; reason: string };

/**
 * The mirror of rankDemandForCoach, and the same division of labour: search
 * has already decided who is eligible — teaches it, serves the area, approved,
 * within the radius — and this only orders what came back and says why.
 *
 * The reason is written to the parent, not about the coach, because a parent
 * choosing who will teach their child is the least appropriate audience for
 * marketing copy. "Runs a Saturday morning batch nearby, which is when you
 * said you're free" is a fact they can check; "highly experienced and
 * passionate" is not.
 */
export async function rankCoachesForSeeker(
  seeker: SeekerContext,
  coaches: CoachOption[],
  limit = 6
): Promise<{ result: RankedCoaches[]; usage: LlmUsage }> {
  const ai = getClient();
  const ids = coaches.map((c) => c.id);

  const money = (min: number | null, max: number | null, period: string | null) => {
    if (min === null && max === null) return "not stated";
    const range = min !== null && max !== null && min !== max ? `${min}-${max}` : `${min ?? max}`;
    return `INR ${range} ${period || ""}`.trim();
  };

  const seekerLines = [
    `Looking for: ${seeker.wants.join(", ") || "not stated"}`,
    `Area: ${seeker.area}`,
    `Learner age: ${seeker.learnerAge ?? "not stated"}`,
    `Level: ${seeker.level ?? "not stated"}`,
    `Wants classes: ${seeker.preferredModes.join(", ") || "no preference"}`,
    `Days: ${seeker.preferredDays.join(", ") || "no preference"}`,
    `Time of day: ${seeker.preferredTime ?? "no preference"}`,
    `Budget: ${money(seeker.budgetMin, seeker.budgetMax, seeker.budgetPeriod)}`,
    `Notes: ${seeker.notes || "none"}`,
  ].join("\n");

  const coachLines = coaches
    .map((c) =>
      [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `teaches: ${c.teaches.join(", ") || "not stated"}`,
        `area: ${c.area}${c.distanceKm !== null ? ` (${c.distanceKm.toFixed(1)} km away)` : ""}`,
        `experience: ${c.experienceYears ?? "not stated"} years`,
        `fees: ${money(c.feeMin, c.feeMax, c.feePeriod)}`,
        `runs classes: ${c.teachingPlaces.join(", ") || "not stated"}`,
        `says they help with: ${c.helpStatement || "not stated"}`,
        `bio: ${c.bio || "not stated"}`,
      ].join(" | ")
    )
    .join("\n");

  const prompt = `You are helping a parent in India shortlist coaches and tutors for their child, on a marketplace where coaches publish a listing.

Below is what the parent is looking for, then a list of coaches who already teach it and serve their area. All of them are eligible — you are shortlisting, not filtering.

Pick at most ${limit}, best first. Judge on fit the parent would have to read every listing to spot: whether the coach's format, timings, fee range, experience and stated strengths actually match this child's age, level and the family's constraints. If a coach is a poor fit, leave them out — three good suggestions beat six padded ones.

For each pick, write ONE short sentence addressed to the parent, giving the concrete reason. Good: "Coaches under-11s at a ground 1 km away, and the fees sit inside your range." Bad: "A highly experienced and passionate coach."

Never claim anything the listing does not say. Never mention a price, a timing or an age band that is not in the data above. Only use an id from the list.

PARENT IS LOOKING FOR
${seekerLines}

COACHES
${coachLines}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          picks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                providerId: { type: Type.STRING, format: "enum", enum: ids },
                reason: { type: Type.STRING },
              },
              required: ["providerId", "reason"],
            },
          },
        },
        required: ["picks"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    picks?: { providerId: string; reason: string }[];
  };

  const allowed = new Set(ids);
  const seen = new Set<string>();

  const result = (parsed.picks || [])
    .filter((p) => allowed.has(p.providerId) && !seen.has(p.providerId) && seen.add(p.providerId))
    .slice(0, limit)
    .map((p) => ({ providerId: p.providerId, reason: p.reason }));

  return { result, usage: readUsage(response) };
}

export async function recordLlmUsage(
  purpose: "rank_demand_for_coach" | "rank_coaches_for_seeker",
  usage: LlmUsage,
  relatedId?: string | null
) {
  await supabaseServerAdmin.from("llm_usage_log").insert({
    purpose,
    model: MODEL,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    related_id: relatedId || null,
  });
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}
