import { dateTile, groupTone } from "@/lib/events";

/**
 * The two pieces every event surface repeats: the poster and the date block.
 *
 * An event is sold by its poster and its date, in that order — a parent
 * scanning a listing reads a picture, a day and a price, and only then a
 * title. That is why these are their own components rather than markup
 * copied into the card and the page, which is how the two drift into
 * different sizes of the same thing.
 */

type BannerProps = {
  bannerUrl: string | null;
  title: string;
  group?: string | null;
  /** Tailwind aspect class — cards want a shallower crop than the page. */
  className?: string;
};

/**
 * The banner, or a stand-in that still looks deliberate.
 *
 * Most organisers will not upload one for their first event, and an empty
 * grey box says the product is broken. The fallback paints the taxonomy
 * colour into the charcoal ground and puts the first letters of the title in
 * it, so an unbannered tournament still reads as a card someone made.
 */
export function EventBanner({ bannerUrl, title, group, className = "" }: BannerProps) {
  const tone = groupTone(group);

  if (bannerUrl) {
    return (
      <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        {/* The ground the poster sits on is dark, so the bottom of every
            image is faded into it — otherwise a bright photo ends in a hard
            line halfway down the card. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(12,14,16,0.85), rgba(12,14,16,0) 60%)" }}
        />
      </div>
    );
  }

  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 120% at 15% 0%, ${tone}33 0%, rgba(12,14,16,0) 55%), linear-gradient(140deg, var(--surface-2), var(--surface))`,
      }}
      aria-hidden
    >
      <span
        className="absolute bottom-3 right-4 font-display text-6xl font-bold opacity-25"
        style={{ color: tone }}
      >
        {initials}
      </span>
    </div>
  );
}

/**
 * The date, as a block rather than a sentence.
 *
 * A tile is read at a glance from a scrolling list in a way "Saturday 12
 * October 2026" is not, and it is the one piece of an event a parent checks
 * before anything else — whether they are free that day.
 */
export function DateTile({ iso, group }: { iso: string; group?: string | null }) {
  const { weekday, day, month } = dateTile(iso);
  const tone = groupTone(group);

  return (
    <div className="w-14 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2 text-center">
      <div className="py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider" style={{ background: `${tone}22`, color: tone }}>
        {month}
      </div>
      <div className="px-1 py-1">
        <div className="font-display text-xl font-bold leading-none text-ink">{day}</div>
        <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-faint">{weekday}</div>
      </div>
    </div>
  );
}
