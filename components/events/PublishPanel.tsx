"use client";

import Link from "next/link";
import { useState } from "react";
import type { Event } from "@/lib/api/events";
import { setEventStatus } from "@/lib/api/my-events";
import { EVENT_STATUS_BADGE, formatWhen } from "@/lib/events";

/**
 * Publishing, withdrawing and closing — the acts that are not editing.
 *
 * Separate from the form on purpose. 3J treats publishing as its own move
 * with its own condition (an approved, unsuspended owner), and a Save button
 * that also published would make an approval failure look like a failure to
 * save a title.
 *
 * Nothing here decides whether the caller may publish. The row policy does,
 * the service turns its refusal into a sentence about approval, and this
 * shows that sentence.
 */
export default function PublishPanel({
  event,
  onChanged,
}: {
  event: Event;
  onChanged?: (event: Event) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const badge = EVENT_STATUS_BADGE[event.status] ?? EVENT_STATUS_BADGE.draft;
  const noCategories = event.bookingMode === "platform" && event.categories.length === 0;

  const change = async (status: "draft" | "published" | "cancelled" | "completed") => {
    if (busy) return;
    setError("");
    setBusy(status);
    const result = await setEventStatus(event.id, status);
    setBusy("");

    if (result.error || !result.event) {
      setError(result.error ?? "Couldn't change that.");
      return;
    }
    onChanged?.(result.event);
  };

  return (
    <aside className="cf-card space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="cf-eyebrow">Status</p>
        <span className={`cf-badge ${badge.className}`}>{badge.label}</span>
      </div>

      <p className="text-sm text-muted">{formatWhen(event.startsAt, event.endsAt)}</p>

      {event.status === "draft" && (
        <>
          {noCategories && (
            <p className="text-xs leading-relaxed text-warn">
              Entries are set to be taken here, but there is nothing to enter yet. Add at least one
              category first.
            </p>
          )}
          <button
            type="button"
            className="cf-btn-primary w-full justify-center"
            onClick={() => change("published")}
            disabled={busy !== "" || noCategories}
          >
            {busy === "published" ? "Publishing…" : "Publish"}
          </button>
          <p className="text-xs text-faint">
            Your company has to be approved before an event can go live.
          </p>
        </>
      )}

      {event.status === "published" && (
        <>
          <Link href={`/events/${event.id}`} className="cf-btn-ghost w-full justify-center">
            View the public page
          </Link>
          <button
            type="button"
            className="cf-btn-ghost w-full justify-center text-danger"
            onClick={() => change("cancelled")}
            disabled={busy !== ""}
          >
            {busy === "cancelled" ? "Cancelling…" : "Cancel this event"}
          </button>
          <button
            type="button"
            className="cf-btn-ghost w-full justify-center"
            onClick={() => change("completed")}
            disabled={busy !== ""}
          >
            Mark as finished
          </button>
          {/* Withdrawing to draft is not offered. Once 3K exists it will be
              refused outright for an event with entries — an event that
              disappears takes its entrants' own record with it — and offering
              it now would teach a habit that stops working. */}
          <p className="text-xs leading-relaxed text-faint">
            Cancelling keeps the page up and marks it cancelled, so anyone who was coming finds out.
          </p>
        </>
      )}

      {event.status === "cancelled" && (
        <p className="text-sm text-muted">
          This event is cancelled and its page says so. Publish a new one if it is rescheduled — a
          date that moves twice is easier to follow as two events than as one that keeps changing.
        </p>
      )}

      {event.status === "completed" && (
        <p className="text-sm text-muted">Finished. It stays readable for everyone who came.</p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </aside>
  );
}
