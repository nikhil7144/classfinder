import { SERVICE_GROUP_LABEL } from "@/lib/requirements";

/**
 * Formatting and vocabulary for events, shared by the public pages and the
 * organiser's own screens.
 *
 * No API import and no Supabase import, so a server component rendering an
 * event page and a client component editing one use the same functions. A
 * date that formats differently on the two sides is a hydration warning at
 * best and two different answers at worst.
 */

/**
 * Every date is formatted in IST, explicitly.
 *
 * The server renders in UTC and the browser in whatever the reader's machine
 * says, so leaving the zone unstated makes the HTML and the hydrated DOM
 * disagree — for a 9am final in Pune that is a genuinely wrong time on the
 * screen, not just a warning in the console. This product is Indian and its
 * events happen in one zone; naming it here is more honest than pretending
 * the reader's clock is the authority.
 */
const IST = "Asia/Kolkata";

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const shortDayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "numeric",
  month: "short",
});

/** One colour per taxonomy group, matching the tokens in globals.css. */
export const GROUP_TONE: Record<string, string> = {
  sport: "var(--sport)",
  wellness_fitness: "var(--wellness)",
  mind_game: "var(--mind)",
  indoor_game: "var(--indoor)",
  dance: "var(--dance)",
  music: "var(--music)",
  acting: "var(--acting)",
  subject: "var(--subject)",
  exam_board: "var(--exam)",
};

export function groupTone(group?: string | null): string {
  return (group && GROUP_TONE[group]) || "var(--grad-2)";
}

export function groupLabel(group?: string | null): string {
  return (group && SERVICE_GROUP_LABEL[group]) || "Event";
}

/** "Sat, 12 Oct 2026, 9:00 am" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

export function formatDate(iso: string): string {
  return dayFmt.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return shortDayFmt.format(new Date(iso));
}

/**
 * The span in one line: "12 Oct, 9:00 am" or "12–14 Oct 2026" for a
 * multi-day event, because a tournament that runs a weekend is a date range
 * to a parent and two timestamps only to a database.
 */
export function formatWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (!endsAt) return formatDateTime(startsAt);

  const end = new Date(endsAt);
  const sameDay = dayFmt.format(start) === dayFmt.format(end);

  if (sameDay) {
    return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${shortDayFmt.format(start)} – ${dayFmt.format(end)}`;
}

/** The three lines of the poster's date tile. */
export function dateTile(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "₹800" — and "Free" rather than "₹0", which reads like a missing price. */
export function formatFee(amount: number | null): string {
  if (amount === null) return "Price on request";
  if (amount === 0) return "Free";
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** The cheapest way in, for a listing card. */
export function feeFrom(categories: { feeAmount: number | null }[]): string | null {
  const priced = categories.map((c) => c.feeAmount).filter((f): f is number => f !== null);
  if (priced.length === 0) return null;
  const min = Math.min(...priced);
  return min === 0 ? "Free" : `From ₹${min.toLocaleString("en-IN")}`;
}

/** "Ages 8–12", "Under 12", "12 and over", or nothing at all. */
export function formatAges(minAge: number | null, maxAge: number | null): string | null {
  if (minAge !== null && maxAge !== null) return `Ages ${minAge}–${maxAge}`;
  if (maxAge !== null) return `Under ${maxAge + 1}`;
  if (minAge !== null) return `${minAge} and over`;
  return null;
}

/** "12 of 40 taken", "Full", or nothing to say when it is uncapped. */
export function formatCapacity(capacity: number | null, entriesCount = 0): string {
  if (capacity === null) return entriesCount > 0 ? `${entriesCount} entered` : "Open entry";
  if (entriesCount >= capacity) return "Full";
  return `${entriesCount} of ${capacity} taken`;
}

export function isFull(capacity: number | null, entriesCount = 0): boolean {
  return capacity !== null && entriesCount >= capacity;
}

/**
 * When a family can no longer withdraw itself.
 *
 * The same fallback chain as `event_cancel_deadline` in 3K, and deliberately
 * only for display — the database refuses a late cancellation whatever this
 * says. A screen that cannot name the date would have to say "some deadline
 * applies", which is worse than a mirror that is checked on every save.
 */
export function cancelDeadline(event: {
  cancellationDeadline: string | null;
  bookingClosesAt: string | null;
  startsAt: string;
}): string {
  return event.cancellationDeadline ?? event.bookingClosesAt ?? event.startsAt;
}

/** How a payment reads on both registers. */
export const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "cf-badge-neutral" },
  paid: { label: "Paid", className: "cf-badge-ok" },
  refund_due: { label: "Refund due", className: "cf-badge-warn" },
  refunded: { label: "Refunded", className: "cf-badge-neutral" },
  waived: { label: "Waived", className: "cf-badge-neutral" },
};

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export type EventLike = {
  status: string;
  startsAt: string;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
  bookingMode: string;
};

export type EntryState =
  | { kind: "open"; note: string | null }
  | { kind: "not_yet"; note: string }
  | { kind: "closed"; note: string }
  | { kind: "external"; note: string | null }
  | { kind: "none"; note: null }
  | { kind: "cancelled"; note: string }
  | { kind: "over"; note: string };

/**
 * Whether a family can enter right now, and what to say if not.
 *
 * One function because four screens need the same answer — the card, the
 * poster, the entry button and the organiser's preview — and four copies of
 * "is it open yet" is how they end up disagreeing on a Saturday morning.
 *
 * `now` is a parameter so a server render and the client that hydrates it can
 * be handed the same instant instead of each reading its own clock.
 */
export function entryState(event: EventLike, now: Date = new Date()): EntryState {
  if (event.status === "cancelled") {
    return { kind: "cancelled", note: "This event has been cancelled." };
  }
  if (event.status === "completed" || new Date(event.startsAt) < now) {
    return { kind: "over", note: "This event has already taken place." };
  }
  if (event.bookingMode === "none") return { kind: "none", note: null };
  if (event.bookingMode === "external") {
    return { kind: "external", note: "Entries are taken on the organiser's own site." };
  }

  if (event.bookingOpensAt && new Date(event.bookingOpensAt) > now) {
    return { kind: "not_yet", note: `Entries open ${formatDateTime(event.bookingOpensAt)}` };
  }
  if (event.bookingClosesAt && new Date(event.bookingClosesAt) < now) {
    return { kind: "closed", note: "Entries have closed." };
  }

  return {
    kind: "open",
    note: event.bookingClosesAt ? `Entries close ${formatDateTime(event.bookingClosesAt)}` : null,
  };
}

export const EVENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "cf-badge-neutral" },
  published: { label: "Live", className: "cf-badge-ok" },
  cancelled: { label: "Cancelled", className: "cf-badge-danger" },
  completed: { label: "Finished", className: "cf-badge-neutral" },
};

/**
 * ISO in, `<input type="datetime-local">` value out.
 *
 * Built from the IST parts rather than `toISOString().slice(0,16)`, which
 * hands the input a UTC wall-clock — an organiser in Pune editing a 9am start
 * would find it had become 3:30am, and saving would move the event.
 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * The inverse: a datetime-local value is a wall clock with no zone, and this
 * product's wall clock is IST. +05:30 is stated rather than left to the
 * browser, so an organiser travelling abroad does not schedule their own
 * tournament in the wrong half of the day.
 */
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
