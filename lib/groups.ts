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
  society_name: string;
  student_count: number;
  notes: string | null;
  member_count: number;
  expires_at: string;
  is_open: boolean;
  already_member: boolean;
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

export function groupShareUrl(id: string): string {
  if (typeof window === "undefined") return `/groups/${id}`;
  return `${window.location.origin}/groups/${id}`;
}
