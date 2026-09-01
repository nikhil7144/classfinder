import { redirect } from "next/navigation";

/**
 * Conversations moved into the group itself, as the Messages tab. Links to the
 * old per-conversation page are in the wild — shared, bookmarked, sitting in
 * old notification copy — so they land on the right thread rather than 404.
 */
export default async function LegacyGroupChatPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  redirect(`/groups/${id}?tab=messages&t=${requestId}`);
}
