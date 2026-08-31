import Link from "next/link";
import { supabaseServerAdmin } from "@/lib/supabase-server";
import { createNewsExcerpt, getStartupNewsPath } from "@/lib/startup-news";
import NewsShareButtons from "@/components/NewsShareButtons";

type SearchParams = Promise<{
  q?: string;
  industry?: string;
}>;

type IndustryRow = {
  id: string;
  name: string;
};

type NewsRow = {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  industry_id: string | null;
  created_at: string;
  industry_master?: {
    name?: string | null;
  } | null;
};

export const metadata = {
  title: "Startup News | MentBridge",
  description: "Browse startup news, founder updates, and market stories across industries on MentBridge.",
};

export default async function StartupNewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = (params.q || "").trim();
  const industry = (params.industry || "").trim();

  const { data: industries } = await supabaseServerAdmin
    .from("industry_master")
    .select("id, name")
    .order("name");

  let newsQuery = supabaseServerAdmin
    .from("startup_news")
    .select("id, title, content, image_url, industry_id, created_at, industry_master(name)")
    .order("created_at", { ascending: false });

  if (industry) {
    newsQuery = newsQuery.eq("industry_id", industry);
  }

  if (query) {
    newsQuery = newsQuery.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  }

  const { data: news } = await newsQuery;
  const safeNews = (news as NewsRow[] | null) || [];
  const safeIndustries = (industries as IndustryRow[] | null) || [];
  const featuredNews = safeNews[0] || null;
  const columnNews = featuredNews ? safeNews.slice(1) : safeNews;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_42%,_#ffffff_100%)]">
      <section className="relative overflow-hidden px-6 py-24">
        <div className="absolute inset-0">
          <div className="absolute left-[-120px] top-[-50px] h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
          <div className="absolute right-[-100px] top-[18%] h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">
            Startup News
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-bold tracking-tight text-slate-950 md:text-6xl">
            Founder stories, startup signals, and market moves in one public newsroom.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Discover startup news by industry, search for specific topics, and open every story as a new learning
          </p>
        </div>
      </section>

      <section className="px-6 pb-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-4 lg:grid-cols-[1fr_240px_auto]">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search startup news"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
            />
            <select
              name="industry"
              defaultValue={industry}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
            >
              <option value="">All industries</option>
              {safeIndustries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          {safeNews.length === 0 ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">
              No startup news found for the selected filters.
            </div>
          ) : (
            <div className="space-y-10">
              {featuredNews && (
                <article className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
                  <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
                    {featuredNews.image_url && (
                      <img
                        src={featuredNews.image_url}
                        alt={featuredNews.title}
                        className="h-full min-h-[320px] w-full object-cover"
                      />
                    )}
                    <div className="p-8 lg:p-10">
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                        {featuredNews.industry_master?.name || "Startup News"}
                      </span>
                      <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">
                        {featuredNews.title}
                      </h2>
                      <p className="mt-4 text-sm text-slate-400">
                        {new Date(featuredNews.created_at).toLocaleDateString()}
                      </p>
                      <p className="mt-6 text-[15px] leading-8 text-slate-600">
                        {createNewsExcerpt(featuredNews.content, 220)}
                      </p>
                      <div className="mt-8 flex flex-wrap items-center gap-4">
                        <Link
                          href={getStartupNewsPath(featuredNews.id, featuredNews.title)}
                          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Read More
                        </Link>
                        <NewsShareButtons
                          title={featuredNews.title}
                          url={`${origin}${getStartupNewsPath(featuredNews.id, featuredNews.title)}`}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              )}

              <div className="columns-1 gap-6 md:columns-2 xl:columns-3">
                {columnNews.map((item) => (
                  <article
                    key={item.id}
                    className="mb-6 break-inside-avoid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)]"
                  >
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-56 w-full object-cover"
                      />
                    )}

                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          {item.industry_master?.name || "Startup News"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                        {item.title}
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-slate-600">
                        {createNewsExcerpt(item.content, 180)}
                      </p>

                      <div className="mt-6 space-y-4">
                        <Link
                          href={getStartupNewsPath(item.id, item.title)}
                          className="inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          Read More
                        </Link>
                        <NewsShareButtons
                          title={item.title}
                          url={`${origin}${getStartupNewsPath(item.id, item.title)}`}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
