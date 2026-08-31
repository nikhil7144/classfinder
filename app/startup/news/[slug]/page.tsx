import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NewsShareButtons from "@/components/NewsShareButtons";
import { extractNewsIdFromSlug, getStartupNewsPath } from "@/lib/startup-news";
import { supabaseServerAdmin } from "@/lib/supabase-server";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type NewsRow = {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
  industry_master?: {
    name?: string | null;
  } | null;
};

async function loadNews(slug: string) {
  const newsId = extractNewsIdFromSlug(slug);

  const { data } = await supabaseServerAdmin
    .from("startup_news")
    .select("id, title, content, image_url, created_at, industry_master(name)")
    .eq("id", newsId)
    .maybeSingle();

  return (data as NewsRow | null) || null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const news = await loadNews(slug);

  if (!news) {
    return { title: "Startup News | MentBridge" };
  }

  return {
    title: `${news.title} | MentBridge Startup News`,
    description: news.content.slice(0, 155),
    openGraph: {
      title: news.title,
      description: news.content.slice(0, 155),
      images: news.image_url ? [news.image_url] : undefined,
    },
  };
}

export default async function StartupNewsDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const news = await loadNews(slug);

  if (!news) {
    notFound();
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const newsPath = getStartupNewsPath(news.id, news.title);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_42%,_#ffffff_100%)] px-6 py-16">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
        {news.image_url && (
          <img
            src={news.image_url}
            alt={news.title}
            className="h-[360px] w-full object-cover"
          />
        )}

        <div className="p-8 md:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              {news.industry_master?.name || "Startup News"}
            </span>
            <span className="text-sm text-slate-400">
              {new Date(news.created_at).toLocaleDateString()}
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">{news.title}</h1>
          <p className="mt-8 whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
            {news.content}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/startup/news"
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Back to News
            </Link>
            <NewsShareButtons title={news.title} url={`${origin}${newsPath}`} />
          </div>
        </div>
      </article>
    </main>
  );
}
