// Single source of truth for the product name while the real brand is being
// decided. Everything user-facing reads from here, so renaming the product
// later is a one-line change rather than a hunt through the codebase.
export const BRAND = {
  /** Product name shown in the navbar, footer, page titles and copy. */
  name: "ClassFinder",
  /** Legal entity shown in the footer. */
  legalName: "Trustcabbage Private Limited",
  /** One-line description used in the footer and as default metadata. */
  tagline:
    "Find coaches, tutors, academies and coaching centres near you — for every sport, skill and subject.",
  /**
   * Public origin, used by robots.ts and sitemap.ts. Set NEXT_PUBLIC_SITE_URL
   * in the deploy environment once the real domain exists — until then this
   * must not point at a domain we don't own.
   */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;
