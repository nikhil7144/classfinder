import Link from "next/link";

export const metadata = {
  title: "Why MentBridge | For Industry Experts, Freelancers, and Consultants",
  description:
    "Learn how MentBridge helps industry experts, freelancers, and consultants work with startups as advisors, part-time leaders, and growth partners.",
};

const roleCards = [
  {
    title: "Marketing Consultant",
    description:
      "Guide startups on positioning, go-to-market, customer acquisition, and brand building without committing to a full-time role.",
  },
  {
    title: "Tech Consultant",
    description:
      "Help founders make better product, engineering, architecture, and scaling decisions as an experienced technical operator.",
  },
  {
    title: "Product Consultant",
    description:
      "Work with startups on roadmap clarity, user research, product strategy, and execution systems that move faster.",
  },
];

const workModes = [
  "Join as a strategic consultant for focused business or product problems.",
  "Operate as a freelancer for execution-heavy work across growth, product, or technology.",
  "Support founders as an advisor who brings pattern recognition from previous operator experience.",
  "Partner with startups during critical phases like product launch, GTM shifts, fundraising, and team building.",
];

const leadershipTracks = [
  "Become a part-time CTO across multiple startups.",
  "Work as a fractional CMO to sharpen growth and marketing systems.",
  "Support founders as a part-time CPO and improve product direction.",
  "Earn across multiple startup relationships instead of depending on one employer.",
];

export default function WhyMentBridgePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf7_0%,_#f8fafc_40%,_#ffffff_100%)] text-slate-900">
      <section className="relative overflow-hidden px-6 py-24">
        <div className="absolute inset-0">
          <div className="absolute left-[-120px] top-[-40px] h-80 w-80 rounded-full bg-amber-200/45 blur-3xl" />
          <div className="absolute right-[-100px] top-[10%] h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute bottom-[-120px] left-[28%] h-80 w-80 rounded-full bg-emerald-100/45 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">
              Why MentBridge
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-bold tracking-tight text-slate-950 md:text-6xl">
              Start your consultancy in marketing, tech, and product with startups that need you.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              MentBridge helps experienced operators, freelancers, and consultants work with
              startups in high-value roles. You can advise, execute, and grow with founders
              while building meaningful income streams.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/veterans"
                className="rounded-full border border-slate-200 bg-white px-7 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Explore Leaders
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
              What Role You Can Play
            </p>
            <div className="mt-6 space-y-4">
              {roleCards.map((card) => (
                <article
                  key={card.title}
                  className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_55%,_#eff6ff_100%)] p-5"
                >
                  <h2 className="text-xl font-semibold text-slate-950">{card.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-6">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Work With Startups
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
            The roles you can play with founders go far beyond one-off advice.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {workModes.map((item) => (
              <div
                key={item}
                className="rounded-[1.4rem] border border-emerald-100 bg-[linear-gradient(135deg,_#ecfdf5_0%,_#ffffff_100%)] p-5 text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] bg-[linear-gradient(145deg,_#0f172a_0%,_#1e293b_100%)] p-8 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">
              Fractional Leadership
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              Become a part-time CTO, CMO, or CPO for multiple startups.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-300">
              MentBridge can become your channel to work with founders who need senior thinking
              but are not yet ready for a full-time executive hire.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {leadershipTracks.map((item) => (
              <div
                key={item}
                className="rounded-[1.5rem] border border-indigo-100 bg-[linear-gradient(135deg,_#eef2ff_0%,_#ffffff_100%)] p-6 text-slate-700 shadow-[0_14px_36px_rgba(99,102,241,0.08)]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-amber-100 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_45%,_#f0fdf4_100%)] p-10 shadow-[0_18px_48px_rgba(245,158,11,0.10)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">
            Why Now
          </p>
          <h2 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            The market is changing. More people are becoming entrepreneurs, and experienced
            operators are needed more than ever.
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            Startups need sharp minds in technology, marketing, and product. Founders want
            experienced people who can help them move faster without the cost of building a full
            executive bench too early. That is where your experience becomes highly valuable.
          </p>
        </div>
      </section>
    </main>
  );
}
