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
        {/* The bottom of every image is faded into the card ground —
            otherwise a bright photo ends in a hard line halfway down the
            card. Fades to --scrim, the ground colour, not to black: a
            transparent black passes through grey on a light ground and
            dirties the photo on the way. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(var(--scrim), 0.85), rgba(var(--scrim), 0) 60%)",
          }}
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
        // color-mix, not `${tone}33`: groupTone returns "var(--sport)", so
        // appending hex alpha produced "var(--sport)33" — not a colour, so
        // the whole stop was dropped and the wash never rendered.
        background: `radial-gradient(120% 120% at 15% 0%, color-mix(in srgb, ${tone} 20%, transparent) 0%, rgba(var(--scrim), 0) 55%), linear-gradient(140deg, var(--surface-2), var(--surface))`,
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
      <div
        className="py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
        // Same `${tone}22` bug as the banner wash above; the month strip has
        // been drawing on bare surface-2 rather than its taxonomy tint.
        style={{
          background: `color-mix(in srgb, ${tone} 13%, transparent)`,
          color: tone,
        }}
      >
        {month}
      </div>
      <div className="px-1 py-1">
        <div className="font-display text-xl font-bold leading-none text-ink">{day}</div>
        <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-faint">{weekday}</div>
      </div>
    </div>
  );
}
