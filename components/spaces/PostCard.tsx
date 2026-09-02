"use client";

import { useState } from "react";
import {
  REACTIONS,
  REPORT_REASONS,
  Reaction,
  SpacePost,
  postAge,
  reportPost,
  setReaction,
  youTubeEmbed,
  youTubeThumbnail,
} from "@/lib/spaces";

type Props = {
  post: SpacePost;
  /** The owner gets management controls instead of reactions. */
  mine: boolean;
  canReact: boolean;
  onChanged: () => void;
  onDelete?: (postId: string) => void;
};

/**
 * One post, on the coach's own Space and on the public one.
 *
 * Video does not autoplay and does not load an iframe until pressed: a feed
 * that mounts five YouTube players costs the viewer five players' worth of
 * script and hands Google a page view for each. The thumbnail is an image
 * until someone actually wants to watch.
 */
export default function PostCard({ post, mine, canReact, onChanged, onDelete }: Props) {
  const [playing, setPlaying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reported, setReported] = useState(post.i_reported);

  const react = async (value: Reaction) => {
    if (!canReact || busy) return;
    setBusy(true);
    // Pressing the one already chosen clears it — the same button both ways,
    // which is what people expect of a reaction and not of a vote.
    const message = await setReaction(post.id, post.my_reaction === value ? null : value);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onChanged();
  };

  const submitReport = async () => {
    setBusy(true);
    setError("");
    const message = await reportPost(post.id, reason, note);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setReported(true);
    setReporting(false);
    setNote("");
    onChanged();
  };

  const counts: Record<Reaction, number> = {
    like: post.likes,
    wow: post.wows,
    surprise: post.surprises,
  };

  return (
    <article className="cf-card overflow-hidden">
      {post.is_hidden && (
        <div className="border-b border-line bg-danger-soft px-5 py-3 text-sm text-danger">
          <span className="font-semibold">Hidden.</span>{" "}
          {post.hidden_reason || "This post is under review."}{" "}
          {mine && "Only you can see it."}
        </div>
      )}

      {post.kind === "photo" && post.image_url && (
        <img
          src={post.image_url}
          alt={post.body || "Post image"}
          className="max-h-[32rem] w-full bg-surface-2 object-cover"
        />
      )}

      {post.kind === "video" && post.youtube_id && (
        <div className="relative aspect-video w-full bg-surface-2">
          {playing ? (
            <iframe
              src={youTubeEmbed(post.youtube_id)}
              title={post.body || "Video"}
              className="h-full w-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group relative block h-full w-full cursor-pointer"
              aria-label="Play video"
            >
              <img
                src={youTubeThumbnail(post.youtube_id)}
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/20">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-2xl text-white">
                  ▶
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      <div className="p-5">
        {post.body && <p className="leading-relaxed whitespace-pre-wrap text-ink">{post.body}</p>}

        <p className="mt-3 font-mono text-xs text-faint">{postAge(post.created_at)}</p>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          {REACTIONS.map((r) => {
            const chosen = post.my_reaction === r.value;
            const count = counts[r.value];
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => react(r.value)}
                disabled={!canReact || busy}
                title={canReact ? r.label : "Log in to react"}
                className="cf-pill px-3 py-1.5 text-sm disabled:cursor-default disabled:opacity-70"
                data-selected={chosen}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="ml-1.5 font-mono text-xs">{count}</span>
                <span className="sr-only">
                  {r.label}, {count}
                </span>
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            {mine && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(post.id)}
                className="text-xs text-faint transition hover:text-danger"
              >
                Delete
              </button>
            )}

            {/* A coach cannot report their own post, and nobody reports twice. */}
            {!mine &&
              (reported ? (
                <span className="text-xs text-faint">Reported</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setReporting((open) => !open)}
                  className="text-xs text-faint transition hover:text-muted"
                >
                  Report
                </button>
              ))}
          </div>
        </div>

        {reporting && !reported && (
          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
            <label className="mb-2 block text-sm text-muted">What&apos;s wrong with this?</label>
            <select
              className="cf-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <textarea
              className="cf-input mt-3 min-h-20"
              placeholder="Anything else we should know? (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submitReport}
                disabled={busy}
                className="cf-btn-primary px-5 py-2 text-sm"
              >
                {busy ? "Sending…" : "Send report"}
              </button>
              <button
                type="button"
                onClick={() => setReporting(false)}
                className="cf-btn-ghost px-5 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs text-faint">
              The coach is never told who reported them.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
