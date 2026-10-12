import { BRAND } from "@/lib/brand";

/**
 * The wordmark, in whichever version the current theme needs.
 *
 * Both files are in the DOM and CSS hides one. Swapping `src` from JavaScript
 * instead would be the obvious approach and is the wrong one: it cannot run
 * before first paint, so every light-mode visitor would watch the white
 * wordmark flash and vanish before the right one arrived — the same flash
 * ThemeScript exists to prevent for the page ground.
 *
 * The hidden one is `display: none`, so assistive tech reads exactly one of
 * the two and both can carry the real alt text.
 *
 * Cost of the approach: browsers fetch both files. They are small, cached
 * across every page, and the alternative is a visible flash on every load.
 */
export default function BrandLogo({
  className = "h-12 w-auto",
}: {
  className?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.logo}
        alt={BRAND.name}
        className={`cf-logo-on-dark ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.logoOnLight}
        alt={BRAND.name}
        className={`cf-logo-on-light ${className}`}
      />
    </>
  );
}
