import { supabase } from "@/lib/supabase";

/**
 * A provider's own page.
 *
 * There is no comments wall, deliberately — see the header of
 * db/2026-09-04-phase3a-spaces.sql. Reactions are the whole of what a viewer
 * can leave behind; anything they want to say goes through the enquiry thread
 * that already exists for saying it.
 */
export type Space = {
  id: string;
  provider_id: string;
  display_name: string | null;
  photo_url: string | null;
  headline: string | null;
  about: string | null;
  category_name: string | null;
  follower_count: number;
  post_count: number;
  i_follow: boolean;
  is_mine: boolean;
  is_suspended: boolean;
  /** Only ever populated for the owner. */
  suspended_reason: string | null;
};

export type SpacePost = {
  id: string;
  kind: "photo" | "video";
  body: string | null;
  image_url: string | null;
  youtube_id: string | null;
  created_at: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  likes: number;
  wows: number;
  surprises: number;
  my_reaction: Reaction | null;
  i_reported: boolean;
};

/**
 * Three, and no heart.
 *
 * A page about other people's children is the wrong place for the affection
 * register. These three say everything a parent needs to say about a drill or
 * a technique video, and none of them says anything about a child.
 */
export type Reaction = "like" | "wow" | "surprise";

export const REACTIONS: { value: Reaction; emoji: string; label: string }[] = [
  { value: "like", emoji: "👍", label: "Like" },
  { value: "wow", emoji: "🤩", label: "Wow" },
  { value: "surprise", emoji: "😮", label: "Surprise" },
];

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "child_safety", label: "Unsafe for children" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misleading", label: "Misleading or false claim" },
  { value: "not_theirs", label: "Not their work" },
  { value: "spam", label: "Spam or advertising" },
  { value: "other", label: "Something else" },
];

/** Posts hidden automatically once this many people report one. Mirrors SQL. */
export const AUTOHIDE_AFTER_REPORTS = 3;

export const MAX_BODY = 2000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------

/**
 * Every form YouTube hands out, reduced to the 11 characters that identify
 * the video.
 *
 * Parsed once here, on the way in, and only the id is stored. Keeping
 * whatever the coach pasted would mean the player, the thumbnail and any
 * duplicate check each re-parsing a URL that might be a watch link, a
 * youtu.be link, a Short, an embed, or any of those carrying a playlist and a
 * timestamp.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Already an id.
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/live\/([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/** Google's own thumbnail, so nothing is stored or served by us. */
export const youTubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** The privacy-mode player: no cookie until the viewer presses play. */
export const youTubeEmbed = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;

export const youTubeWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

// ---------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------

export async function fetchSpace(providerId: string) {
  const { data, error } = await supabase.rpc("get_space", { p_provider_id: providerId });
  if (error) return { space: null as Space | null, error: error.message };
  return { space: (data as Space | null) ?? null, error: null };
}

export async function fetchFeed(spaceId: string, before?: string | null) {
  const { data, error } = await supabase.rpc("space_feed", {
    p_space_id: spaceId,
    p_limit: 30,
    p_before: before ?? null,
  });
  if (error) return { posts: [] as SpacePost[], error: error.message };
  return { posts: (data as SpacePost[]) || [], error: null };
}

/** Null clears it. One call for set, change and remove. */
export async function setReaction(postId: string, reaction: Reaction | null) {
  const { error } = await supabase.rpc("set_reaction", {
    p_post_id: postId,
    p_reaction: reaction,
  });
  return error?.message ?? null;
}

export async function toggleFollow(spaceId: string, following: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Log in to follow.";

  const { error } = following
    ? await supabase
        .from("space_followers")
        .delete()
        .eq("space_id", spaceId)
        .eq("user_id", auth.user.id)
    : await supabase.from("space_followers").insert({ space_id: spaceId, user_id: auth.user.id });

  return error?.message ?? null;
}

export async function reportPost(postId: string, reason: string, note: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Log in to report.";

  const { error } = await supabase.from("space_reports").insert({
    post_id: postId,
    reporter_id: auth.user.id,
    reason,
    note: note.trim() || null,
  });

  // The one-report-per-person rule is a unique index, so a second attempt
  // arrives here rather than as a silent no-op.
  if (error?.code === "23505") return "You've already reported this.";
  return error?.message ?? null;
}

/** "3 days ago" / "just now" — a feed reads worse with exact timestamps. */
export function postAge(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 2) return "just now";
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} hr ago`;
  const days = Math.floor(mins / (60 * 24));
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------
// Feeds (phase 3B)
//
// Two reads over the same posts, for two different audiences. See the header
// of db/2026-09-05-phase3b-feeds.sql for why the public one lags and why both
// are scoped to a city rather than an area.
// ---------------------------------------------------------------------

export type City = {
  id: string;
  name: string;
  state: string | null;
  coach_count: number;
};

/** A post as it arrives from a feed: the post, plus who wrote it. */
export type FeedPost = {
  id: string;
  provider_id: string;
  display_name: string | null;
  photo_url: string | null;
  category_name: string | null;
  kind: "photo" | "video";
  body: string | null;
  image_url: string | null;
  youtube_id: string | null;
  created_at: string;
  likes: number;
  wows: number;
  surprises: number;
  /** Signed-in feed only; the public feed cannot know. */
  my_reaction?: Reaction | null;
  i_reported?: boolean;
  /** Signed-in feed only. Why this post is in front of me. */
  reason?: "following" | "interest";
};

/**
 * A feed row in the shape PostCard already renders.
 *
 * The feed carries the coach's identity alongside each post; PostCard is
 * about the post alone and is used on the Space page too. The attribution
 * header is the feed's job, so nothing here needs to change to reuse it.
 */
export function feedPostToSpacePost(row: FeedPost): SpacePost {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    image_url: row.image_url,
    youtube_id: row.youtube_id,
    created_at: row.created_at,
    // A feed never carries hidden posts — both functions filter them out, and
    // the owner's view of their own hidden post is the Space page's job.
    is_hidden: false,
    hidden_reason: null,
    likes: row.likes,
    wows: row.wows,
    surprises: row.surprises,
    my_reaction: row.my_reaction ?? null,
    i_reported: row.i_reported ?? false,
  };
}

/** Followed coaches, plus coaches in their city teaching what they want. */
export async function fetchMyFeed(before?: string | null) {
  const { data, error } = await supabase.rpc("my_space_feed", {
    p_limit: 24,
    p_before: before ?? null,
  });
  if (error) return { posts: [] as FeedPost[], error: error.message };
  return { posts: (data as FeedPost[]) || [], error: null };
}
