"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchTaxonomy } from "@/lib/api/reference";
import {
  TRIAL_DURATIONS,
  Trial,
  ThreadKind,
  defaultTrialSlot,
  subscribeToThreadRows,
  trialIsPast,
  trialPrompt,
  trialWhen,
} from "@/lib/threads";

type Place = { id: string; label: string };

type Props = {
  kind: ThreadKind;
  threadId: string;
  /** Both sides can write here, so a trial can be arranged. */
  open: boolean;
  /** Parents and coaches are asked different questions about the same row. */
  isSeeker: boolean;
  /** For a group, the headcount the parent already stated. */
  defaultStudents?: number;
};

/**
 * The first class, as a thing the product knows about.
 *
 * A chat leaves no trace: the child turns up or doesn't and no row records
 * either. This is the one structured step in the conversation — propose,
 * confirm, and afterwards say whether it happened — and it is what a review
 * will later be allowed to hang on.
 *
 * COLLAPSED BY DEFAULT, and that is the whole layout rule. The first version
 * was a full panel pinned above the messages, which on a phone left about
 * eighty pixels of conversation underneath — the feature sat in the way of the
 * thing it exists to support. It is now a one-line strip: glanceable, carrying
 * the single action that is actually yours to take, expanding only when asked.
 *
 * The expanded body is capped and scrolls itself, so however much it grows the
 * message list keeps its share of the pane. That is the contract the Flutter
 * screen should copy: strips are fixed-height, the message list is the only
 * thing that flexes.
 */
export default function TrialCard({
  kind,
  threadId,
  open,
  isSeeker,
  defaultStudents = 1,
}: Props) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [when, setWhen] = useState(defaultTrialSlot);
  const [duration, setDuration] = useState(60);
  const [place, setPlace] = useState("");
  const [placeNote, setPlaceNote] = useState("");
  const [students, setStudents] = useState(defaultStudents);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("thread_trials", {
      p_kind: kind,
      p_thread_id: threadId,
    });
    setTrials((data as Trial[]) || []);
  }, [kind, threadId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Purely additive. Every mutation below still reloads explicitly, so if the
  // channel never connects this card behaves as it did before realtime.
  useEffect(
    () =>
      subscribeToThreadRows(
        "trial_classes",
        kind === "group" ? "group_request_id" : "enquiry_id",
        threadId,
        load
      ),
    [kind, threadId, load]
  );

  useEffect(() => {
    fetchTaxonomy().then(({ teachingPlaces }) => setPlaces(teachingPlaces));
  }, []);

  // PromiseLike, not Promise: a Supabase builder is a thenable and only
  // becomes a real promise once awaited.
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await load();
    return true;
  };

  const propose = async () => {
    const ok = await run(() =>
      supabase.rpc("propose_trial", {
        p_kind: kind,
        p_thread_id: threadId,
        p_scheduled_at: new Date(when).toISOString(),
        p_duration_minutes: duration,
        p_place: place || null,
        p_place_note: placeNote.trim() || null,
        p_student_count: students,
      })
    );
    if (ok) {
      setProposing(false);
      setPlaceNote("");
    }
  };

  const respond = (id: string, status: "confirmed" | "declined") =>
    run(() => supabase.rpc("respond_to_trial", { p_trial_id: id, p_status: status }));

  const cancel = (id: string) => run(() => supabase.rpc("cancel_trial", { p_trial_id: id }));

  const markOutcome = (id: string, outcome: "happened" | "no_show") =>
    run(() => supabase.rpc("mark_trial_outcome", { p_trial_id: id, p_outcome: outcome }));

  const live = trials.find((t) => t.status === "proposed" || t.status === "confirmed") ?? null;
  const past = trials.filter((t) => t !== live);

  if (!open && trials.length === 0) return null;

  // The one thing this person can do right now, promoted onto the strip so the
  // commonest action — "yes, that time works" — costs no taps to reach.
  const inlineAction = (() => {
    if (!live) return null;
    if (live.status === "proposed" && !live.i_proposed) {
      return { label: "Confirm", act: () => respond(live.id, "confirmed") };
    }
    if (live.status === "confirmed" && trialIsPast(live) && !live.my_outcome) {
      return { label: "It went ahead", act: () => markOutcome(live.id, "happened") };
    }
    return null;
  })();

  const summary = live
    ? `${trialWhen(live.scheduled_at)}${
        live.student_count > 1 ? ` · ${live.student_count} students` : ""
      }`
    : past.length > 0
      ? "None arranged"
      : "Not arranged yet";

  return (
    <div className="relative shrink-0 border-b border-line bg-surface-2">
      {/* The strip. One row, this height, whatever the trial is doing. */}
      <div className="flex items-center gap-3 px-5 py-2.5">
        <span className="cf-eyebrow shrink-0">First class</span>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="truncate text-xs text-muted">{summary}</span>
          {live && (
            <span
              className={`cf-badge shrink-0 ${
                live.status === "confirmed" ? "cf-badge-ok" : "cf-badge-warn"
              }`}
            >
              {live.status === "confirmed" ? "Confirmed" : "Proposed"}
            </span>
          )}
          <span className="shrink-0 text-xs text-faint">{expanded ? "▴" : "▾"}</span>
        </button>

        {inlineAction ? (
          <button
            onClick={inlineAction.act}
            disabled={busy}
            className="cf-btn-primary shrink-0 px-3 py-1.5 text-xs"
          >
            {inlineAction.label}
          </button>
        ) : (
          open &&
          !live &&
          !proposing && (
            <button
              onClick={() => {
                setProposing(true);
                setExpanded(true);
              }}
              className="cf-btn-ghost shrink-0 px-3 py-1.5 text-xs"
            >
              Arrange
            </button>
          )
        )}
      </div>

      {/* Overlays the conversation rather than pushing it. Expanding in place
          would take its height from the message list, which is the one region
          that must not shrink — and the propose form is tall enough to leave
          nothing behind it. Dropping over the top costs the messages nothing,
          keeps the header and composer where they were, and is the same
          gesture a bottom sheet makes on mobile.

          The pane clips it, and it scrolls itself, so it cannot escape. */}
      {(expanded || proposing) && (
        <div className="absolute inset-x-0 top-full z-20 max-h-[22rem] overflow-y-auto border-b border-line bg-surface-2 px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          {live && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="font-semibold text-ink">{trialWhen(live.scheduled_at)}</p>
              <p className="mt-1 text-xs text-muted">
                {TRIAL_DURATIONS.find((d) => d.minutes === live.duration_minutes)?.label ??
                  `${live.duration_minutes} min`}
                {live.place_label && ` · ${live.place_label}`}
                {live.student_count > 1 && ` · ${live.student_count} students`}
              </p>
              {live.place_note && <p className="mt-1 text-xs text-muted">{live.place_note}</p>}

              <p className="mt-3 text-sm text-ink">{trialPrompt(live)}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {live.status === "proposed" && !live.i_proposed && (
                  <button
                    onClick={() => respond(live.id, "declined")}
                    disabled={busy}
                    className="cf-btn-ghost px-4 py-1.5 text-xs"
                  >
                    Doesn&apos;t work
                  </button>
                )}

                {live.status === "confirmed" && trialIsPast(live) && !live.my_outcome && (
                  <button
                    onClick={() => markOutcome(live.id, "no_show")}
                    disabled={busy}
                    className="cf-btn-ghost px-4 py-1.5 text-xs"
                  >
                    It didn&apos;t happen
                  </button>
                )}

                {((live.status === "proposed" && live.i_proposed) ||
                  (live.status === "confirmed" && !trialIsPast(live))) && (
                  <button
                    onClick={() => cancel(live.id)}
                    disabled={busy}
                    className="cf-btn-ghost px-4 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {!live && !proposing && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-xs leading-relaxed text-faint">
                {open
                  ? isSeeker
                    ? "When you've agreed a day and time, put it here so you both have it in writing."
                    : "Propose a day, time and place. The parent confirms, and it becomes part of your record."
                  : "No first class was arranged here."}
              </p>
              {open && (
                <button
                  onClick={() => setProposing(true)}
                  className="cf-btn-ghost px-4 py-1.5 text-xs"
                >
                  Arrange one
                </button>
              )}
            </div>
          )}

          {proposing && (
            <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm text-muted">Day and time</span>
                  <input
                    type="datetime-local"
                    className="cf-input"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-muted">How long</span>
                  <select
                    className="cf-input"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  >
                    {TRIAL_DURATIONS.map((d) => (
                      <option key={d.minutes} value={d.minutes}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm text-muted">Where</span>
                  <select
                    className="cf-input"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                  >
                    <option value="">Not decided yet</option>
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-muted">How many students</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="cf-input"
                    value={students}
                    onChange={(e) => setStudents(Number(e.target.value))}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm text-muted">Address or landmark</span>
                <input
                  className="cf-input"
                  placeholder="Gate 3, Sunrise Society club house"
                  value={placeNote}
                  onChange={(e) => setPlaceNote(e.target.value)}
                  maxLength={300}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={propose}
                  disabled={busy || !when}
                  className="cf-btn-primary px-4 py-1.5 text-xs"
                >
                  {busy ? "Sending…" : "Propose this"}
                </button>
                <button
                  onClick={() => {
                    setProposing(false);
                    setError("");
                  }}
                  className="cf-btn-ghost px-4 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {past.length > 0 && (
            <ul className="mt-3 space-y-1">
              {past.map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-2 text-xs text-faint">
                  <span className="font-mono">{trialWhen(t.scheduled_at)}</span>
                  <span>
                    {t.seeker_outcome === "happened"
                      ? "went ahead"
                      : t.seeker_outcome === "no_show"
                        ? "didn't happen"
                        : t.status === "declined"
                          ? "declined"
                          : t.status === "cancelled"
                            ? "cancelled"
                            : "unrecorded"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="px-5 pb-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
