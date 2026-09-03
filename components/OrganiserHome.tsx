import Link from "next/link";

type Props = {
  listing: {
    name: string | null;
    venueName: string | null;
    areaName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    approved: boolean;
    isSuspended: boolean;
  } | null;
};

/**
 * An event company's dashboard, before there are events to put on it.
 *
 * Deliberately says what is missing rather than filling the space. An
 * organiser who signs up today can be reviewed and approved, and then has to
 * wait — telling them that plainly is better than a dashboard that looks
 * finished and does nothing.
 */
export default function OrganiserHome({ listing }: Props) {
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-10">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Your company</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">{listing?.name || "Your company"}</h1>

        {!listing ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You haven&apos;t told us about your company yet. It takes a minute, and an admin
              reviews it before your events can go live.
            </p>
            <Link href="/complete-profile/organiser" className="cf-btn-primary mt-6">
              Set up your company
            </Link>
          </>
        ) : listing.isSuspended ? (
          <>
            <span className="cf-badge cf-badge-warn mt-3 inline-block">Suspended</span>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your listing has been taken down. Get in touch if you think that&apos;s wrong.
            </p>
          </>
        ) : listing.approved ? (
          <>
            <span className="cf-badge cf-badge-ok mt-3 inline-block">Approved</span>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You&apos;re approved. Events are the next thing being built — you&apos;ll be able to
              create one from here.
            </p>
          </>
        ) : (
          <>
            <span className="cf-badge cf-badge-neutral mt-3 inline-block">Waiting for review</span>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              An admin is reviewing your company. You can keep editing it in the meantime.
            </p>
          </>
        )}
      </header>

      {listing && (
        <section className="cf-card p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="cf-display text-lg text-ink">At a glance</h2>
            <Link href="/account/profile" className="cf-btn-ghost">
              Edit
            </Link>
          </div>

          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="cf-eyebrow">Venue</dt>
              <dd className="mt-1 text-sm text-ink">{listing.venueName || "Not set"}</dd>
            </div>
            <div>
              <dt className="cf-eyebrow">Area</dt>
              <dd className="mt-1 text-sm text-ink">{listing.areaName || "Not set"}</dd>
            </div>
            <div>
              <dt className="cf-eyebrow">Email</dt>
              <dd className="mt-1 text-sm text-ink">{listing.contactEmail || "Not set"}</dd>
            </div>
            <div>
              <dt className="cf-eyebrow">Phone</dt>
              <dd className="mt-1 text-sm text-ink">{listing.contactPhone || "Not set"}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">Coming next</h2>
        <p className="mt-2 text-sm text-muted">
          Not built yet — listed so you know what&apos;s on the way.
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="cf-badge cf-badge-neutral shrink-0">Events</span>
            <span className="text-muted">
              Create a tournament, competition or showcase, with dates, a venue and an entry fee.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="cf-badge cf-badge-neutral shrink-0">Entries</span>
            <span className="text-muted">
              Individuals or teams register, and you see who is coming.
            </span>
          </li>
        </ul>
      </section>
    </main>
  );
}
