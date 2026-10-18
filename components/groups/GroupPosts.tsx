"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addGroupPost,
  fetchGroupPosts,
  setGroupPostVisibility,
  type GroupPost,
} from "@/lib/api/my-groups";

type Props = {
  groupId: string;
  /** Null for a signed-out reader, who sees only what authors opened. */
  me: string | null;
  isMember: boolean;
};

/**
 * What the group has been doing.
 *
 * Every post starts at `members`. A parent putting a photo of their child
 * into their group should have it stay inside the group unless they decide
 * otherwise, and the default is the decision most of them will never revisit.
 *
 * The toggle is on the author's own posts and nobody else's — not the
 * creator's. A creator who could promote any post could publish a photo of
 * another family's child, and that parent agreed to share with their group
 * rather than with the world. The API enforces it; this only renders it.
 */
export default function GroupPosts({ groupId, me, isMember }: Props) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPosts(await fetchGroupPosts(groupId));
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (!imageUrl.trim()) {
      setError("A post needs a photo for now.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: failed } = await addGroupPost(groupId, {
      kind: "photo",
      body: body.trim() || null,
      imageUrl: imageUrl.trim(),
    });

    setSaving(false);
    if (failed) {
      setError(failed);
      return;
    }

    setBody("");
    setImageUrl("");
    await load();
  }

  async function toggle(p: GroupPost) {
    const next = p.visibility === "public" ? "members" : "public";
    const { error: failed } = await setGroupPostVisibility(p.id, next);
    if (failed) {
      setError(failed);
      return;
    }
    await load();
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-faint">Loading posts…</p>;
  }

  return (
    <div className="space-y-6">
      {isMember && (
        <div className="cf-card p-6">
          <h2 className="cf-display text-lg text-ink">Post to your group</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Only the families in this group see it, unless you choose to show it on your
            group&apos;s page.
          </p>

          <label htmlFor="post-image" className="mt-4 block text-sm font-medium text-muted">
            Photo link
          </label>
          <input
            id="post-image"
            className="cf-input mt-1.5"
            placeholder="https://…"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />

          <label htmlFor="post-body" className="mt-4 block text-sm font-medium text-muted">
            Say something about it
          </label>
          <textarea
            id="post-body"
            className="cf-input mt-1.5 min-h-24"
            placeholder="First Sunday session at the clubhouse…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <button
            onClick={post}
            disabled={saving}
            className="cf-btn-primary mt-5"
            aria-busy={saving}
          >
            {saving ? "Posting…" : "Post"}
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="py-10 text-center text-sm leading-6 text-faint">
          {isMember
            ? "Nothing posted yet. Photos from your sessions go here."
            : "This group has not shown anything publicly yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((p) => (
            <article key={p.id} className="cf-card overflow-hidden">
              {p.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.imageUrl}
                  alt=""
                  className="h-48 w-full object-cover"
                  loading="lazy"
                />
              )}

              <div className="p-5">
                {p.body && <p className="text-sm leading-6 text-ink">{p.body}</p>}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={`cf-badge ${
                      p.visibility === "public" ? "cf-badge-ok" : "cf-badge-neutral"
                    }`}
                  >
                    {p.visibility === "public" ? "On the group page" : "Members only"}
                  </span>

                  {/* The author's own post and nobody else's. */}
                  {me && isMember && (
                    <button
                      onClick={() => toggle(p)}
                      className="text-sm font-semibold text-gold transition hover:text-accent-ink"
                    >
                      {p.visibility === "public" ? "Make it members only" : "Show on group page"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
