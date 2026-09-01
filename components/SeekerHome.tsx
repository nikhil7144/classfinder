"use client";

import Link from "next/link";
import { useAlerts } from "@/components/AlertsBadge";

type Props = {
  profileComplete: boolean;
  areaName: string | null;
  areaId: string | null;
  cityName: string | null;
};

export default function SeekerHome({ profileComplete, areaName, areaId, cityName }: Props) {
  const alerts = useAlerts();
  const pending = Number(alerts?.pending_pitches || 0);
  const needMembers = Number(alerts?.groups_needing_members || 0);
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

        {(pending > 0 || needMembers > 0) && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Waiting on you</h2>
            <div className="mt-4 space-y-3">
              {pending > 0 && (
                <Link
                  href="/account/groups"
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-faint"
                >
                  <span className="cf-badge cf-badge-warn">{pending}</span>
                  <span className="text-sm text-ink">
                    {pending === 1 ? "A coach has" : "Coaches have"} got in touch about your{" "}
                    {pending === 1 ? "group" : "groups"} — read what they said and decide.
                  </span>
                </Link>
              )}
              {needMembers > 0 && (
                <Link
                  href="/account/groups"
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-faint"
                >
                  <span className="cf-badge cf-badge-neutral">{needMembers}</span>
                  <span className="text-sm text-muted">
                    {needMembers === 1 ? "A group" : "Groups"} you started still{" "}
                    {needMembers === 1 ? "needs" : "need"} more members before coaches can see{" "}
                    {needMembers === 1 ? "it" : "them"}.
                  </span>
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Start a group</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Several children in your society want the same class? Start a group and coaches come to
            you, rather than you searching one by one.
          </p>
          <Link href="/groups/new" className="cf-btn-ghost mt-5">
            Start a group
          </Link>
        </section>

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
