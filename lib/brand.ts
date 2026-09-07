// Single source of truth for the product name. Everything user-facing reads
// from here, which is what made the rename from the working title a change to
// this file plus the handful of screens that had hardcoded it anyway.
export const BRAND = {
  /** Product name shown in the navbar, footer, page titles and copy. */
  name: "Aspire91",
  /** Legal entity shown in the footer. */
  legalName: "Trustcabbage Private Limited",
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
