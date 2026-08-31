"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";

// Guest browse/search of real providers is Phase 1 step 5 — until that exists
// this page promises only what the product can actually do today.

const VERTICALS = [
  { label: "Sports", tone: "sport", blurb: "Cricket, football, badminton, athletics, martial arts" },
  { label: "Dance", tone: "dance", blurb: "Bharatanatyam, Kathak, Bollywood, hip hop, ballet" },
  { label: "Music", tone: "music", blurb: "Vocals, guitar, tabla, keyboard, sitar, flute" },
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
};

export default function GuestHome() {
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
          <Link href="/signup/seeker" className="cf-btn-primary w-full sm:w-auto">
            I&apos;m looking for classes
          </Link>
          <Link href="/signup/provider" className="cf-btn-ghost w-full sm:w-auto">
            I teach or coach
          </Link>
        </div>

        <p className="mt-5 text-sm text-faint">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-gold hover:text-accent-ink">
            Log in
          </Link>
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-28">
        <p className="cf-eyebrow text-center">What you can find here</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => (
            <div key={v.label} className="cf-card p-6 transition hover:border-faint">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: toneVar[v.tone] }}
                />
                <h2 className="font-display text-base font-bold text-ink">{v.label}</h2>
              </div>
              <p className="mt-2.5 text-sm leading-6 text-muted">{v.blurb}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-faint">
          Browse and search is coming soon — create an account and we&apos;ll get you set up first.
        </p>
      </section>
    </main>
  );
}
