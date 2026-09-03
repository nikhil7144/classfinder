"use client";

import Link from "next/link";
import FeedItem from "@/components/spaces/FeedItem";
import { BRAND } from "@/lib/brand";
import type { City, FeedPost } from "@/lib/api/client";

type Props = {
  /** Cities with a live area and at least one approved coach in it. */
  cities: City[];
  selectedCity: City | null;
  posts: FeedPost[];
};

const VERTICALS = [
  { label: "Sports", tone: "sport", blurb: "Cricket, football, badminton, athletics, martial arts" },
  { label: "Dance", tone: "dance", blurb: "Bharatanatyam, Kathak, Bollywood, hip hop, ballet" },
  { label: "Music", tone: "music", blurb: "Vocals, guitar, tabla, keyboard, sitar, flute" },
  { label: "Acting & Theatre", tone: "acting", blurb: "Acting, drama, public speaking, anchoring" },
  { label: "School Subjects", tone: "subject", blurb: "Maths, science, languages, commerce" },
  { label: "Boards & Exams", tone: "exam", blurb: "CBSE, ICSE, IB, JEE, NEET, UPSC" },
  { label: "Mind & Indoor Games", tone: "mind", blurb: "Chess, abacus, vedic maths, carrom" },
];

const toneVar: Record<string, string> = {
  sport: "var(--sport)",
  dance: "var(--dance)",
  music: "var(--music)",
  subject: "var(--subject)",
  exam: "var(--exam)",
  mind: "var(--mind)",
  acting: "var(--acting)",
};

export default function GuestHome({ cities, selectedCity, posts }: Props) {
  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
        <p className="cf-eyebrow">{BRAND.name}</p>

        <h1 className="cf-display mx-auto mt-5 max-w-3xl text-[clamp(2.3rem,5.5vw,3.6rem)] leading-[1.08] text-ink">
          Find the right coach, tutor or academy{" "}
          <span
            style={{
              background: "linear-gradient(100deg, var(--grad-1), var(--grad-2))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            near you
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
          {BRAND.tagline}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/search" className="cf-btn-primary w-full sm:w-auto">
            Find classes near me
          </Link>
          <Link href="/signup/provider" className="cf-btn-ghost w-full sm:w-auto">
            I teach or coach
          </Link>
        </div>

        <p className="mt-5 text-sm text-faint">
          Browse freely — you only need an account to get in touch.{" "}
          <Link href="/login" className="font-semibold text-gold hover:text-accent-ink">
            Log in
          </Link>
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-28">
        <p className="cf-eyebrow text-center">What you can find here</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => (
            <Link key={v.label} href="/search" className="cf-card block p-6 transition hover:border-faint">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: toneVar[v.tone] }}
                />
                <h2 className="font-display text-base font-bold text-ink">{v.label}</h2>
              </div>
              <p className="mt-2.5 text-sm leading-6 text-muted">{v.blurb}</p>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-faint">
          We open area by area — search yours to see who&apos;s teaching there now.
        </p>
      </section>

      {/* What coaches here are actually doing.
          
          The section above says what the product covers; this says who is on
          it. A signed-out visitor can read all of it and react to none of it —
          reactions, following and reporting each need an account, which is the
          same line every other consent rule in this product draws. */}
      {selectedCity && posts.length > 0 && (
        <section className="mx-auto max-w-2xl px-6 pb-28">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="cf-eyebrow">Lately on ClassFinder</p>
              <h2 className="cf-display mt-2 text-2xl text-ink">
                From coaches in {selectedCity.name}
              </h2>
            </div>

            {/* Links, not a dropdown: each city is a real URL that renders its
                own posts on the server, which is what makes them findable. */}
            {cities.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {cities.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    href={`/?city=${c.id}`}
                    className={`cf-badge ${
                      c.id === selectedCity.id ? "cf-badge-ok" : "cf-badge-neutral"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 space-y-8">
            {posts.map((post) => (
              <FeedItem key={post.id} post={post} canReact={false} onChanged={() => {}} />
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/signup/seeker" className="cf-btn-primary">
              Join to follow and get in touch
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
