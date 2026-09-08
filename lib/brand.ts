// Single source of truth for the product name. Everything user-facing reads
// from here, which is what made the rename from the working title a change to
// this file plus the handful of screens that had hardcoded it anyway.
export const BRAND = {
  /** Product name shown in the navbar, footer, page titles and copy. */
  name: "Aspire91",
  /** Legal entity shown in the footer. */
  legalName: "Trustcabbage Private Limited",
  /**
   * The wordmark, served straight out of public/.
   *
   * Here rather than typed into the navbar and the footer separately, for the
   * same reason the name is: swapping the artwork — or its format — should be
   * one edit in this file and nothing else.
   *
   * Deliberately the wordmark and not the full lockup, which is also in
   * public/ as aspire91-logo.png. The lockup carries "Discover. Participate.
   * Achieve." inside the artwork, and at the 48px the navbar gives it that
   * line renders four pixels tall — while in the footer it would print the
   * slogan twice, once as pixels and once as the text below it. The slogan
   * belongs to `slogan` above, as type: legible at any size, selectable, and
   * changed here rather than in an image editor.
   */
  logo: "/aspire91-wordmark.png",
  /**
   * The slogan. Short, and says nothing about what the product does, so it
   * belongs beside the name rather than in a page description.
   */
  slogan: "Discover. Participate. Achieve.",
  /**
   * One-line description used in the footer and as default metadata. Kept
   * separate from the slogan on purpose: a search result showing three verbs
   * tells a parent nothing about whether this is the site they want.
   */
  tagline:
    "Find coaches, tutors, academies and coaching centres near you — for every sport, skill and subject.",
  /**
   * Public origin, used by robots.ts and sitemap.ts. The domain is
   * aspire91.com; NEXT_PUBLIC_SITE_URL is what makes a deploy use it, and the
   * localhost fallback is what keeps a dev machine from writing production
   * URLs into sitemaps and notification emails.
   */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;
