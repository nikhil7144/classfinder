"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// Kept in sync with MODEL_PRICING in lib/gemini.ts — duplicated here (rather
// than imported) so this client page never bundles the server-only Supabase
// admin client that lib/gemini.ts pulls in.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
};

type UsageRow = {
  id: string;
  created_at: string;
  purpose: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  related_id: string | null;
};

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

export default function ApiUsageAdmin() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("llm_usage_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      setRows(data || []);
      setLoading(false);
    };

    load();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalCalls = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let monthCalls = 0;
    let monthTokens = 0;
    let monthCostUsd = 0;

    for (const row of rows) {
      const tokens = row.total_tokens || 0;
      const cost = estimateCostUsd(row.model, row.prompt_tokens || 0, row.completion_tokens || 0);

      totalCalls += 1;
      totalTokens += tokens;
      totalCostUsd += cost;

      if (new Date(row.created_at) >= monthStart) {
        monthCalls += 1;
        monthTokens += tokens;
        monthCostUsd += cost;
      }
    }

    return { totalCalls, totalTokens, totalCostUsd, monthCalls, monthTokens, monthCostUsd };
  }, [rows]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">API Usage</h1>
        <p className="mt-2 text-sm text-gray-500">
          Token usage and rough cost estimate for the Gemini calls behind the coach&apos;s demand
          ranking and the parent&apos;s suggested coaches. Showing the most recent 200 calls.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                This month
              </h2>
              <p className="mt-3 text-3xl font-bold text-gray-900">{stats.monthCalls} calls</p>
              <p className="mt-1 text-sm text-gray-500">
                {stats.monthTokens.toLocaleString()} tokens · ~${stats.monthCostUsd.toFixed(4)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Last 200 calls (all time shown here)
              </h2>
              <p className="mt-3 text-3xl font-bold text-gray-900">{stats.totalCalls} calls</p>
              <p className="mt-1 text-sm text-gray-500">
                {stats.totalTokens.toLocaleString()} tokens · ~${stats.totalCostUsd.toFixed(4)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-8 text-sm text-gray-500">No API calls logged yet.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-3">When</th>
                    <th className="px-6 py-3">Purpose</th>
                    <th className="px-6 py-3">Model</th>
                    <th className="px-6 py-3">Prompt</th>
                    <th className="px-6 py-3">Completion</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-6 py-3 text-gray-500">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-gray-900">{row.purpose}</td>
                      <td className="px-6 py-3 text-gray-500">{row.model}</td>
                      <td className="px-6 py-3 text-gray-500">{row.prompt_tokens ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{row.completion_tokens ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{row.total_tokens ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-500">
                        $
                        {estimateCostUsd(
                          row.model,
                          row.prompt_tokens || 0,
                          row.completion_tokens || 0
                        ).toFixed(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
