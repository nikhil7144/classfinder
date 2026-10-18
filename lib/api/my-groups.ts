import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { supabase } from "@/lib/supabase";

/**
 * The group reads and writes that need the caller's token.
 *
 * Here rather than in ./client for the reason that module states: it imports
 * no Supabase client so a server component can use it, and these all need a
 * session. Same split as ./my-feed.
 */

export type GroupPost = components["schemas"]["GroupPostDto"];
export type PublicGroup = components["schemas"]["PublicGroupDto"];

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * A group's posts.
 *
 * A member gets all of them; anybody else gets only what an author opened to
 * the showcase. The API decides which, by reading as the caller — passing no
 * token is a valid call, not an error, because a stranger reading a published
 * group is the whole point of publishing.
 */
export async function fetchGroupPosts(groupId: string): Promise<GroupPost[]> {
  const token = await accessToken();

  try {
    const { data, error } = await api.GET("/api/v1/groups/{id}/posts", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: { path: { id: groupId } },
    });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** Post to a group. Members only — the API answers 403 otherwise. */
export async function addGroupPost(
  groupId: string,
  body: components["schemas"]["CreateGroupPostDto"],
): Promise<{ post?: GroupPost; error?: string }> {
  const token = await accessToken();
  if (!token) return { error: "Sign in first." };

  try {
    const { data, error } = await api.POST("/api/v1/groups/{id}/posts", {
      headers: { Authorization: `Bearer ${token}` },
      params: { path: { id: groupId } },
      body,
    });
    if (error || !data) return { error: "That did not save. Try again." };
    return { post: data };
  } catch {
    return { error: "Could not reach Aspire91. Try again." };
  }
}

/**
 * Open one of your own posts to the showcase, or close it again.
 *
 * Only the post's author, which the API enforces. A creator who could promote
 * any post could publish a photo of another family's child.
 */
export async function setGroupPostVisibility(
  postId: string,
  visibility: "members" | "public",
): Promise<{ post?: GroupPost; error?: string }> {
  const token = await accessToken();
  if (!token) return { error: "Sign in first." };

  try {
    const { data, error } = await api.PATCH("/api/v1/groups/posts/{postId}/visibility", {
      headers: { Authorization: `Bearer ${token}` },
      params: { path: { postId } },
      body: { visibility },
    });
    if (error || !data) return { error: "That did not save. Try again." };
    return { post: data };
  } catch {
    return { error: "Could not reach Aspire91. Try again." };
  }
}

/**
 * Show the group on Aspire91, or take it down.
 *
 * Creator only, and only once the group is live. The API answers 400 with the
 * reason when it is not, which is worth showing rather than swallowing.
 */
export async function publishGroup(
  groupId: string,
  body: components["schemas"]["PublishGroupDto"],
): Promise<{ group?: PublicGroup; error?: string }> {
  const token = await accessToken();
  if (!token) return { error: "Sign in first." };

  try {
    const { data, error } = await api.PATCH("/api/v1/groups/{id}/publish", {
      headers: { Authorization: `Bearer ${token}` },
      params: { path: { id: groupId } },
      body,
    });
    if (error || !data) {
      const message = (error as { message?: string } | undefined)?.message;
      return { error: message || "That did not save. Try again." };
    }
    return { group: data };
  } catch {
    return { error: "Could not reach Aspire91. Try again." };
  }
}
