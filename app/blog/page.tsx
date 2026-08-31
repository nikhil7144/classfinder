import Link from "next/link";
import { createBlogExcerpt, getBlogPath } from "@/lib/blogs";
import { supabaseServerAdmin } from "@/lib/supabase-server";

type ReaderType = {
  name: string;
  slug: string;
};

type BlogRow = {
  id: string;
  headline: string;
  short_title: string;
  writer_name: string;
  published_at: string;
  content: string | null;
  content_html: string | null;
  image_url: string | null;
  blog_reader_types?: ReaderType | null;
};

export const metadata = {
  title: "Blogs | MentBridge",
  description:
    "Read the latest MentBridge blogs for product managers, digital marketers, founders, and more.",
};

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const { data } = await supabaseServerAdmin
    .from("blogs")
    .select(
      "id, headline, short_title, writer_name, published_at, content, content_html, image_url, blog_reader_types(name, slug)"
    )
    .order("published_at", { ascending: false });

  const blogs = (data as BlogRow[] | null) || [];
  const latestBlog = blogs[0] || null;
  const previousBlogs = latestBlog ? blogs.slice(1) : [];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_42%,_#ffffff_100%)]">
      <section className="relative overflow-hidden px-6 py-24">
        <div className="absolute inset-0">
          <div className="absolute left-[-120px] top-[-60px] h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute right-[-90px] top-[18%] h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">
            MentBridge Blog
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-bold tracking-tight text-slate-950 md:text-6xl">
            Practical learning for focused readers across product, growth, and leadership.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Explore the latest MentBridge writing, starting with the newest story and then
            browsing the full archive below.
          </p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl space-y-10">
          {!latestBlog ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">
              No blogs published yet.
            </div>
          ) : (
            <>
              <article className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
                <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
                  {latestBlog.image_url && (
                    <img
                      src={latestBlog.image_url}
                      alt={latestBlog.headline}
                      className="h-full min-h-[320px] w-full object-cover"
                    />
                  )}
                  <div className="p-8 lg:p-10">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                      Latest Blog
                    </span>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">
                      {latestBlog.headline}
                    </h2>
                    <p className="mt-3 text-sm text-slate-500">{latestBlog.short_title}</p>
                    <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-400">
                      <span>{latestBlog.writer_name}</span>
                      <span>{new Date(latestBlog.published_at).toLocaleDateString()}</span>
                      <span>{latestBlog.blog_reader_types?.name || "General readers"}</span>
                    </div>
                    <p className="mt-6 text-[15px] leading-8 text-slate-600">
                      {createBlogExcerpt(latestBlog.content_html || latestBlog.content, 260)}
                    </p>
                    <Link
                      href={getBlogPath(latestBlog.blog_reader_types?.slug, latestBlog.headline)}
                      className="mt-8 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Read Latest Blog
                    </Link>
                  </div>
                </div>
              </article>

              <section>
                <div className="mb-6">
                  <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                    Previous blogs
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Browse older stories from the MentBridge editorial archive.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {previousBlogs.map((blog) => (
                    <article
                      key={blog.id}
                      className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)]"
                    >
                      {blog.image_url && (
                        <img
                          src={blog.image_url}
                          alt={blog.headline}
                          className="h-56 w-full object-cover"
                        />
                      )}

                      <div className="p-6">
                        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                          <span>{blog.blog_reader_types?.name || "General readers"}</span>
                          <span>{new Date(blog.published_at).toLocaleDateString()}</span>
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                          {blog.headline}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">{blog.short_title}</p>
                        <p className="mt-4 text-sm leading-7 text-slate-600">
                          {createBlogExcerpt(blog.content_html || blog.content, 170)}
                        </p>
                        <Link
                          href={getBlogPath(blog.blog_reader_types?.slug, blog.headline)}
                          className="mt-6 inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          Read Blog
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
