"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMyEvents } from "@/lib/api/my-events";
import type { Event } from "@/lib/api/events";
import { EVENT_STATUS_BADGE, formatWhen } from "@/lib/events";
import { DateTile } from "@/components/events/EventVisuals";

/**
 * The owner's events on their dashboard.
 *
 * Drafts first, because a draft is the one state that needs somebody to do
 * something about it, and an organiser who publishes nothing has an empty
 * public page and no idea why.
 *
 * A client component inside a server dashboard: `/events/mine` needs the
 * caller's token, and reading the same rows with the service role on the
 * server would be the second door this product spent 3B closing.
 */
export default function MyEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchMyEvents().then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setEvents(r.events);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const now = new Date();
  const drafts = events.filter((e) => e.status === "draft");
  const live = events.filter(
    (e) => e.status === "published" && new Date(e.startsAt) >= now,
  );
  const past = events.filter(
    (e) =>
      e.status === "completed" ||
      e.status === "cancelled" ||
      (e.status === "published" && new Date(e.startsAt) < now),
  );

  const section = (title: string, list: Event[]) =>
    list.length === 0 ? null : (
      <div key={title}>
        <p className="cf-eyebrow">{title}</p>
        <ul className="mt-3 space-y-2">
          {list.map((e) => {
            const badge = EVENT_STATUS_BADGE[e.status] ?? EVENT_STATUS_BADGE.draft;
            return (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}/edit`}
                  className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-3 transition hover:border-gold/50"
                >
                  <DateTile iso={e.startsAt} />
                  <div className="min-w-0 grow">
                    <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                    <p className="truncate text-xs text-muted">
                      {formatWhen(e.startsAt, e.endsAt)}
                    </p>
                  </div>
                  <span className={`cf-badge ${badge.className} shrink-0`}>{badge.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <section className="cf-card space-y-5 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="cf-eyebrow">Your events</p>
          <h2 className="cf-display mt-2 text-xl text-ink">Tournaments and workshops</h2>
        </div>
        <Link href="/events/new" className="cf-btn-primary">
          Create an event
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-warn">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Nothing yet. An event is a draft until you publish it, so there is no harm in starting
          one and coming back to it.
        </p>
      ) : (
        <div className="space-y-5">
          {section("Drafts", drafts)}
          {section("Live", live)}
          {section("Past", past)}
        </div>
      )}
    </section>
  );
}
