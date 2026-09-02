"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/spaces/PostCard";
import { Space, SpacePost, fetchFeed, fetchSpace, toggleFollow } from "@/lib/spaces";

/**
 * A Space as a parent sees it.
 *
 * Its own route rather than a section of the profile: a Space pages through
 * posts and the profile does not, and a coach's posts should be linkable
 * without dragging their fees and availability along with them.
 */
export default function SpacePage() {
  const providerId = String(useParams().id);

  const [space, setSpace] = useState<Space | null>(null);
  const [posts, setPosts] = useState<SpacePost[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setMe(auth.user?.id ?? null);

    const { space: found } = await fetchSpace(providerId);
    setSpace(found);

    if (found) {
      const { posts: rows } = await fetchFeed(found.id);
      setPosts(rows);
    }

    setLoading(false);
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const follow = async () => {
    if (!space) return;
    setBusy(true);
    setError("");
    const message = await toggleFollow(space.id, space.i_follow);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    load();
  };

  if (loading) return <div className="min-h-screen bg-bg" />;

  if (!space) {
    return (
      <main className="min-h-screen bg-bg">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="cf-card p-8 text-center">
            <p className="text-ink">This Space isn&apos;t available.</p>
            <p className="mt-2 text-sm text-muted">
              It may have been taken down, or the listing may still be under review.
            </p>
            <Link href="/search" className="cf-btn-ghost mt-6">
              Find classes
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <header className="cf-card p-8">
          <div className="flex flex-wrap items-start gap-5">
            {space.photo_url ? (
              <img
                src={space.photo_url}
                alt=""
                className="h-20 w-20 shrink-0 rounded-2xl border border-line object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-2xl font-semibold text-faint">
                {(space.display_name || "?").charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="cf-eyebrow">Space</p>
              <h1 className="cf-display mt-2 text-3xl text-ink">
                {space.display_name || "Unnamed"}
              </h1>
              {(space.headline || space.category_name) && (
                <p className="mt-1 text-muted">{space.headline || space.category_name}</p>
              )}
              <p className="mt-3 font-mono text-xs text-faint">
                {space.follower_count} {space.follower_count === 1 ? "follower" : "followers"} ·{" "}
                {space.post_count} posts
              </p>
            </div>
          </div>

          {space.about && (
            <p className="mt-5 leading-relaxed whitespace-pre-wrap text-muted">{space.about}</p>
          )}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            {space.is_mine ? (
              <Link href="/dashboard/space" className="cf-btn-primary">
                Manage my Space
              </Link>
            ) : me ? (
              <button
                type="button"
                onClick={follow}
                disabled={busy}
                className={space.i_follow ? "cf-btn-ghost" : "cf-btn-primary"}
              >
                {space.i_follow ? "Following" : "Follow"}
              </button>
            ) : (
              <Link href="/login" className="cf-btn-primary">
                Log in to follow
              </Link>
            )}

            <Link href={`/provider/${space.provider_id}`} className="cf-btn-ghost">
              Profile &amp; fees
            </Link>
          </div>
        </header>

        {posts.length === 0 ? (
          <div className="cf-card p-8 text-center">
            <p className="text-ink">Nothing posted yet.</p>
            <p className="mt-2 text-sm text-muted">
              {space.i_follow
                ? "You're following, so this is where their photos and videos will appear."
                : "Follow to see photos and videos of their classes when they post them."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                mine={space.is_mine}
                canReact={Boolean(me) && !space.is_mine}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
