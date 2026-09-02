"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AUTOHIDE_AFTER_REPORTS, youTubeThumbnail, youTubeWatch } from "@/lib/spaces";

/**
 * Reported Space posts, one row per post rather than per report.
 *
 * Three people reporting the same post is one decision, not three, and
 * resolve_report closes every open report against a post together for that
 * reason. Anything already hidden got there automatically — the queue's job
 * is to confirm that or undo it, not to be the first line of defence.
 */

type QueueRow = {
  post_id: string;
  space_id: string;
  provider_id: string;
  display_name: string | null;
  kind: string;
  body: string | null;
  image_url: string | null;
  youtube_id: string | null;
  is_hidden: boolean;
  posted_at: string;
  report_count: number;
  reasons: string[];
  latest_report_at: string;
  latest_report_id: string;
};

const REASON_LABEL: Record<string, string> = {
  child_safety: "Unsafe for children",
  inappropriate: "Inappropriate",
  misleading: "Misleading",
  not_theirs: "Not their work",
  spam: "Spam",
  other: "Other",
};

export default function ModerationAdmin() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: queueError } = await supabase.rpc("moderation_queue");
    if (queueError) setError(queueError.message);
    setRows((data as QueueRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (row: QueueRow, action: "actioned" | "dismissed") => {
    setBusy(row.post_id);
    setError("");
    const { error: resolveError } = await supabase.rpc("resolve_report", {
      p_report_id: row.latest_report_id,
      p_action: action,
    });
    setBusy(null);
    if (resolveError) {
      setError(resolveError.message);
      return;
    }
    load();
  };

  const suspendSpace = async (row: QueueRow) => {
    const reason = window.prompt(
      `Suspend ${row.display_name || "this"} Space? It becomes invisible to everyone. Reason shown to the coach:`
    );
    if (reason === null) return;

    setBusy(row.post_id);
    setError("");
    const { error: suspendError } = await supabase.rpc("set_space_suspended", {
      p_space_id: row.space_id,
      p_suspended: true,
      p_reason: reason.trim() || null,
    });
    setBusy(null);
    if (suspendError) {
      setError(suspendError.message);
      return;
    }
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Moderation</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Reported posts from Spaces. A post is hidden automatically once{" "}
          {AUTOHIDE_AFTER_REPORTS} different people report it, so anything marked hidden is
          already off the site — deciding here either confirms that or puts it back.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">
          Nothing reported. This is the state to want.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.post_id} className="rounded-2xl border border-gray-200 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {row.display_name || "Unnamed"}
                    </h2>
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      {row.report_count} {row.report_count === 1 ? "report" : "reports"}
                    </span>
                    {row.is_hidden && (
                      <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Posted {new Date(row.posted_at).toLocaleString()} · last reported{" "}
                    {new Date(row.latest_report_at).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                      >
                        {REASON_LABEL[reason] || reason}
                      </span>
                    ))}
                  </div>
                </div>

                {row.kind === "photo" && row.image_url && (
                  <img
                    src={row.image_url}
                    alt=""
                    className="h-28 w-40 shrink-0 rounded-xl border border-gray-200 object-cover"
                  />
                )}
                {row.kind === "video" && row.youtube_id && (
                  <a
                    href={youTubeWatch(row.youtube_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0"
                  >
                    <img
                      src={youTubeThumbnail(row.youtube_id)}
                      alt=""
                      className="h-28 w-40 rounded-xl border border-gray-200 object-cover"
                    />
                  </a>
                )}
              </div>

              {row.body && (
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  {row.body}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => resolve(row, "actioned")}
                  disabled={busy === row.post_id}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  Remove post
                </button>
                <button
                  type="button"
                  onClick={() => resolve(row, "dismissed")}
                  disabled={busy === row.post_id}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {row.is_hidden ? "Restore — nothing wrong with it" : "Dismiss reports"}
                </button>
                <button
                  type="button"
                  onClick={() => suspendSpace(row)}
                  disabled={busy === row.post_id}
                  className="ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-500 transition hover:text-red-700 disabled:opacity-60"
                >
                  Suspend whole Space
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
