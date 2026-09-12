import Link from "next/link";
import MyEvents from "@/components/events/MyEvents";
import PlanPanel from "@/components/events/PlanPanel";

type Props = {
  listing: {
    name: string | null;
    officeAddress: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    approved: boolean;
    isSuspended: boolean;
  } | null;
};

/**
 * An event company's dashboard.
 *
 * Deliberately says what is missing rather than filling the space: an
 * unapproved company is told it is waiting, not shown a finished-looking
 * page that does nothing. Events appear as soon as there is a listing to
 * hang them on, because a draft can be written while approval is pending —
 * publishing is the only thing approval gates.
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
              You&apos;re approved, so anything you publish goes live straight away.
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
              <dt className="cf-eyebrow">Office</dt>
              <dd className="mt-1 text-sm text-ink">{listing.officeAddress || "Not set"}</dd>
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

      {/* Only once there is a listing: an event is created against the
          company row, and offering the button first would end in the API
          telling them to go and finish a profile they have not been asked
          for yet. */}
      <PlanPanel />

      {listing && <MyEvents />}
    </main>
  );
}
