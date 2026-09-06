import type { Event } from "@/lib/api/events";
import { entryState, feeFrom, formatDateTime } from "@/lib/events";

/**
 * The stub down the side of the poster: what it costs, whether entries are
 * open, and the one action there is.
 *
 * This is the only component that decides what a family may do next, which is
 * deliberate — when 3K lands, the platform branch below stops being a
 * disabled button and becomes a link to the entry form, and nothing else on
 * the page has to be found and changed.
 */
export default function EntryPanel({ event }: { event: Event }) {
  const state = entryState(event);
  const from = feeFrom(event.categories);

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
            This takes you off ClassFinder. We don&apos;t see or handle anything you pay there.
          </p>
        </>
      ) : state.kind === "open" ? (
        <>
          {/* 3K replaces this with a link to /events/[id]/enter/[categoryId].
              Until then it says so plainly: an "Enter" button that does
              nothing teaches a parent that this product does not work, which
              is more expensive than an honest sentence. */}
          <button type="button" className="cf-btn-primary w-full justify-center" disabled>
            Entering online — coming shortly
          </button>
          <p className="text-xs text-muted">
            Online entry is being built. Contact the organiser to register in the meantime.
          </p>
          {state.note && <p className="text-xs text-faint">{state.note}</p>}
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
