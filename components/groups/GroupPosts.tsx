"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MAX_IMAGE_BYTES } from "@/lib/spaces";
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPosts(await fetchGroupPosts(groupId));
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function post() {
    if (!file) {
      setError("Choose a photo to post.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That photo is over 5 MB. Try a smaller one.");
      return;
    }
    setSaving(true);
    setError(null);

    /**
     * The photo goes straight to Storage, not through the API, the same way a
     * Space photo or an event poster does. The first folder segment is the
     * uploader's own id, which is all the bucket checks; whether they may post
     * to this group is the insert policy's call.
     */
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      setError("Log in again.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${auth.user.id}/${groupId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("group-media")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      setSaving(false);
      setError(`The photo didn't upload: ${uploadError.message}`);
      return;
    }

    const imageUrl = supabase.storage.from("group-media").getPublicUrl(path).data.publicUrl;

    const { error: failed } = await addGroupPost(groupId, {
      kind: "photo",
      body: body.trim() || null,
      imageUrl,
    });

    setSaving(false);
    if (failed) {
      setError(failed);
      return;
    }

    setBody("");
    setFile(null);
    // A file input cannot be cleared by state; a new key gives a fresh one.
    setFileKey((k) => k + 1);
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
            Photo
          </label>
          <input
            key={fileKey}
            id="post-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="cf-input mt-1.5"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1.5 text-xs text-faint">JPEG, PNG, WebP or AVIF, up to 5 MB.</p>

          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="The photo you're about to post"
              className="mt-3 max-h-64 rounded-2xl object-cover"
            />
          )}

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
