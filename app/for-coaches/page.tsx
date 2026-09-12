import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { fetchAllLocations } from "@/lib/api/reference";

/**
 * The provider pitch, for someone who has not signed up.
 *
 * Linked from the footer everywhere and from the navbar when signed out. No
 * header or footer of its own — layout.tsx already puts the real ones around
 * every page, and a second set here would be two navs on one screen.
 */

const CANONICAL = `${BRAND.siteUrl}/for-coaches`;
const DESCRIPTION =
  "Coaches, tutors and academies: get students near you. Parents in your area say what they " +
  "want — subject, the child's age and level, days and budget — and you reply. Free listing.";

export const metadata: Metadata = {
  title: `${BRAND.name} for Coaches — Get students near you`,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} for Coaches — Get students near you`,
    description: DESCRIPTION,
    url: CANONICAL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} for Coaches — Get students near you`,
    description: DESCRIPTION,
  },
};

/* ---------------------------------------------------------------------
   Content. The FAQ is one array feeding both the visible list and the
   FAQPage structured data, so the two cannot drift apart.
   --------------------------------------------------------------------- */

const POINTS = [
  {
    title: "Requests arrive with the details",
    body:
      "A directory hands a parent your phone number. Aspire91 hands you their requirement first: what they want taught, the learner's age and level, whether they want you at home or at your centre, which days and times suit, and what they expect to pay. You are not cold-calling, and your first message can be about their child.",
    icon: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4v-.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
        <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
      </>
    ),
  },
  {
    title: "Neighbours arrive together",
    body:
      "Parents can form a group before they contact anybody. Two families are enough to start one. They agree what they want between themselves, and it reaches you as a single request with several children behind it — so one reply can fill several places at once.",
    icon: (
      <>
        <circle cx="8" cy="9" r="2.6" />
        <circle cx="16" cy="9" r="2.6" />
        <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
        <path d="M11.5 19a4.5 4.5 0 0 1 9 0" />
      </>
    ),
  },
  {
    title: "We open one area at a time",
    body:
      "Rather than launching a whole city thinly, we open area by area. Every family you see is genuinely near where you teach, which is the difference between a lead and a student who can actually get to the class.",
    icon: (
      <>
        <path d="M12 21c4-4.5 6.5-7.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 13.4 8 16.5 12 21z" />
        <circle cx="12" cy="10.3" r="2.3" />
      </>
    ),
  },
];

const FEATURES = [
  {
    title: "Families looking for you",
    body: "Parents and groups near you who have already said what they want. You reply once, in one place.",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 6.2a3 3 0 0 1 0 5.6" />
        <path d="M18 13.6a5.5 5.5 0 0 1 3 5" />
      </>
    ),
  },
  {
    title: "AI suggestions",
    body: "We move the families that fit you best to the top, each with a short reason why. Your areas and subjects decide who you can see; the ranking only orders them.",
    icon: (
      <>
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        <path d="M18 14l.7 1.9 1.9.7-1.9.7L18 20l-.7-1.9-1.9-.7 1.9-.7L18 14z" />
      </>
    ),
  },
  {
    title: "Your own Space",
    body: "Post photos, videos and updates to a page of your own. Parents read it while they are deciding.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M3 8.5h18" />
        <path d="M7 15.5l2.5-3 2.2 2.4L14 13l3 3" />
      </>
    ),
  },
  {
    title: "Events",
    body: "Run tournaments, workshops and showcases. Families enter through Aspire91, and a new event stays private until you publish it.",
    icon: (
      <>
        <path d="M8 4h8v3.5a4 4 0 0 1-8 0V4z" />
        <path d="M8 5H5.6a2.4 2.4 0 0 0 2.8 2.4" />
        <path d="M16 5h2.4a2.4 2.4 0 0 1-2.8 2.4" />
        <path d="M12 11.5V15" />
        <path d="M9.5 20h5l-.5-4h-4z" />
      </>
    ),
  },
  {
    title: "One inbox",
    body: "Requests, replies and chats together. Mark a lead as called back, scheduled or closed so nothing gets lost.",
    icon: (
      <>
        <path d="M4 13l2.4-7.2A2 2 0 0 1 8.3 4.5h7.4a2 2 0 0 1 1.9 1.3L20 13" />
        <path d="M4 13h4.2l1.1 2.2h5.4l1.1-2.2H20" />
        <path d="M4 13v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V13" />
      </>
    ),
  },
  {
    title: "A listing you control",
    body: "Your subjects, your areas, your fees, your availability. Edit any of it whenever you like.",
    icon: (
      <>
        <path d="M4 7h9M17 7h3" />
        <circle cx="15" cy="7" r="2" />
        <path d="M4 17h3M11 17h9" />
        <circle cx="9" cy="17" r="2" />
      </>
    ),
  },
];

const STEPS = [
  { title: "Create your listing", body: "What you teach, the areas you cover, and your fees." },
  { title: "We review it", body: "We check every listing before parents see it. Nothing more is needed from you." },
  { title: "Appear in search", body: "Parents searching your areas can find you, and your Space, from then on." },
  { title: "Reply to families", body: "See who is looking, answer once, and carry on in chat." },
];

const FAQ = [
  {
    q: "What does it cost?",
    a: "Nothing at the moment. The provider plan is a free listing — be findable at no charge — and running events is free too, while we are getting started. If that changes, you will hear it from us before it happens rather than after.",
  },
  {
    q: "Do you take a cut of my fees?",
    a: "No. You agree fees directly with the family and they pay you directly. Aspire91 does not handle your money.",
  },
  {
    q: "Do I have to hand out my phone number?",
    a: "No. Parents reach you through Aspire91 and you answer in the app. What you share beyond that, and when, is your call.",
  },
  {
    q: "What does “we review your listing” mean?",
    a: "A person reads it before it goes live: that you teach what you say you teach, in the areas you have chosen, and that the listing is real. It protects the families, and it protects the coaches already here.",
  },
  {
    q: "What counts as a group?",
    a: "Two or more families near each other who want the same thing and have said so together. They decide how long the group stays open. You answer it once, and every family in it sees your reply.",
  },
  {
    q: "My area is not open yet.",
    a: "Create your listing anyway and choose the areas you cover. You will be there ready when we open one — we would much rather open an area with coaches already in it.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

/** Outline icons, all on one 24-grid so weights match across the page. */
function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/**
 * The hero illustration: one parent request, with the fields that make it
 * worth answering. It is the argument of the page in a picture, which is why
 * it carries real labels rather than grey placeholder bars.
 */
function RequestCard() {
  return (
    <svg
      viewBox="0 0 460 430"
      role="img"
      aria-label="A parent request showing the area, subject, preferred days, budget, that two families have joined together, and a Reply button."
      className="mx-auto block h-auto w-full max-w-[460px]"
    >
      <defs>
        <linearGradient id="a91coral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b4d" />
          <stop offset="1" stopColor="#ffb238" />
        </linearGradient>
        <filter id="a91soft" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="24" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect
        x="78" y="94" width="336" height="292" rx="20"
        fill="var(--surface-2)" stroke="var(--border)" opacity="0.55"
      />

      <g filter="url(#a91soft)">
        <rect x="46" y="72" width="336" height="296" rx="20" fill="var(--surface)" stroke="var(--border)" />
      </g>

      <circle cx="80" cy="104" r="4" fill="var(--teal)" />
      <text x="92" y="109" fontFamily="var(--font-jakarta), sans-serif" fontWeight="800" fontSize="15" fill="var(--ink)">
        New request
      </text>
      <text x="74" y="132" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">
        Indirapuram · near you
      </text>

      <circle cx="372" cy="92" r="23" fill="url(#a91coral)" />
      <path
        d="M372 82c-4.2 0-7.5 3.3-7.5 7.4 0 5.2 7.5 12.6 7.5 12.6s7.5-7.4 7.5-12.6c0-4.1-3.3-7.4-7.5-7.4z"
        fill="none" stroke="#1a0d06" strokeWidth="1.8"
      />
      <circle cx="372" cy="89.4" r="2.6" fill="#1a0d06" />

      <line x1="74" y1="148" x2="354" y2="148" stroke="var(--border)" />

      <text x="74" y="180" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">Subject</text>
      <text x="354" y="180" textAnchor="end" fontFamily="var(--font-jakarta), sans-serif" fontWeight="700" fontSize="13" fill="var(--ink)">
        Maths · Class 8
      </text>

      <text x="74" y="219" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">Days</text>
      <g fontFamily="var(--font-manrope), sans-serif" fontSize="11" fontWeight="600" fill="var(--ink)" textAnchor="middle">
        <rect x="216" y="205" width="42" height="22" rx="7" fill="var(--surface-2)" stroke="var(--border)" />
        <text x="237" y="220">Mon</text>
        <rect x="264" y="205" width="42" height="22" rx="7" fill="var(--surface-2)" stroke="var(--border)" />
        <text x="285" y="220">Wed</text>
        <rect x="312" y="205" width="42" height="22" rx="7" fill="var(--surface-2)" stroke="var(--border)" />
        <text x="333" y="220">Fri</text>
      </g>

      <text x="74" y="259" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">Budget</text>
      <rect x="234" y="251" width="120" height="8" rx="4" fill="var(--surface-2)" />
      <rect x="234" y="251" width="76" height="8" rx="4" fill="url(#a91coral)" />

      <text x="74" y="295" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">Where</text>
      <text x="354" y="295" textAnchor="end" fontFamily="var(--font-jakarta), sans-serif" fontWeight="700" fontSize="13" fill="var(--ink)">
        At your centre
      </text>

      <line x1="74" y1="318" x2="354" y2="318" stroke="var(--border)" />

      <g>
        <circle cx="84" cy="345" r="12" fill="var(--surface-2)" stroke="var(--surface)" strokeWidth="2" />
        <circle cx="102" cy="345" r="12" fill="var(--surface-2)" stroke="var(--surface)" strokeWidth="2" />
        <circle cx="120" cy="345" r="12" fill="var(--surface-2)" stroke="var(--surface)" strokeWidth="2" />
        <circle cx="84" cy="341" r="3.4" fill="var(--faint)" />
        <path d="M78.5 351a5.5 5.5 0 0 1 11 0" fill="none" stroke="var(--faint)" strokeWidth="1.6" />
      </g>
      <text x="140" y="349" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="var(--muted)">
        +2 families together
      </text>
      <rect x="270" y="330" width="84" height="30" rx="15" fill="url(#a91coral)" />
      <text x="312" y="350" textAnchor="middle" fontFamily="var(--font-manrope), sans-serif" fontWeight="700" fontSize="13" fill="#1a0d06">
        Reply
      </text>
    </svg>
  );
}

export default async function ForCoachesPage() {
  // Derived, not hardcoded: this band is a claim about the product's current
  // reach, and a fixed list starts lying the day an area opens. Every city is
  // read, so "opening next" can be worked out too — a city that has areas
  // defined but none of them live is one we are getting ready.
  const { cities, areas, ok } = await fetchAllLocations().catch(() => ({
    cities: [],
    areas: [],
    ok: false,
  }));

  const liveByCity = cities
    .map((city) => ({
      city,
      areaNames: areas.filter((a) => a.cityId === city.id && a.isLive).map((a) => a.name),
    }))
    .filter((row) => row.areaNames.length > 0);

  const openingNext = cities.filter(
    (city) =>
      !liveByCity.some((row) => row.city.id === city.id) &&
      areas.some((a) => a.cityId === city.id),
  );

  return (
    <main className="min-h-screen bg-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="flex flex-col items-start gap-4">
            <p className="cf-eyebrow">For coaches, tutors and academies</p>

            <h1 className="cf-display text-[clamp(2.3rem,5.6vw,3.6rem)] leading-[1.05] text-ink">
              Get students near you
            </h1>

            <p className="max-w-[62ch] text-[1.08rem] leading-relaxed text-muted">
              {BRAND.name} is where parents in your area write down what they are looking for — the
              subject, the child&apos;s age and level, the days that suit them, and a budget. You see
              those requests, and you reply.
            </p>

            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/signup/provider" className="cf-btn-primary">
                List your classes — free
              </Link>
              <Link href="#how" className="cf-btn-ghost">
                See how it works
              </Link>
            </div>

            <p className="text-sm text-faint">We check every listing before parents see it.</p>

            {/* The coach app is built and is waiting on a store review, so this
                says "coming" rather than linking anywhere. A badge that goes to
                a dead Play listing is worse than no badge. */}
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 shrink-0 fill-gold"
              >
                <path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.69-.4l-1.86 3.22a11.4 11.4 0 00-9.78 0L5.25 5.9a.4.4 0 10-.69.4L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
              </svg>
              <p className="text-sm leading-relaxed text-muted">
                <span className="font-semibold text-ink">The Android app is coming.</span>{" "}
                Your students, messages and Space, on your phone. Everything here works in a
                browser in the meantime.
              </p>
            </div>
          </div>

          <RequestCard />
        </div>
      </section>

      {/* Where we are actually live. Skipped entirely when the reference read
          fails — an empty band claiming nothing is worse than no band. */}
      {ok && liveByCity.length > 0 && (
        <div className="mx-auto max-w-6xl px-6">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-4 font-mono text-[0.78rem] text-muted">
            <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-teal" />
            <span className="font-medium text-ink">Live now</span>
            {liveByCity.map(({ city, areaNames }) => (
              <span key={city.id}>
                {city.name} — {areaNames.join(" · ")}
              </span>
            ))}
            {openingNext.length > 0 && (
              <span className="text-faint">
                {openingNext.map((c) => c.name).join(" · ")} opening next
              </span>
            )}
          </p>
        </div>
      )}

      {/* Why it is not a directory */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="cf-eyebrow">Why it is not a directory</p>
        <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] leading-[1.15] text-ink">
          Three things that work differently here
        </h2>

        <div className="mt-10">
          {POINTS.map((point, i) => (
            <div
              key={point.title}
              className={`grid gap-2 border-t border-line py-7 md:grid-cols-[15rem_1fr] md:items-start md:gap-8 ${
                i === POINTS.length - 1 ? "border-b" : ""
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Glyph className="mt-px h-[22px] w-[22px] shrink-0 text-coral">{point.icon}</Glyph>
                <h3 className="font-display text-base font-bold text-ink">{point.title}</h3>
              </div>
              <p className="max-w-[62ch] text-[0.925rem] leading-[1.65] text-muted">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <div className="border-y border-line bg-surface">
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="cf-eyebrow">What you get</p>
          <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] leading-[1.15] text-ink">
            Everything in one account
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="cf-card flex flex-col gap-2.5 bg-surface-2 p-6">
                <span className="mb-1 grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-accent-ink">
                  <Glyph className="h-6 w-6">{f.icon}</Glyph>
                </span>
                <h3 className="font-display text-base font-bold text-ink">{f.title}</h3>
                <p className="text-[0.925rem] leading-[1.65] text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* How it works — the one genuine sequence on the page, so the only
          thing here that carries numbers. */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <p className="cf-eyebrow">How it works</p>
        <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] leading-[1.15] text-ink">
          Four steps to your first reply
        </h2>

        <ol className="mt-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="cf-card flex flex-col gap-2.5 p-6">
              <span
                aria-hidden="true"
                className="mb-1 grid h-11 w-11 place-items-center rounded-full font-display text-lg font-extrabold text-coral"
                style={{
                  background: "color-mix(in srgb, var(--grad-1) 12%, var(--surface))",
                  border: "1px solid color-mix(in srgb, var(--grad-1) 32%, var(--border))",
                }}
              >
                {i + 1}
              </span>
              <h3 className="font-display text-base font-bold text-ink">{s.title}</h3>
              <p className="text-[0.925rem] leading-[1.65] text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ, open at rest */}
      <div className="border-y border-line bg-surface">
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="cf-eyebrow">Straight answers</p>
          <h2 className="cf-display mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] leading-[1.15] text-ink">
            What it costs, and what happens to your details
          </h2>

          <div className="mt-10">
            {FAQ.map((item, i) => (
              <div
                key={item.q}
                className={`border-t border-line py-6 ${i === FAQ.length - 1 ? "border-b" : ""}`}
              >
                <h3 className="font-display text-base font-bold text-ink">{item.q}</h3>
                <p className="mt-1.5 max-w-[62ch] text-[0.925rem] leading-[1.65] text-muted">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Close */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="cf-display text-[clamp(1.6rem,3.4vw,2.25rem)] text-ink">
          Ready to list your classes?
        </h2>
        <p className="mx-auto mt-4 max-w-[62ch] leading-relaxed text-muted">
          It takes a few minutes, and you can change any of it later.
        </p>
        <div className="mt-8">
          <Link href="/signup/provider" className="cf-btn-primary">
            List your classes — free
          </Link>
        </div>
        <p className="mt-5 text-sm text-faint">
          {BRAND.name} is run by {BRAND.legalName}.
        </p>
      </section>
    </main>
  );
}
