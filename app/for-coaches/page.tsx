import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * The provider pitch, for someone who has not signed up.
 *
 * Linked from the footer everywhere and from the navbar when signed out. The
 * landing page gives coaches four cards; this is the page those cards point
 * at when somebody wants the whole picture before creating an account.
 */

export const metadata: Metadata = {
  title: `For coaches — ${BRAND.name}`,
  description:
    "List your classes on Aspire91. See parents near you who have already said what they want, run your own Space, and organise events.",
};

const FEATURES = [
  {
    title: "Families looking for you",
    body: "Parents near you who have already said what they want, and where they are. You reply once, in one place.",
  },
  {
    title: "Groups of neighbours",
    body: "Two or more families who want the same class, together. One reply reaches all of them.",
  },
  {
    title: "AI suggestions",
    body: "We put the families that fit you best at the top, each with a short reason why.",
  },
  {
    title: "Your own Space",
    body: "Post photos, videos and updates. Parents read it while they are deciding.",
  },
  {
    title: "Events",
    body: "Run tournaments, workshops and showcases. Families enter through Aspire91.",
  },
  {
    title: "One inbox",
    body: "Requests, replies and chats in one place. Mark a lead as called back, scheduled or closed.",
  },
];

const STEPS = [
  { title: "Create your listing", body: "Tell us what you teach, the areas you cover and your fees." },
  { title: "We review it", body: "We check every listing before parents see it. Nothing more is needed from you." },
  { title: "Appear in search", body: "Parents searching your areas can find you." },
  { title: "Reply to families", body: "See who is looking, reply once, and carry on in chat." },
];

const BENEFITS = [
  {
    title: "Parents come with details",
    body: "You are not cold-calling. A request already says the subject, the child's age and level, preferred days and times, and a budget.",
  },
  {
    title: "Groups fill your classes",
    body: "Neighbours join together before they contact you, so one reply can fill several places at once.",
  },
  {
    title: "We open area by area",
    body: "Every family you see is near where you teach, because we launch one area at a time rather than everywhere at once.",
  },
];

export default function ForCoachesPage() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
        <p className="cf-eyebrow">For coaches</p>

        <h1 className="cf-display mx-auto mt-5 max-w-3xl text-[clamp(2.1rem,5vw,3.2rem)] leading-[1.1] text-ink">
          Get students near you
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
          {BRAND.name} is where parents in your area say what they are looking for. You see them,
          and you reply.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup/provider" className="cf-btn-primary w-full sm:w-auto">
            List your classes
          </Link>
          <Link href="/search" className="cf-btn-ghost w-full sm:w-auto">
            See the site as a parent
          </Link>
        </div>

        <p className="mt-5 text-sm text-faint">
          We review every listing before parents see it.
        </p>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="cf-eyebrow">What you get</p>
          <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)] text-ink">
            Everything in one account
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="cf-card bg-surface-2 p-6">
                <h3 className="font-display text-base font-bold text-ink">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="cf-eyebrow">How it works</p>
        <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)] text-ink">
          Four steps to your first reply
        </h2>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="cf-card p-6">
              <p className="font-mono text-xs tracking-widest text-faint">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 font-display text-base font-bold text-ink">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="cf-eyebrow">Why coaches use it</p>
          <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.2vw,2.2rem)] text-ink">
            Different from a directory
          </h2>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="cf-card bg-surface-2 p-6">
                <h3 className="font-display text-base font-bold text-ink">{b.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-muted">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="cf-display text-[clamp(1.6rem,3.2vw,2.2rem)] text-ink">
          Ready to list your classes?
        </h2>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted">
          Creating a listing takes a few minutes. You can edit it any time.
        </p>
        <div className="mt-8">
          <Link href="/signup/provider" className="cf-btn-primary">
            List your classes
          </Link>
        </div>
      </section>
    </main>
  );
}
