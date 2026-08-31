import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServerAdmin } from "@/lib/supabase-server";
import { slugifyStartupName } from "@/lib/post-links";

type PageProps = {
  params: Promise<{
    startupSlug: string;
    postId: string;
  }>;
};

type PostRow = {
  id: string;
  startup_id: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
};

type StartupRow = {
  id: string;
  user_id: string;
  startup_name: string | null;
  headline: string | null;
  logo_url: string | null;
};

async function loadPostWithStartup(postId: string) {
  const { data: post } = await supabaseServerAdmin
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (!post) return null;

  const { data: startup } = await supabaseServerAdmin
    .from("startups")
    .select("id, user_id, startup_name, headline, logo_url")
    .eq("user_id", post.startup_id)
    .maybeSingle();

  if (!startup) return null;

  return {
    post: post as PostRow,
    startup: startup as StartupRow,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { postId } = await params;
  const data = await loadPostWithStartup(postId);

  if (!data) {
    return {
      title: "Post not found | BridgeUp",
    };
  }

  const title = `${data.startup.startup_name || "Startup"} update | BridgeUp`;
  const description =
    data.post.description?.slice(0, 155) || data.startup.headline || "Startup update on BridgeUp";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: data.post.image_url ? [data.post.image_url] : undefined,
    },
  };
}

export default async function StartupPostPage({ params }: PageProps) {
  const { startupSlug, postId } = await params;
  const data = await loadPostWithStartup(postId);

  if (!data) {
    notFound();
  }

  const expectedSlug = slugifyStartupName(data.startup.startup_name);

  if (startupSlug !== expectedSlug) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_38%,_#ffffff_100%)] py-12">
      <div className="mx-auto max-w-4xl px-6">
        <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          {data.post.image_url && (
            <img
              src={data.post.image_url}
              alt={data.startup.startup_name || "Startup post"}
              className="h-[360px] w-full object-cover"
            />
          )}

          <div className="p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-indigo-500">
              Startup Update
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
              {data.startup.startup_name}
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {new Date(data.post.created_at).toLocaleDateString()}
            </p>

            {data.startup.headline && (
              <p className="mt-5 text-lg text-slate-600">{data.startup.headline}</p>
            )}

            <div className="mt-8 border-t border-slate-200 pt-8">
              <p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                {data.post.description || "No update text provided."}
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={`/startup/${data.startup.id}`}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                View Startup
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
