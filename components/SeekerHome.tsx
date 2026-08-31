"use client";

import Link from "next/link";

type Props = {
  profileComplete: boolean;
  areaName: string | null;
  areaId: string | null;
  cityName: string | null;
};

export default function SeekerHome({ profileComplete, areaName, areaId, cityName }: Props) {
  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-10">
        <header className="cf-card p-8">
          <p className="cf-eyebrow">Your search</p>
          <h1 className="cf-display mt-3 text-3xl text-ink">
            {areaName ? `Classes in ${areaName}` : "Find a coach, tutor or academy"}
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">
            {areaName
              ? `Search coaches, tutors and centres in ${areaName}${cityName ? `, ${cityName}` : ""} — sorted by how near they are to you.`
              : "Search by area and by what you're looking for, from sports and music to school subjects and exam prep."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={areaId ? `/search?area=${areaId}` : "/search"}
              className="cf-btn-primary"
            >
              {areaName ? `Search ${areaName}` : "Start searching"}
            </Link>
            <Link href="/search" className="cf-btn-ghost">
              Search another area
            </Link>
          </div>

          {!profileComplete && (
            <p className="mt-5 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              You can browse freely.{" "}
              <Link
                href="/complete-profile/seeker"
                className="font-semibold text-gold hover:text-accent-ink"
              >
                Complete your profile
              </Link>{" "}
              when you&apos;re ready to get in touch with someone.
            </p>
          )}
        </header>

        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Coming next</h2>
          <p className="mt-2 text-sm text-muted">
            Not built yet — listed so you know what&apos;s on the way.
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="cf-badge cf-badge-neutral shrink-0">Spaces</span>
              <span className="text-muted">
                Follow a coach or academy and see photos and videos of what they do.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="cf-badge cf-badge-neutral shrink-0">Messages</span>
              <span className="text-muted">Ask questions before you commit.</span>
            </li>
            <li className="flex gap-3">
              <span className="cf-badge cf-badge-neutral shrink-0">Bookings</span>
              <span className="text-muted">Book a trial class.</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
