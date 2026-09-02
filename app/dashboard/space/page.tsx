"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ProviderTabs from "@/components/provider/ProviderTabs";
import PostCard from "@/components/spaces/PostCard";
import { useAlerts } from "@/components/AlertsBadge";
import {
  AUTOHIDE_AFTER_REPORTS,
  MAX_BODY,
  MAX_IMAGE_BYTES,
  Space,
  SpacePost,
  fetchFeed,
  fetchSpace,
  parseYouTubeId,
  youTubeThumbnail,
} from "@/lib/spaces";

type Draft = "photo" | "video";

/**
 * The coach's own Space.
 *
 * Composing and reading sit on one screen rather than two, because the thing
 * a coach most needs when deciding what to post next is what they posted last.
 */
export default function MySpacePage() {
  const router = useRouter();
  const alerts = useAlerts();

  const [space, setSpace] = useState<Space | null>(null);
  const [posts, setPosts] = useState<SpacePost[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState<Draft>("photo");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/login");
      return;
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("id, approved, is_suspended")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!provider) {
      setBlocked("Finish your listing and your Space appears here.");
      setLoading(false);
      return;
    }

    const { space: found } = await fetchSpace(provider.id);
    if (!found) {
      setBlocked(
        provider.approved
          ? "Your Space isn't available right now."
          : "Your listing is still being reviewed. Your Space opens as soon as it's approved."
      );
      setLoading(false);
      return;
    }

    setSpace(found);
    const { posts: rows } = await fetchFeed(found.id);
    setPosts(rows);
    setLoading(false);
  }, [router]);

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

  const videoId = parseYouTubeId(videoUrl);

  const publish = async () => {
    if (!space) return;
    setError("");

    if (kind === "photo" && !file) return setError("Choose a photo to post.");
    if (kind === "video" && !videoId) {
      return setError("That doesn't look like a YouTube link. Paste the link from the video.");
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      return setError("That photo is over 5 MB. Try a smaller one.");
    }

    setPosting(true);

    let imageUrl: string | null = null;

    if (kind === "photo" && file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${space.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("space-media")
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setPosting(false);
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage.from("space-media").getPublicUrl(path);
      imageUrl = data.publicUrl;
    }

    const { error: insertError } = await supabase.from("space_posts").insert({
      space_id: space.id,
      kind,
      body: body.trim() || null,
      image_url: kind === "photo" ? imageUrl : null,
      youtube_id: kind === "video" ? videoId : null,
    });

    setPosting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setBody("");
    setFile(null);
    setVideoUrl("");
    load();
  };

  const remove = async (postId: string) => {
    const { error: deleteError } = await supabase.from("space_posts").delete().eq("id", postId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  };

  if (loading) return <div className="min-h-screen bg-bg" />;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <ProviderTabs messageCount={Number(alerts?.unread_threads || 0)} />

        <header className="cf-card p-8">
          <p className="cf-eyebrow">My Space</p>
          <h1 className="cf-display mt-3 text-3xl text-ink">Show parents what you do</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">
            Drills, technique, what a session looks like, what your students have won. A listing
            says what you offer; this is where parents see how you teach.
          </p>

          {space && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="cf-badge cf-badge-neutral">
                {space.follower_count} {space.follower_count === 1 ? "follower" : "followers"}
              </span>
              <span className="cf-badge cf-badge-neutral">{space.post_count} posts</span>
              <Link
                href={`/provider/${space.provider_id}/space`}
                className="text-sm font-semibold text-gold transition hover:text-accent-ink"
              >
                View it as parents see it →
              </Link>
            </div>
          )}
        </header>

        {blocked ? (
          <div className="cf-card p-8 text-center">
            <p className="text-muted">{blocked}</p>
            <Link href="/dashboard" className="cf-btn-ghost mt-6">
              Back to my listing
            </Link>
          </div>
        ) : (
          <>
            {space?.is_suspended && (
              <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger">
                <p className="font-semibold">Your Space is suspended.</p>
                <p className="mt-1">
                  {space.suspended_reason ||
                    "It isn't visible to parents. Get in touch if you think this is a mistake."}
                </p>
              </div>
            )}

            <section className="cf-card space-y-4 p-7">
              <h2 className="cf-display text-lg text-ink">Add a post</h2>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="cf-pill px-4 py-2 text-sm"
                  data-selected={kind === "photo"}
                  onClick={() => setKind("photo")}
                >
                  Photo
                </button>
                <button
                  type="button"
                  className="cf-pill px-4 py-2 text-sm"
                  data-selected={kind === "video"}
                  onClick={() => setKind("video")}
                >
                  YouTube video
                </button>
              </div>

              {error && (
                <div className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              {kind === "photo" ? (
                <div>
                  <label className="mb-2 block text-sm text-muted">Photo</label>
                  <div className="flex items-center gap-4">
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        className="h-24 w-32 rounded-2xl border border-line object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-32 items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2 text-xs text-faint">
                        None
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-faint">Up to 5 MB. JPG, PNG or WebP.</p>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm text-muted">YouTube link</label>
                  <input
                    className="cf-input"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-faint">
                    Videos stay on YouTube — we only save the link, so nothing here counts against
                    your storage and playback is as fast as YouTube is.
                  </p>
                  {videoUrl.trim() && !videoId && (
                    <p className="mt-2 text-sm text-danger">
                      Couldn&apos;t find a video in that link.
                    </p>
                  )}
                  {videoId && (
                    <img
                      src={youTubeThumbnail(videoId)}
                      alt=""
                      className="mt-3 h-32 rounded-2xl border border-line object-cover"
                    />
                  )}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-muted">Say something (optional)</label>
                <textarea
                  className="cf-input min-h-24"
                  maxLength={MAX_BODY}
                  placeholder="What is this, and what should a parent notice in it?"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* The rule, before it is enforced rather than after. */}
              <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
                Parents and children are the audience here. Post only what you have the right to
                post, and don&apos;t post images of other people&apos;s children without their
                parents&apos; permission. Anyone can report a post; {AUTOHIDE_AFTER_REPORTS}{" "}
                reports hide it straight away, pending review. Breaking this can get your whole
                Space suspended, and a suspended Space is not visible to anyone.
              </p>

              <button
                type="button"
                onClick={publish}
                disabled={posting || space?.is_suspended}
                className="cf-btn-primary w-full"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </section>

            <section className="space-y-3">
              <h2 className="cf-display text-lg text-ink">Your posts</h2>
              {posts.length === 0 ? (
                <div className="cf-card p-8 text-center">
                  <p className="text-ink">Nothing here yet.</p>
                  <p className="mt-2 text-sm text-muted">
                    One photo of a session, or one video explaining a technique, tells a parent
                    more than a paragraph of your listing does.
                  </p>
                </div>
              ) : (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    mine
                    canReact={false}
                    onChanged={load}
                    onDelete={remove}
                  />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
