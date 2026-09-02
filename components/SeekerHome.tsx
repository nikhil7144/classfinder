"use client";

import Link from "next/link";
import { useAlerts } from "@/components/AlertsBadge";
import {
  budgetLabel,
  daysLabel,
  learnerLabel,
  levelLabel,
  relationLabel,
  timeLabel,
} from "@/lib/requirements";
import SuggestedCoaches from "@/components/seeker/SuggestedCoaches";

/** What this parent told us they want — see phase2r. */
export type SeekerRequirement = {
  wants: string[];
  openToOffers: boolean;
  relation: string | null;
  learnerAge: number | null;
  level: string | null;
  preferredDays: string[] | null;
  preferredTime: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetPeriod: string | null;
  updatedAt: string | null;
};

type Props = {
  profileComplete: boolean;
  requirement: SeekerRequirement | null;
  areaName: string | null;
  areaId: string | null;
  cityName: string | null;
};

export default function SeekerHome({
  profileComplete,
  requirement,
  areaName,
  areaId,
  cityName,
}: Props) {
  const alerts = useAlerts();
  const pending = Number(alerts?.pending_pitches || 0);
  const approaches = Number(alerts?.pending_approaches || 0);
  const needMembers = Number(alerts?.groups_needing_members || 0);
  const unread = Number(alerts?.unread_threads || 0);

  const published = Boolean(requirement?.wants.length);
  const facts = requirement
    ? ([
        relationLabel(requirement.relation),
        learnerLabel(requirement.learnerAge, requirement.relation),
        levelLabel(requirement.level),
        timeLabel(requirement.preferredTime),
        daysLabel(requirement.preferredDays),
        budgetLabel(requirement.budgetMin, requirement.budgetMax, requirement.budgetPeriod),
      ].filter(Boolean) as string[])
    : [];

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

        {(pending > 0 || approaches > 0 || needMembers > 0 || unread > 0) && (
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
              {approaches > 0 && (
                <Link
                  href="/account/messages"
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-faint"
                >
                  <span className="cf-badge cf-badge-warn">{approaches}</span>
                  <span className="text-sm text-ink">
                    {approaches === 1 ? "A coach" : `${approaches} coaches`} would like to teach
                    your child — read what they said and decide whether to reply.
                  </span>
                </Link>
              )}
              {unread > 0 && (
                <Link
                  href="/account/messages"
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-faint"
                >
                  <span className="cf-badge cf-badge-warn">{unread}</span>
                  <span className="text-sm text-ink">
                    {unread === 1 ? "A conversation has" : "Conversations have"} something new in{" "}
                    {unread === 1 ? "it" : "them"}.
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

        {/* Searching is work, and it is work only the parent can do. Saying
            what they want once turns the same problem around.
            Shown whether or not they have answered, because the two failures
            are equally bad: never learning this is an option, and leaving last
            year's answer standing. A child who wanted cricket in April wants a
            football coach in September, and nothing else on this screen would
            ever have told them the old answer was still the live one. */}
        <section className="cf-card p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="cf-display text-lg text-ink">
              {published ? "What you're looking for" : "Let coaches come to you"}
            </h2>
            {published && (
              <span className={`cf-badge ${requirement!.openToOffers ? "cf-badge-ok" : "cf-badge-neutral"}`}>
                {requirement!.openToOffers ? "Coaches can reach you" : "Search only"}
              </span>
            )}
          </div>

          {published ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {requirement!.wants.map((w) => (
                  <span key={w} className="cf-badge cf-badge-warn">
                    {w}
                  </span>
                ))}
                {facts.map((f) => (
                  <span key={f} className="cf-badge cf-badge-neutral">
                    {f}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                {requirement!.openToOffers
                  ? "Coaches who teach this near you can see it and get in touch — they never see your name or number until you reply."
                  : "Only you can see this. Turn on “Let coaches get in touch” and coaches who teach it near you can write to you."}{" "}
                Changed your mind, or moved on to something else? Update it and the coaches who
                see you change with it.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/account/profile" className="cf-btn-ghost">
                  Update what I&apos;m looking for
                </Link>
                {requirement!.updatedAt && (
                  <span className="text-xs text-faint">
                    Last updated{" "}
                    {new Date(requirement!.updatedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Say what you&apos;re looking for — the subject, the age, the days that suit you —
                and coaches who teach it near you can get in touch. They see the requirement and
                your area, never your name or number, and you decide whether to reply.
              </p>
              <Link href="/account/profile" className="cf-btn-primary mt-5">
                Say what I&apos;m looking for
              </Link>
            </>
          )}
        </section>

        {/* Directly under the requirement, so the requirement visibly earns
            its keep: you said football, here are the football coaches. It is
            also the fastest way to notice the answer has gone stale. */}
        {published && <SuggestedCoaches variant="dashboard" />}

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
