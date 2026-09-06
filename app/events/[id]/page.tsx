import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchEventOrThrow } from "@/lib/api/events";
import { fetchReference } from "@/lib/api/reference";
import { entryState, formatWhen, groupLabel, groupTone } from "@/lib/events";
import { EventBanner, DateTile } from "@/components/events/EventVisuals";
import CategoryTable from "@/components/events/CategoryTable";
import EntryPanel from "@/components/events/EntryPanel";

type Props = { params: Promise<{ id: string }> };

/**
 * One event, as a poster.
 *
 * The banner comes first and fills the width, the date and the venue sit on
 * it, and the entry stub rides alongside on a wide screen and underneath on a
 * phone. That ordering is the whole design brief: a family decides on the
 * picture, the day and the price, in that order, and the prose about the
 * format is what they read after they have decided to care.
 *
 * A draft is a 404 here, because the API refuses to confirm one exists to
 * anybody but its owner — the owner previews from their own edit screen.
 */
export default async function EventPage({ params }: Props) {
  const { id } = await params;

  const event = await fetchEventOrThrow(id).catch(() => {
    // Unreachable is not the same as absent, and pretending otherwise would
    // tell a parent their tournament had been deleted.
    throw new Error("Couldn't load this event.");
  });

  if (!event) notFound();

  const reference = await fetchReference();
  const service = event.serviceCategoryId
    ? reference.serviceCategories.find((s) => s.id === event.serviceCategoryId)
    : undefined;
  const city = reference.cities.find((c) => c.id === event.cityId);
  const tone = groupTone(service?.group);
  const state = entryState(event);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/events" className="cf-eyebrow text-faint hover:text-muted">
        ← All events
      </Link>

      <article className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative">
          <EventBanner
            bannerUrl={event.bannerUrl}
            title={event.title}
            group={service?.group}
            className="aspect-[21/9] w-full"
          />

          {/* Cancelled is stated over the poster, not below it. Somebody who
              opens this page on the morning of the event must not have to
              read three paragraphs to find out it is off. */}
          {state.kind === "cancelled" && (
            <div className="absolute inset-x-0 top-0 bg-danger-soft/95 px-6 py-3 text-center text-sm font-semibold text-danger">
              This event has been cancelled.
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-6">
            <DateTile iso={event.startsAt} group={service?.group} />
            <div className="min-w-0">
              <p className="cf-eyebrow" style={{ color: tone }}>
                {service?.name || groupLabel(service?.group)}
              </p>
              <h1 className="cf-display mt-1 text-2xl leading-tight text-ink sm:text-3xl">
                {event.title}
              </h1>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-7">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="cf-eyebrow">When</dt>
                <dd className="mt-1 text-sm text-ink">
                  {formatWhen(event.startsAt, event.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="cf-eyebrow">Where</dt>
                <dd className="mt-1 text-sm text-ink">
                  {event.venueName || "Venue to be announced"}
                  {city && <span className="text-muted">, {city.name}</span>}
                </dd>
                {event.venueAddress && (
                  <dd className="mt-1 text-xs leading-relaxed text-faint">{event.venueAddress}</dd>
                )}
              </div>
              {event.ownerName && (
                <div>
                  <dt className="cf-eyebrow">Run by</dt>
                  <dd className="mt-1 text-sm text-ink">{event.ownerName}</dd>
                </div>
              )}
            </dl>

            {event.about && (
              <section>
                <h2 className="cf-eyebrow">About this event</h2>
                {/* whitespace-pre-line, so the paragraphs an organiser typed
                    survive. The field is plain text and is rendered as plain
                    text — nothing here interprets markup from a listing. */}
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {event.about}
                </p>
              </section>
            )}

            <section>
              <h2 className="cf-eyebrow">Categories</h2>
              <div className="mt-3">
                <CategoryTable categories={event.categories} />
              </div>
            </section>
          </div>

          <EntryPanel event={event} />
        </div>
      </article>
    </main>
  );
}
