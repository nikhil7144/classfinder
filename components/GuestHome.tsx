"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";

// Placeholder landing page. Guest browse/search of real providers is Phase 1
// step 5 — until that exists this page deliberately promises only what the
// product can actually do today: sign up as a seeker or list as a provider.

const VERTICALS = [
  { label: "Sports", blurb: "Cricket, football, badminton, athletics and more" },
  { label: "Dance", blurb: "Bharatanatyam, Kathak, Bollywood, hip hop" },
  { label: "Music", blurb: "Vocals, guitar, tabla, keyboard, sitar" },
  { label: "School Subjects", blurb: "Maths, science, languages, commerce" },
  { label: "Boards & Exams", blurb: "CBSE, ICSE, JEE, NEET, UPSC" },
  { label: "Mind & Indoor Games", blurb: "Chess, abacus, carrom, snooker" },
];

export default function GuestHome() {
  return (
    <main className="min-h-screen bg-gray-50">
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
          {BRAND.name}
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Find the right coach, tutor or academy near you
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">
          {BRAND.tagline}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup/seeker"
            className="w-full rounded-full bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:w-auto"
          >
            I&apos;m looking for classes
          </Link>
          <Link
            href="/signup/provider"
            className="w-full rounded-full border border-gray-300 bg-white px-7 py-3.5 text-sm font-semibold text-gray-700 transition hover:border-indigo-300 sm:w-auto"
          >
            I teach or coach
          </Link>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Log in
          </Link>
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
          What you can find here
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => (
            <div key={v.label} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">{v.label}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{v.blurb}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Browse and search is coming soon — create an account and we&apos;ll get you set up first.
        </p>
      </section>
    </main>
  );
}
