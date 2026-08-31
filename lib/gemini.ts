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

export type MasterOption = { id: string; name: string };

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

export type ExtractedExpertTags = {
  functions: { functionId: string; functionName: string; proof: string }[];
  stageIds: string[];
};

export async function extractExpertTags(
  input: {
    headline: string;
    bio: string;
    pastCompanies: { company: string; years: string }[];
    industries: string[];
  },
  masters: { functions: MasterOption[]; stages: MasterOption[] }
): Promise<{ result: ExtractedExpertTags; usage: LlmUsage }> {
  const ai = getClient();

  const functionIds = masters.functions.map((f) => f.id);
  const stageIds = masters.stages.map((s) => s.id);
  const functionList = masters.functions.map((f) => `- ${f.id}: ${f.name}`).join("\n");
  const stageList = masters.stages.map((s) => `- ${s.id}: ${s.name}`).join("\n");

  const prompt = `You are tagging an operator/consultant ("industry expert") profile for a startup-advisory marketplace.

Given the profile below, pick which of these FUNCTIONS this person can credibly help a founder with, and which of these company STAGES they're suited to serve. Only use the ids provided — never invent new ones. Be conservative: only include a function if the profile gives real evidence for it, and write one short, concrete, differentiating proof sentence per selected function (e.g. a specific outcome, number, or company — not a generic claim).

Available functions:
${functionList}

Available stages:
${stageList}

Profile:
Headline: ${input.headline}
Bio: ${input.bio}
Past companies: ${input.pastCompanies.map((c) => `${c.company} (${c.years})`).join(", ") || "none listed"}
Industries: ${input.industries.join(", ") || "none listed"}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          functions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                functionId: { type: Type.STRING, format: "enum", enum: functionIds },
                proof: { type: Type.STRING },
              },
              required: ["functionId", "proof"],
            },
          },
          stageIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING, format: "enum", enum: stageIds },
          },
        },
        required: ["functions", "stageIds"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    functions?: { functionId: string; proof: string }[];
    stageIds?: string[];
  };

  const functionNameById = new Map(masters.functions.map((f) => [f.id, f.name]));

  const result: ExtractedExpertTags = {
    functions: (parsed.functions || [])
      .filter((f) => functionNameById.has(f.functionId))
      .map((f) => ({
        functionId: f.functionId,
        functionName: functionNameById.get(f.functionId)!,
        proof: f.proof,
      })),
    stageIds: (parsed.stageIds || []).filter((id) => stageIds.includes(id)),
  };

  return { result, usage: readUsage(response) };
}

export type ClassifiedProblem = {
  functionId: string;
  functionName: string;
  confidence: number;
};

export async function classifyFounderProblem(
  input: { problem: string; companyStageName?: string },
  masters: { functions: MasterOption[] }
): Promise<{ result: ClassifiedProblem; usage: LlmUsage }> {
  const ai = getClient();
  const functionIds = masters.functions.map((f) => f.id);
  const functionList = masters.functions.map((f) => `- ${f.id}: ${f.name}`).join("\n");

  const prompt = `A startup founder described a problem. Classify it into exactly one of these FUNCTIONS — the kind of help they need, not a summary of the problem. Only use an id from the list.

Available functions:
${functionList}

Founder's company stage: ${input.companyStageName || "unknown"}
Founder's problem: "${input.problem}"`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          functionId: { type: Type.STRING, format: "enum", enum: functionIds },
          confidence: { type: Type.NUMBER },
        },
        required: ["functionId", "confidence"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    functionId?: string;
    confidence?: number;
  };
  const functionNameById = new Map(masters.functions.map((f) => [f.id, f.name]));

  if (!parsed.functionId || !functionNameById.has(parsed.functionId)) {
    throw new Error("Model returned an unrecognized function id.");
  }

  const result: ClassifiedProblem = {
    functionId: parsed.functionId,
    functionName: functionNameById.get(parsed.functionId)!,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };

  return { result, usage: readUsage(response) };
}

export async function recordLlmUsage(
  purpose: "extract_expert_tags" | "classify_founder_problem",
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
