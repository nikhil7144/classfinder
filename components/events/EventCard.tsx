import Link from "next/link";
import type { Event } from "@/lib/api/events";
import { entryState, feeFrom, formatWhen, groupLabel, groupTone } from "@/lib/events";
import { EventBanner } from "@/components/events/EventVisuals";

type Props = {
  event: Event;
  /** The taxonomy row, resolved by the page — the DTO carries only an id. */
  serviceName?: string | null;
  serviceGroup?: string | null;
  cityName?: string | null;
};

/**
 * One event in a listing.
 *
 * Poster first, then the date, then the price — the order a parent scanning a
 * page actually reads, and the reason this is a card with an image rather
 * than the row of text every other list in this product uses. A tournament is
 * bought the way a film is, not the way a coach is.
 */
export default function EventCard({ event, serviceName, serviceGroup, cityName }: Props) {
  const tone = groupTone(serviceGroup);
  const state = entryState(event);
  const from = feeFrom(event.categories);

  return (
    <Link
      href={`/events/${event.id}`}
      className="group block overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-gold/50"
    >
      <EventBanner
        bannerUrl={event.bannerUrl}
        title={event.title}
        group={serviceGroup}
        className="aspect-[16/9] w-full"
      />

      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: tone }}
            aria-hidden
          />
          <span className="cf-eyebrow" style={{ color: tone }}>
            {serviceName || groupLabel(serviceGroup)}
          </span>
        </div>

        <h3 className="font-display text-lg font-semibold leading-snug text-ink">{event.title}</h3>

        <p className="text-sm text-muted">{formatWhen(event.startsAt, event.endsAt)}</p>

        <p className="text-sm text-faint">
          {[event.venueName, cityName].filter(Boolean).join(", ") || "Venue to be announced"}
        </p>

        <div className="flex items-center justify-between border-t border-line-soft pt-3">
          <span className="text-sm font-semibold text-ink">{from ?? "Entry details inside"}</span>

          {/* Cancelled is the one state worth shouting on a card. Everything
              else the reader can find on the page they are one tap from. */}
          {state.kind === "cancelled" ? (
            <span className="cf-badge cf-badge-danger">Cancelled</span>
          ) : state.kind === "open" ? (
            <span className="cf-badge cf-badge-ok">Entries open</span>
          ) : state.kind === "not_yet" ? (
            <span className="cf-badge cf-badge-neutral">Opens soon</span>
          ) : state.kind === "closed" ? (
            <span className="cf-badge cf-badge-neutral">Entries closed</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
