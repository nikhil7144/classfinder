"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import FeedItem from "@/components/spaces/FeedItem";
import { FeedPost, fetchMyFeed } from "@/lib/spaces";

/**
 * A parent's feed: coaches they follow, and coaches in their city teaching
 * what they said they are looking for.
 *
 * This replaces nothing — FollowedSpaces above it is still the roster, the
 * shortcut to a particular coach's page. This is the reading surface, which
 * following did not have until now.
 *
 * Renders nothing when it is empty. A parent who follows nobody and has not
 * filled in a requirement has no feed, and a section explaining that is worse
 * than no section: the two things that would fill it are already asked for
 * elsewhere on this page.
 */
export default function InterestFeed() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  // The first page loads inside the effect with an alive flag, matching
  // FollowedSpaces; refresh() is the same read triggered by a reaction, which
  // is an event and not a render.
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const rows = await fetchMyFeed();
      if (!alive) return;
      setPosts(rows);
      setDone(rows.length < 24);
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const rows = await fetchMyFeed();
    setPosts(rows);
    setDone(rows.length < 24);
  }, []);

  const loadMore = async () => {
    if (!posts?.length || loadingMore) return;
    setLoadingMore(true);
    const older = await fetchMyFeed(posts[posts.length - 1].createdAt);
    setLoadingMore(false);
    if (older.length < 24) setDone(true);
    setPosts([...posts, ...older]);
  };

  if (!posts?.length) return null;

  const suggested = posts.some((p) => p.reason === "interest");

  return (
    <section className="cf-card p-7">
      <h2 className="cf-display text-lg text-ink">From coaches near you</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {suggested
          ? "Coaches you follow, and others in your city teaching what you're looking for."
          : "The latest from the coaches you follow."}
      </p>

      <div className="mt-6 space-y-8">
        {posts.map((post) => (
          <FeedItem key={post.id} post={post} canReact onChanged={refresh} />
        ))}
      </div>

      {!done && (
        <button onClick={loadMore} disabled={loadingMore} className="cf-btn-ghost mt-6">
          {loadingMore ? "Loading…" : "Show older posts"}
        </button>
      )}

      {!suggested && (
        <p className="mt-6 text-xs text-faint">
          Tell us what you&apos;re looking for on{" "}
          <Link href="/account/profile" className="font-semibold text-gold hover:text-accent-ink">
            your profile
          </Link>{" "}
          and coaches teaching it will show up here too.
        </p>
      )}
    </section>
  );
}
