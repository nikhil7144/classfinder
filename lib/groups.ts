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

/** A group needs this many members before providers can see it. */
export const MEMBERS_TO_ACTIVATE = 3;

export const DEFAULT_VALIDITY_DAYS = 10;
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
