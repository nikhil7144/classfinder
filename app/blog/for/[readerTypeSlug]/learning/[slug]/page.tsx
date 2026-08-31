import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPath, sanitizeBlogHtml, slugifyBlogSegment } from "@/lib/blogs";
import { supabaseServerAdmin } from "@/lib/supabase-server";

type PageProps = {
  params: Promise<{
    readerTypeSlug: string;
    slug: string;
  }>;
};

type BlogRow = {
  headline: string;
  short_title: string;
  writer_name: string;
  published_at: string;
  content_html: string | null;
  image_url: string | null;
  source_url: string | null;
  blog_reader_types?: {
    name?: string | null;
    slug?: string | null;
  } | null;
};

export const dynamic = "force-dynamic";

async function loadBlog(readerTypeSlug: string, slug: string) {
  const { data } = await supabaseServerAdmin
    .from("blogs")
    .select(
      "headline, short_title, writer_name, published_at, content_html, image_url, source_url, blog_reader_types!inner(name, slug)"
    )
    .eq("link_slug", slug)
    .eq("blog_reader_types.slug", readerTypeSlug)
    .maybeSingle();

  return (data as BlogRow | null) || null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { readerTypeSlug, slug } = await params;
  const blog = await loadBlog(readerTypeSlug, slug);

  if (!blog) {
    return { title: "Blog | MentBridge" };
  }

  return {
    title: `${blog.headline} | MentBridge Blog`,
    description: blog.short_title,
    openGraph: {
      title: blog.headline,
      description: blog.short_title,
      images: blog.image_url ? [blog.image_url] : undefined,
    },
  };
}

export default async function BlogDetailPage({ params }: PageProps) {
  const { readerTypeSlug, slug } = await params;
  const blog = await loadBlog(readerTypeSlug, slug);

  if (!blog) {
    notFound();
  }

  const canonicalPath = getBlogPath(
    blog.blog_reader_types?.slug || slugifyBlogSegment(readerTypeSlug),
    blog.headline
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_42%,_#ffffff_100%)] px-6 py-16">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
        {blog.image_url && (
          <img
            src={blog.image_url}
            alt={blog.headline}
            className="h-[360px] w-full object-cover"
          />
        )}

        <div className="p-8 md:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              {blog.blog_reader_types?.name || "Blog"}
            </span>
            <span className="text-sm text-slate-400">
              {new Date(blog.published_at).toLocaleDateString()}
            </span>
            <span className="text-sm text-slate-400">{blog.writer_name}</span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">{blog.headline}</h1>
          <p className="mt-4 text-lg text-slate-500">{blog.short_title}</p>

          <div
            className="mt-8 space-y-4 text-[15px] leading-8 text-slate-700 [&_a]:font-semibold [&_a]:text-indigo-600 [&_img]:my-6 [&_img]:rounded-2xl [&_img]:shadow-sm [&_strong]:font-semibold [&_strong]:text-slate-950"
            dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(blog.content_html) }}
          />

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/blog"
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Back to Blogs
            </Link>
            {blog.source_url && (
              <a
                href={blog.source_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Open Source Link
              </a>
            )}
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {canonicalPath}
            </span>
          </div>
        </div>
      </article>
    </main>
  );
}
