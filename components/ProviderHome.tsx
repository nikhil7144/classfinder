"use client";

import Link from "next/link";
import { formatFees } from "@/lib/search";
import ProviderTabs from "@/components/provider/ProviderTabs";
import { useAlerts } from "@/components/AlertsBadge";

export type ProviderSummary = {
  id: string;
  display_name: string | null;
  provider_type: string;
  approved: boolean;
  is_suspended: boolean;
  is_featured: boolean;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  photo_url: string | null;
  categoryName?: string | null;
  serviceCount: number;
  areaNames: string[];
  branchCount: number;
  availabilityCount: number;
};

type Props = {
  profileComplete: boolean;
  provider: ProviderSummary | null;
};

/** Where the listing stands, in the provider's own terms. */
function listingState(profileComplete: boolean, p: ProviderSummary | null) {
  if (!p || !profileComplete) {
    return {
      badge: { text: "Not finished", tone: "cf-badge-warn" },
      heading: "Finish setting up your listing",
      body: "Parents can't find you until your profile is complete. It takes a few minutes.",
      cta: { href: "/complete-profile/provider", label: "Finish my listing" },
    };
  }
  if (p.is_suspended) {
    return {
      badge: { text: "Suspended", tone: "cf-badge-danger" },
      heading: "Your listing is suspended",
      body: "It isn't visible to parents right now. Get in touch if you think this is a mistake.",
      cta: null,
    };
  }
  if (!p.approved) {
    return {
      badge: { text: "In review", tone: "cf-badge-warn" },
      heading: "Your listing is being reviewed",
      body:
        "We check every listing before parents see it. You'll appear in search as soon as it's approved — nothing more is needed from you.",
      cta: { href: "/complete-profile/provider", label: "Edit my listing" },
    };
  }
  return {
    badge: { text: "Live", tone: "cf-badge-ok" },
    heading: "Your listing is live",
    body: "Parents searching your areas can find you now.",
    cta: { href: `/provider/${p.id}`, label: "View it as parents see it" },
  };
}

export default function ProviderHome({ profileComplete, provider }: Props) {
  const alerts = useAlerts();
  const accepted = Number(alerts?.accepted_pitches || 0);
  const state = listingState(profileComplete, provider);
  const fees = provider ? formatFees(provider.fee_min, provider.fee_max, provider.fee_period) : null;
  const isInstitution = provider?.provider_type === "institution";

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-10">
        <ProviderTabs messageCount={Number(alerts?.unread_threads || 0)} />

        <header className="cf-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="cf-eyebrow">Your listing</p>
                <span className={`cf-badge ${state.badge.tone}`}>{state.badge.text}</span>
                {provider?.is_featured && <span className="cf-badge cf-badge-warn">Featured</span>}
              </div>
              <h1 className="cf-display mt-3 text-3xl text-ink">{state.heading}</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted">{state.body}</p>
            </div>

            {provider?.photo_url && (
              <img
                src={provider.photo_url}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl border border-line object-cover"
              />
            )}
          </div>

          {state.cta && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={state.cta.href} className="cf-btn-primary">
                {state.cta.label}
              </Link>
              {profileComplete && provider?.approved && !provider.is_suspended && (
                <Link href="/complete-profile/provider" className="cf-btn-ghost">
                  Edit listing
                </Link>
              )}
            </div>
          )}
        </header>

        {provider && profileComplete && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">At a glance</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="cf-eyebrow">Teaches</dt>
                <dd className="mt-1.5 text-2xl font-semibold text-ink">{provider.serviceCount}</dd>
                <dd className="text-xs text-faint">subjects or activities</dd>
              </div>
              <div>
                <dt className="cf-eyebrow">{isInstitution ? "Branches" : "Areas"}</dt>
                <dd className="mt-1.5 text-2xl font-semibold text-ink">
                  {isInstitution ? provider.branchCount : provider.areaNames.length}
                </dd>
                <dd className="truncate text-xs text-faint">
                  {isInstitution ? "locations" : provider.areaNames.slice(0, 2).join(", ") || "none yet"}
                </dd>
              </div>
              <div>
                <dt className="cf-eyebrow">Availability</dt>
                <dd className="mt-1.5 text-2xl font-semibold text-ink">{provider.availabilityCount}</dd>
                <dd className="text-xs text-faint">time slots listed</dd>
              </div>
              <div>
                <dt className="cf-eyebrow">Fees</dt>
                <dd className="mt-1.5 text-lg font-semibold text-ink">{fees || "Not shown"}</dd>
                <dd className="text-xs text-faint">
                  {fees ? "visible to parents" : "listings with fees get more enquiries"}
                </dd>
              </div>
            </dl>

            {provider.availabilityCount === 0 && (
              <p className="mt-6 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
                You haven&apos;t listed when you&apos;re available.{" "}
                <Link href="/complete-profile/provider" className="font-semibold text-gold hover:text-accent-ink">
                  Add your timings
                </Link>{" "}
                so parents know when they can reach you.
              </p>
            )}
          </section>
        )}

        {accepted > 0 && (
          <Link
            href="/students"
            className="cf-card flex flex-wrap items-center gap-3 p-5 transition hover:border-faint"
          >
            <span className="cf-badge cf-badge-ok">{accepted}</span>
            <span className="text-sm text-ink">
              {accepted === 1 ? "A group replied" : `${accepted} groups replied`} to you — the
              conversation is open.
            </span>
          </Link>
        )}

        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Families looking for you</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Parents say what they&apos;re looking for — a subject, an age, a level, the days that
            suit them — and neighbours who want the same class post it as a group. You see the
            ones wanting what you teach, where you teach.
          </p>
          <Link href="/students" className="cf-btn-ghost mt-5">
            Find students
          </Link>
        </section>
      </div>
    </main>
  );
}
