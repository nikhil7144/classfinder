"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getStartupPostPath, isLongPost } from "@/lib/post-links";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type FeaturedStartup = {
  id: string;
  startup_name: string | null;
  logo_url: string | null;
  headline: string | null;
  location: string | null;
  founded_year: number | string | null;
  team_size: number | string | null;
  stage: string | null;
   offering_equity?: boolean;
  looking_for_advisors?: boolean | null;
  user_id?: string;
};

type Industry = {
  id: string;
  name: string;
  slug: string;
};

type Expertise = {
  id: string;
  name: string;
};

type Post = {
  id: string;
  startup_id: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  startup?: FeaturedStartup;
};

function getInitials(name?: string | null) {
  return (name || "Startup")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function normalizeLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;

  if (logoUrl.startsWith("/storage/v1/object/public/") && supabaseUrl) {
    return `${supabaseUrl}${logoUrl}`;
  }

  const cleanedPath = logoUrl
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/startup-logos\/?/, "")
    .replace(/^startup-logos\/?/, "");

  if (!cleanedPath || !supabaseUrl) return null;

  const encodedPath = cleanedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/startup-logos/${encodedPath}`;
}

function StartupLogo({
  startupName,
  logoUrl,
}: {
  startupName?: string | null;
  logoUrl?: string | null;
}) {
  const resolvedLogoUrl = normalizeLogoUrl(logoUrl);
  const [hasError, setHasError] = useState(false);

  if (!resolvedLogoUrl || hasError) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-sm font-semibold text-slate-700">
        {getInitials(startupName)}
      </div>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={startupName || "Startup logo"}
      className="h-12 w-12 object-contain"
      onError={() => setHasError(true)}
    />
  );
}

export default function GuestHome() {
  const router = useRouter();
  const [featuredStartups, setFeaturedStartups] = useState<FeaturedStartup[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [expertiseList, setExpertiseList] = useState<Expertise[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const loadFeatured = async () => {
      const { data } = await supabase
        .from("startups")
        .select("*")
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(6);

      setFeaturedStartups(data || []);
    };

    loadFeatured();
  }, []);

  useEffect(() => {
    const loadIndustries = async () => {
      const { data } = await supabase.from("industry_master").select("*").order("name");

      setIndustries(data || []);
    };

    loadIndustries();
  }, []);

  useEffect(() => {
    const loadExpertise = async () => {
      const { data } = await supabase.from("expertise_master").select("id, name").order("name");

      setExpertiseList((data as Expertise[] | null) || []);
    };

    loadExpertise();
  }, []);

  useEffect(() => {
    const loadPosts = async () => {
      const { data: postsData } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!postsData) return;

      const { data: startups } = await supabase.from("startups").select("*");

      const merged = postsData.map((post) => {
        const startup = startups?.find((s) => s.user_id === post.startup_id);

        return {
          ...post,
          startup,
        };
      });

      setPosts(merged);
    };

    loadPosts();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 text-white">
        <div className="absolute inset-0 opacity-60">
          <div className="absolute left-[-120px] top-[-80px] h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
          <div className="absolute right-[-80px] top-[40px] h-80 w-80 rounded-full bg-cyan-400/25 blur-3xl" />
          <div className="absolute bottom-[-100px] left-[20%] h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-28 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-blue-200/80">
            BridgeUp Network
          </p>
          <h1 className="mt-5 text-5xl font-bold leading-tight md:text-7xl">
            Connect Ambition
            <br />
            <span className="bg-gradient-to-r from-fuchsia-300 via-blue-200 to-cyan-200 bg-clip-text text-transparent">
              With Experience.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-blue-100/80">
            Mentbridge helps founders move faster by giving them access to real
            industry leaders who have already built and scaled.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={() => router.push("/veterans")}
              className="rounded-full bg-white/12 px-8 py-4 text-lg font-semibold text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur hover:bg-white/18 transition"
            >
              I&apos;m a Startup
            </button>

            <button
              onClick={() => router.push("/why-mentbridge")}
              className="rounded-full bg-white px-8 py-4 text-lg font-semibold text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.22)] hover:bg-slate-100 transition"
            >
              I&apos;m an Industry Leader
            </button>
          </div>
        </div>
      </section>

      <section className="w-full bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">
              Real Conversations
            </p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
              Stop Overthinking. Speak With Someone Who Has Been There.
            </h2>
            <div className="mt-8 space-y-2 text-2xl font-semibold leading-tight text-slate-950 md:text-3xl">
              <p>You don&apos;t need more information.</p>
              <p>You need direction.</p>
            </div>

            <div className="mt-10 max-w-3xl space-y-5 text-[16px] leading-8 text-slate-700">
              <p>
                Get on a 1:1 call with a carefully selected mentor within minutes.
              </p>
              <p className="font-semibold text-slate-950">
                No courses. No endless content.
              </p>
              <p>
                Just a real discussion with someone who has already faced and solved
                what you are dealing with.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-[linear-gradient(135deg,_#0f172a_0%,_#312e81_50%,_#1d4ed8_100%)] px-6 py-24 text-white">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/6 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.26)] backdrop-blur md:p-12">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative">
              <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="relative z-10 max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-200/80">
                  Why MentBridge
                </p>
                <h2 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
                  Why MentBridge
                </h2>
                <p className="mt-8 text-lg leading-8 text-blue-100/80">
                  Built for sharper conversations, clearer decisions, and guidance that
                  comes from lived experience instead of generic playbooks.
                </p>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {[
                {
                  title: "Only proven people, not profiles",
                  body: "Every mentor goes through strict selection. Most don't make it.",
                },
                {
                  title: "Not generic advice. Real perspective",
                  body: "You get insights shaped by experience, not textbook answers.",
                },
                {
                  title: "Conversations that create clarity",
                  body: "Straight thinking. Honest inputs. No unnecessary noise.",
                },
                {
                  title: "Focused on real decisions",
                  body: "From strategy to growth, these are conversations that actually move things forward.",
                },
              ].map((item) => (
                <div key={item.title} className="border-l-2 border-blue-300/40 pl-5">
                  <h3 className="text-xl font-semibold tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-7 text-blue-100/80">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef2ff_100%)] px-6 py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.75rem] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(238,242,255,0.88))] p-8 shadow-[0_24px_60px_rgba(79,70,229,0.14)] backdrop-blur md:p-12">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative">
              <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-indigo-200/40 blur-3xl" />
              <div className="relative z-10 max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-700">
                  For Startups
                </p>
                <h2 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                  Make Better Decisions, Faster
                </h2>
                <p className="mt-8 text-lg leading-8 text-slate-600">
                  Work through critical decisions with experienced operators who help
                  you cut through noise, pressure-test your thinking, and move with more confidence.
                </p>
              </div>
            </div>

            <div className="no-scrollbar max-h-[720px] overflow-y-auto pr-2 md:max-h-[760px]">
              <div className="grid gap-5 md:grid-cols-2">
              {[
                {
                  title: "Avoid Costly Mistakes",
                  body: "Learn from people who have already faced the challenges you are dealing with. Reduce trial and error by getting clarity before you act.",
                },
                {
                  title: "Move Faster With Clarity",
                  body: "Stop second-guessing. Get clear direction on what to do next so you can execute with confidence.",
                },
                {
                  title: "Access Strategic Networks",
                  body: "Connect with experienced professionals who open doors, share insights, and expand your reach beyond your immediate circle.",
                },
                {
                  title: "Validate Your Thinking",
                  body: "Test your ideas with someone who understands the market. Know if you are on the right track before investing time and resources.",
                },
                {
                  title: "Get Honest Feedback",
                  body: "No sugarcoating. Get direct, practical input that helps you improve your approach and avoid blind spots.",
                },
                {
                  title: "Solve Real Problems",
                  body: "From growth challenges to product decisions, get help on issues that directly impact your business.",
                },
                {
                  title: "Save Time and Resources",
                  body: "Avoid going in the wrong direction for months. A single conversation can help you focus on what truly matters.",
                },
                {
                  title: "Think Like a Founder, Not Just an Operator",
                  body: "Sharpen your decision-making by learning how experienced leaders approach complex situations.",
                },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className="group rounded-[1.75rem] border border-indigo-100/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_20px_44px_rgba(59,130,246,0.14)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]">
                    {(index + 1).toString().padStart(2, "0")}
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950 group-hover:text-indigo-700">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-[linear-gradient(135deg,_#0f172a_0%,_#312e81_50%,_#1d4ed8_100%)] px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl rounded-[2.75rem] border border-white/10 bg-white/6 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.26)] backdrop-blur md:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
                Take the Next Step
              </h2>
              <div className="mt-10 space-y-2 text-3xl leading-tight text-white">
                <p>Start a conversation.</p>
                <p>Move forward with clarity.</p>
                <p>Less noise. Better thinking.</p>
              </div>
            </div>

            <div className="rounded-[2rem] bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.22)] ring-1 ring-white/70 md:p-8">
              <p className="mx-auto max-w-xs text-center text-2xl leading-snug text-slate-950">
                Find someone who understands your situation.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                {expertiseList.slice(0, 8).map((expertise) => (
                  <button
                    key={expertise.id}
                    type="button"
                    onClick={() =>
                      router.push(`/veterans?expertise=${encodeURIComponent(expertise.name)}`)
                    }
                    className="rounded-full border border-indigo-200 bg-white px-5 py-3 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    {expertise.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-slate-950 px-6 py-6">
        <div className="mx-auto max-w-7xl rounded-full border border-white/10 bg-white/5 px-6 py-4 text-center text-base text-slate-200 backdrop-blur">
          Trusted by founders, advisors, and industry leaders
        </div>
      </section>

      <section className="w-full bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.75rem] border border-white/70 bg-white/75 p-8 shadow-[0_24px_60px_rgba(79,70,229,0.10)] backdrop-blur md:p-12">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative">
              <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-indigo-200/40 blur-3xl" />
              <div className="relative z-10 max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">
                  For Industry Experts
                </p>
                <h2 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                  Turn Your Experience Into Impact and Opportunity
                </h2>
                <p className="mt-8 text-lg leading-8 text-slate-600">
                  Bring hard-earned perspective to founders who need real guidance, while
                  creating flexible opportunity for yourself on your own terms.
                </p>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {[
                {
                  title: "Earn on Your Terms",
                  body: "Work with startups when you want, without long-term commitments or operational burden.",
                },
                {
                  title: "Monetize Your Expertise",
                  body: "Turn your years of experience into meaningful income by guiding businesses that need it most.",
                },
                {
                  title: "Be a Thinking Partner",
                  body: "Help founders make better decisions, challenge assumptions, and bring clarity to complex situations.",
                },
                {
                  title: "Stay Relevant",
                  body: "Engage with new industries, ideas, and technologies while contributing your perspective.",
                },
                {
                  title: "Work Without Full-Time Pressure",
                  body: "Contribute strategically without stepping back into demanding operational roles.",
                },
                {
                  title: "Expand Your Influence",
                  body: "Work across multiple startups and create impact beyond a single organization.",
                },
              ].map((item) => (
                <div key={item.title} className="border-l-2 border-indigo-200 pl-5">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                Featured Startups
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                High-potential founders building the future
              </p>
            </div>
          </div>

          {featuredStartups.length === 0 ? (
            <div className="mt-8 rounded-[2rem] border border-slate-200 bg-slate-50 p-8 text-slate-500">
              No featured startups yet.
            </div>
          ) : (
            <div className="mt-8 flex gap-6 overflow-x-auto pb-4">
              {featuredStartups.map((startup) => (
                <div
                  key={startup.id}
                  onClick={() => router.push(`/startup/${startup.id}`)}
                  className="min-w-[580px] cursor-pointer overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 p-[1px] shadow-[0_18px_40px_rgba(79,70,229,0.28)] transition hover:translate-y-[-2px]"
                >
                  <div className="h-full rounded-[calc(2rem-1px)] bg-gradient-to-br from-violet-950/90 via-indigo-950/90 to-slate-950/95 p-8 text-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-2 shadow-lg">
                          <StartupLogo
                            key={startup.logo_url || startup.id}
                            startupName={startup.startup_name}
                            logoUrl={startup.logo_url}
                          />
                        </div>

                        <div>
                          <h3 className="text-2xl font-bold tracking-tight">
                            {startup.startup_name}
                          </h3>
                          <p className="mt-2 max-w-xl text-sm leading-7 text-blue-100/85">
                            {startup.headline || "No description available."}
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full bg-white/14 px-4 py-2 text-sm font-medium text-white backdrop-blur">
                        Featured
                      </span>
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-blue-50/85">
                      <div>
                        <span className="font-semibold text-white">Location:</span>{" "}
                        {startup.location || "India"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Founded:</span>{" "}
                        {startup.founded_year || "N/A"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Team:</span>{" "}
                        {startup.team_size || "N/A"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Stage:</span>{" "}
                        {startup.stage || "Early"}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {startup.looking_for_advisors && (
                        <span className="rounded-full bg-emerald-400/18 px-3 py-1 text-xs font-medium text-emerald-100">
                          Hiring Advisors
                        </span>
                      )}

                      {startup.offering_equity === true && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-cyan-300/18 px-3 py-1 text-xs font-medium text-cyan-100">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="h-3.5 w-3.5"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.313a1 1 0 0 1-1.42-.005L3.29 9.207a1 1 0 1 1 1.42-1.407l4.04 4.078 6.543-6.595a1 1 0 0 1 1.41.006Z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Offering Equity
                        </span>
                      )}
                    </div>

                    <button className="mt-8 w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-slate-100">
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="w-full bg-slate-100 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-950">
            Explore by Industry
          </h2>

          <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
            {industries.map((industry) => (
              <div
                key={industry.id}
                onClick={() => router.push(`/startups/category/${industry.slug}`)}
                className="cursor-pointer rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:border-indigo-200 hover:shadow-[0_16px_34px_rgba(79,70,229,0.12)]"
              >
                <span className="font-medium text-slate-900">{industry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-white px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-gradient-to-br from-violet-50 via-white to-blue-50 p-10 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <h2 className="text-center text-4xl font-bold tracking-tight text-slate-950">
            Your Experience Is an Asset.
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-center text-[15px] leading-7 text-slate-600">
            MentBridge allows industry experts to monetize their expertise without
            operational involvement. Flexible hours. Strategic influence. Real
            compensation.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { hours: "4 hrs / week", price: "Rs 48,000 / month" },
              { hours: "8 hrs / week", price: "Rs 96,000 / month", featured: true },
              { hours: "12 hrs / week", price: "Rs 1,44,000 / month" },
            ].map((item) => (
              <div
                key={item.hours}
                className={`rounded-[2rem] p-8 ${
                  item.featured
                    ? "bg-gradient-to-br from-violet-700 to-blue-700 text-white shadow-[0_18px_38px_rgba(79,70,229,0.25)]"
                    : "border border-slate-200 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                }`}
              >
                <h3 className="text-xl font-semibold">{item.hours}</h3>
                <p className={`mt-3 text-3xl font-bold ${item.featured ? "text-white" : "text-indigo-600"}`}>
                  {item.price}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-slate-100 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                Startup Activity
              </h2>
              <p className="mt-2 text-sm text-slate-500">Latest updates from founders</p>
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-500">
              No updates yet.
            </div>
          ) : (
            <div className="mt-8 flex gap-6 overflow-x-auto pb-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="min-w-[560px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                >
                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt={post.startup?.startup_name || "Startup update"}
                      className="h-[300px] w-full object-cover"
                    />
                  )}

                  <div className="p-8">
                    <div className="mb-4 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700">
                        {post.startup?.startup_name?.charAt(0) || "S"}
                      </div>

                      <div>
                        <p className="text-lg font-semibold text-slate-900">
                          {post.startup?.startup_name || "Startup"}
                        </p>

                        <p className="text-sm text-slate-400">
                          {new Date(post.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <p className="mb-4 text-slate-700 line-clamp-3">{post.description}</p>

                    {isLongPost(post.description, 140) && (
                      <button
                        onClick={() =>
                          router.push(
                            getStartupPostPath(post.startup?.startup_name, post.id)
                          )
                        }
                        className="mb-6 text-sm font-semibold text-indigo-600"
                      >
                        See more
                      </button>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <button className="text-slate-600 transition hover:text-red-500">
                        Like
                      </button>

                      <button
                        onClick={() => router.push(`/startup/${post.startup?.id}`)}
                        className="font-semibold text-indigo-600 hover:underline"
                      >
                        View Startup
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="w-full bg-slate-950 px-6 py-24 text-white">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 p-10 text-center shadow-[0_20px_44px_rgba(79,70,229,0.28)]">
          <h2 className="text-4xl font-bold tracking-tight">Build Smarter. Grow Faster.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-blue-50/90">
            Join MentBridge and unlock real strategic associations.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="mt-8 rounded-full bg-white px-8 py-4 font-semibold text-indigo-700 shadow-sm transition hover:bg-slate-100"
          >
            Get Started
          </button>
        </div>
      </section>

      <footer className="bg-slate-950 px-6 py-10 text-center text-slate-400">
        Copyright {new Date().getFullYear()} MentBridge. All rights reserved.
      </footer>
    </div>
  );
}
