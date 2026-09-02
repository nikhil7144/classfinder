"use client";

import Link from "next/link";
import PostCard from "@/components/spaces/PostCard";
import { FeedPost, feedPostToSpacePost } from "@/lib/spaces";

type Props = {
  post: FeedPost;
  /** False for a signed-out visitor, who can read but not react or report. */
  canReact: boolean;
  onChanged: () => void;
};

/**
 * One post in a feed, with the coach's name on it.
 *
 * On a Space page the coach is the page, so PostCard carries no attribution.
 * In a feed the attribution is the most important line: a parent scrolling
 * their city needs to know who this is and be one tap from the rest of them.
 */
export default function FeedItem({ post, canReact, onChanged }: Props) {
  return (
    <article className="space-y-3">
      <Link
        href={`/provider/${post.providerId}/space`}
        className="flex items-center gap-3 transition hover:opacity-80"
      >
        {post.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.photoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-line object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-3 font-semibold text-faint">
            {(post.displayName || "?").charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{post.displayName || "Unnamed"}</p>
          {post.categoryName && (
            <p className="truncate text-xs text-muted">{post.categoryName}</p>
          )}
        </div>

        {/* Why this is here. A parent should never have to guess whether they
            are looking at someone they chose or someone we suggested. */}
        {post.reason === "interest" && (
          <span className="cf-badge cf-badge-neutral shrink-0">Suggested</span>
        )}
      </Link>

      <PostCard
        post={feedPostToSpacePost(post)}
        mine={false}
        canReact={canReact}
        onChanged={onChanged}
      />
    </article>
  );
}
