export type MyGroup = {
  id: string;
  service_name: string;
  area_name: string;
  city_name: string;
  society_name: string;
  student_count: number;
  member_count: number;
  expires_at: string;
  closed_at: string | null;
  is_creator: boolean;
  is_active: boolean;
  pending_requests: number;
  created_at: string;
};

export type GroupInvite = {
  id: string;
  service_name: string;
  area_name: string;
  city_name: string;
  /** Withheld from a coach who hasn't been accepted — see phase2k. */
  society_name: string | null;
  student_count: number;
  notes: string | null;
  member_count: number;
  expires_at: string;
  is_open: boolean;
  already_member: boolean;
};

export type ThreadStatus = "pending" | "accepted" | "declined";

/** One coach's conversation with a group, as the inbox lists it. */
export type GroupThread = {
  request_id: string;
  provider_id: string;
  /**
   * The OTHER side, as this viewer may know them — the coach if you are the
   * parent, the group if you are the coach. Was provider_name, which showed a
   * coach their own name as the person they were talking to (phase2p).
   */
  title: string;
  subtitle: string;
  photo_url: string | null;
  /** The opening pitch. It is what the parent judged, so it stays visible. */
  pitch: string;
  status: ThreadStatus;
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  message_count: number;
  unread: boolean;
  is_creator: boolean;
};

export type ProviderGroup = {
  id: string;
  service_category_id: string;
  service_name: string;
  area_id: string;
  area_name: string;
  city_name: string;
  student_count: number;
  notes: string | null;
  member_count: number;
  expires_at: string;
  created_at: string;
  already_requested: boolean;
};

/**
 * Members needed before coaches can see a group. Two neighbours splitting a
 * coach is already a group, and already a better deal for both sides than one
 * family alone — requiring three made the commonest real case impossible.
 *
 * Mirrored in the database (active_groups, is_group_active,
 * groups_for_provider); they must move together.
 */
export const MEMBERS_TO_ACTIVATE = 2;

/** A group is for more than one child, by definition. */
export const MIN_STUDENTS = 2;

export const DEFAULT_VALIDITY_DAYS = 10;

/** How long a group can run for, chosen at creation. */
export const VALIDITY_OPTIONS = [
  { days: 7, label: "1 week" },
  { days: 10, label: "10 days" },
  { days: 21, label: "3 weeks" },
  { days: 30, label: "1 month" },
];
export const EXTEND_DAYS = 10;

export function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** "3 days left" / "expires today" / "expired" */
export function expiryLabel(expiresAt: string): string {
  const d = daysLeft(expiresAt);
  if (d < 0) return "Expired";
  if (d === 0) return "Expires today";
  if (d === 1) return "1 day left";
  return `${d} days left`;
}

/**
 * Progress towards being visible to coaches.
 *
 * Stated as "1 of 3 members" rather than "2 more needed": the creator counts
 * as the first member, and a bare countdown left people unsure whether they
 * were included in it.
 */
export function activationLabel(memberCount: number): string {
  if (memberCount >= MEMBERS_TO_ACTIVATE) return "Visible to coaches";
  return `${memberCount} of ${MEMBERS_TO_ACTIVATE} members`;
}

/** How many more people are needed, for prompts that ask for them. */
export function membersStillNeeded(memberCount: number): number {
  return Math.max(0, MEMBERS_TO_ACTIVATE - memberCount);
}

/** "now" / "14:05" / "Tue" / "3 Sep" — the density an inbox row can carry. */
export function inboxTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  const mins = (Date.now() - then.getTime()) / 60_000;
  if (mins < 1) return "now";
  if (mins < 60 * 12) return then.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (mins < 60 * 24 * 6) return then.toLocaleDateString(undefined, { weekday: "short" });
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * What the inbox row says under the coach's name. Falls back to the pitch,
 * because a thread with no replies yet still has something to show.
 */
export function threadPreview(t: GroupThread, myId: string | null): string {
  const body = t.last_message ?? t.pitch;
  const mine = t.last_message ? t.last_sender_id === myId : !t.is_creator;
  return mine ? `You: ${body}` : body;
}

export function groupShareUrl(id: string): string {
  if (typeof window === "undefined") return `/groups/${id}`;
  return `${window.location.origin}/groups/${id}`;
}
