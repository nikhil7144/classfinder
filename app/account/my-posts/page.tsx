"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { getStartupPostPath, isLongPost } from "@/lib/post-links";
import { supabase } from "@/lib/supabase";

type Post = {
  id: string;
  startup_id: string;
  image_url?: string | null;
  description?: string | null;
  created_at: string;
};

export default function MyPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [startupName, setStartupName] = useState<string | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPosts = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData?.user) {
        setLoading(false);
        return;
      }

      const { data: postRows } = await supabase
        .from("posts")
        .select("*")
        .eq("startup_id", userData.user.id)
        .order("created_at", { ascending: false });

      const { data: startup } = await supabase
        .from("startups")
        .select("startup_name")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      setPosts((postRows as Post[] | null) || []);
      setStartupName(startup?.startup_name || null);
      setLoading(false);
    };

    loadPosts();
  }, []);

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;

    await supabase.from("posts").delete().eq("id", id);
    setPosts((currentPosts) => currentPosts.filter((post) => post.id !== id));
  };

  const sharePost = async (postId: string) => {
    const postPath = getStartupPostPath(startupName, postId);
    const shareUrl =
      typeof window === "undefined" ? postPath : `${window.location.origin}${postPath}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedPostId(postId);
      window.setTimeout(() => setCopiedPostId((current) => (current === postId ? null : current)), 2000);
    } catch {
      alert("Unable to copy the post link.");
    }
  };

  if (loading) return <PageSkeleton variant="list" />;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-2xl font-semibold">My Posts</h1>

      {posts.length === 0 && <p className="text-gray-500">You haven&apos;t posted anything yet.</p>}

      <div className="space-y-8">
        {posts.map((post) => (
          <div key={post.id} className="rounded-xl bg-white p-6 shadow">
            {post.image_url && (
              <img
                src={post.image_url}
                alt="Post"
                className="mb-4 max-h-96 w-full rounded-lg object-cover"
              />
            )}

            <p className="mb-4 line-clamp-4 text-gray-800">{post.description}</p>

            {isLongPost(post.description, 160) && (
              <Link
                href={getStartupPostPath(startupName, post.id)}
                className="mb-4 inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
              >
                See more
              </Link>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-400">
                {new Date(post.created_at).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => sharePost(post.id)}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  {copiedPostId === post.id ? "Link Copied" : "Share Post Link"}
                </button>

                <button
                  onClick={() => deletePost(post.id)}
                  className="font-semibold text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
