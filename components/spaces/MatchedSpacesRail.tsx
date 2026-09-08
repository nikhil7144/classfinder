"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FeedPost, fetchMyFeed, youTubeThumbnail } from "@/lib/spaces";

/**
 * Posts from coaches a parent has not chosen, surfaced because of what they
 * said they were looking for.
 *
 * my_space_feed() already answers this — it tags every row `following` or
 * `interest`, where interest means a coach in their city teaching one of the
 * services on their profile. Nothing is matched here; this is a second
 * reading of a list the database already built, laid out sideways.
 *
 * Only the interest rows. The ones from coaches they follow are not a
 * discovery surface, they are the subscription, and InterestFeed on the
 * dashboard is where those are read at length.
 *
 * Renders nothing for a signed-out visitor — fetchMyFeed has no token and
 * answers with an empty list — and nothing for a parent who has not said what
 * they want. A rail explaining why it is empty would be worse than its
 * absence: the profile that fills it is asked for on the dashboard already.
 */

const MAX = 12;

function Thumb({ post }: { post: FeedPost }) {
  const src = post.imageUrl ?? (post.youtubeId ? youTubeThumbnail(post.youtubeId) : null);

  if (!src) {
    // A text post still earns its card. The body is the whole content, so it
    // takes the space the picture would have had rather than sitting under a
    // grey placeholder pretending an image failed.
    return (
      <div className="flex h-32 items-start bg-surface-2 p-4">
        <p className="line-clamp-4 text-sm leading-6 text-muted">{post.body}</p>
      </div>
    );
  }

  return (
    <div className="relative h-32 w-full shrink-0 bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-32 w-full object-cover" loading="lazy" />
      {post.kind === "video" && (
        <span className="absolute bottom-2 right-2 rounded-full bg-bg/80 px-2 py-0.5 text-[0.65rem] font-semibold text-ink">
          Video
        </span>
      )}
    </div>
  );
}

export default function MatchedSpacesRail() {
  const [posts, setPosts] = useState<FeedPost[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const rows = await fetchMyFeed();
      if (!alive) return;
      setPosts(rows.filter((p) => p.reason === "interest").slice(0, MAX));
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-6 pb-20">
      <p className="cf-eyebrow">Because of what you&apos;re looking for</p>
      <h2 className="cf-display mt-3 text-2xl text-ink">Coaches you haven&apos;t met yet</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Teaching what you said you want, in your city. You aren&apos;t following any of them.
      </p>

      {/* Bleeds to the viewport edges so a card is visibly cut off, which is
          what tells someone the row scrolls. The padding is restored inside,
          so the first card still lines up with the heading above it. */}
      <div className="-mx-6 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/provider/${post.providerId}/space`}
            className="cf-card w-[15rem] shrink-0 snap-start overflow-hidden transition hover:border-faint"
          >
            <Thumb post={post} />

            <div className="flex items-center gap-2.5 p-4">
              {post.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.photoUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-lg border border-line object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-3 text-xs font-semibold text-faint">
                  {(post.displayName || "?").charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {post.displayName || "Unnamed"}
                </p>
                {post.categoryName && (
                  <p className="truncate text-xs text-muted">{post.categoryName}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
