/**
 * The artwork behind the home hero.
 *
 * A dark hero needs nothing behind it — the charcoal ground is itself the
 * material, and a centred text stack on it reads as deliberate. On white the
 * same stack reads as an unformatted document, which is what light mode first
 * shipped as.
 *
 * So this is the logo's own rising swoosh, abstracted into three arcs in its
 * blue->teal->green, with the gold star it rises toward. Drawn from the brand
 * rather than reached for off a shelf: a soft gradient wash behind a headline
 * is the house style of every AI-built landing page and says nothing about
 * coaching.
 *
 * Decorative, so aria-hidden and pointer-events none — it sits under the
 * headline and must never eat a click or be announced.
 */
export default function HeroMotif() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 1360 620"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="cf-hero-swoosh" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#1f7ae0" />
            <stop offset="0.5" stopColor="#17b893" />
            <stop offset="1" stopColor="#5ecb5e" />
          </linearGradient>
        </defs>

        {/* Three passes of the same curve, each flatter and fainter, so the
            eye reads one motion rather than three lines. */}
        <g fill="none" stroke="url(#cf-hero-swoosh)" strokeLinecap="round">
          <path
            d="M-120 660 C 240 600, 520 430, 700 250 S 1080 20, 1420 -40"
            strokeWidth="2"
            opacity="0.26"
          />
          <path
            d="M-120 730 C 280 670, 580 490, 770 300 S 1150 60, 1480 10"
            strokeWidth="1.4"
            opacity="0.18"
          />
          <path
            d="M-160 800 C 300 740, 640 560, 840 360 S 1220 110, 1540 60"
            strokeWidth="1"
            opacity="0.12"
          />
        </g>

        <g fill="var(--grad-2)">
          <path
            d="M1148 96 l13 27 30 4 -22 21 5 30 -26 -14 -27 14 5 -30 -21 -21 29 -4z"
            opacity="0.5"
          />
          <path
            d="M232 418 l8 17 19 3 -14 13 3 19 -16 -9 -17 9 3 -19 -13 -13 18 -3z"
            opacity="0.3"
          />
        </g>

        <g fill="var(--teal)" opacity="0.14">
          <circle cx="1056" cy="300" r="8" />
          <circle cx="318" cy="200" r="5" />
        </g>
      </svg>
    </div>
  );
}
