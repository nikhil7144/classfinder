import Link from "next/link";
import type { Event } from "@/lib/api/events";
import { cancelDeadline, entryState, feeFrom, formatDateTime, isFull } from "@/lib/events";
import { BRAND } from "@/lib/brand";

/**
 * The stub down the side of the poster: what it costs, whether entries are
 * open, and the one action there is.
 *
 * This is the only component that decides what a family may do next, which is
 * why the entry link, the withdrawal deadline and every "not yet / closed /
 * cancelled" sentence live here rather than being repeated down the page.
 */
export default function EntryPanel({ event }: { event: Event }) {
  const state = entryState(event);
  const from = feeFrom(event.categories);
  // The button goes to the first category with room in it. A page with one
  // category — most of them — then needs no second decision from the reader.
  const open = event.categories.find((c) => !isFull(c.capacity, c.entriesCount));

  return (
    <aside className="cf-card space-y-4 p-6">
      <div>
        <p className="cf-eyebrow">Entry</p>
        <p className="mt-2 font-display text-2xl font-bold text-ink">
          {from ?? "Details inside"}
        </p>
        {event.bookingOpensAt && state.kind === "not_yet" && (
          <p className="mt-1 text-xs text-muted">
            Opens {formatDateTime(event.bookingOpensAt)}
          </p>
        )}
      </div>

      {state.kind === "external" && event.externalBookingUrl ? (
        <>
          <a
            href={event.externalBookingUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="cf-btn-primary w-full justify-center"
          >
            Enter on the organiser&apos;s site
          </a>
          <p className="text-xs text-faint">
            This takes you off {BRAND.name}. We don&apos;t see or handle anything you pay there.
          </p>
        </>
      ) : state.kind === "open" ? (
        <>
          {open ? (
            <Link
              href={`/events/${event.id}/enter/${open.id}`}
              className="cf-btn-primary w-full justify-center"
            >
              Enter this event
            </Link>
          ) : (
            <p className="text-sm text-warn">
              Every category is full. The organiser may free a place if somebody withdraws.
            </p>
          )}
          {state.note && <p className="text-xs text-faint">{state.note}</p>}
          <p className="text-xs text-faint">
            You can withdraw until {formatDateTime(cancelDeadline(event))}.
          </p>
        </>
      ) : state.kind === "none" ? (
        <p className="text-sm text-muted">
          This is an announcement — there is nothing to enter here.
        </p>
      ) : (
        <p
          className={`text-sm ${state.kind === "cancelled" ? "text-danger" : "text-muted"}`}
        >
          {state.note}
        </p>
      )}
    </aside>
  );
}
