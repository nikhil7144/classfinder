import { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";
import { BRAND } from "@/lib/brand";

/**
 * Everything a stranger is allowed to read.
 *
 * It used to list three URLs — the home page and two sign-up forms — which
 * meant no coach page had ever been offered to a search engine. Nothing links
 * to one either: /search finds coaches in an effect after a form is filled in,
 * and a crawler fills in no forms. So a listing was reachable only by someone
 * who already had the link, which is the opposite of what a listing is for.
 *
 * The rows are read with the anon key and nothing else. Every table here
 * carries a public-read policy that already encodes the visibility rule —
 * approved and unsuspended for a coach, published for an event — so what comes
 * back is by definition the set a logged-out visitor can see. That is the
 * right way round: a sitemap assembled from a privileged query is a sitemap
 * that eventually hands Google a page it will be redirected away from.
 */

// An hour. Long enough that crawls cost nothing, short enough that a coach
// approved this morning is offered up today.
export const revalidate = 3600;

/** Anonymous on purpose — no cookies to read, and no session to inherit. */
function anonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

const STATIC_PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/events", priority: 0.8, changeFrequency: "daily" },
  { path: "/for-coaches", priority: 0.7, changeFrequency: "monthly" },
  { path: "/signup/seeker", priority: 0.5, changeFrequency: "monthly" },
  { path: "/signup/provider", priority: 0.5, changeFrequency: "monthly" },
  { path: "/signup/organiser", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    url: `${BRAND.siteUrl}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  try {
    const supabase = anonClient();

    const [providers, spaces, events] = await Promise.all([
      // Event planners are excluded here as they are everywhere else: they have
      // no teaching page, so offering one would be offering a 404.
      supabase
        .from("providers")
        .select("id, created_at")
        .neq("provider_type", "event_planner"),
      supabase.from("spaces").select("provider_id, created_at"),
      supabase.from("events").select("id, created_at, starts_at"),
    ]);

    // created_at, not the crawl time. There is no updated_at on either table
    // yet, and stamping every page "changed just now" on every crawl is worse
    // than an old date — it is the signal search engines learn to ignore.
    const coachEntries: MetadataRoute.Sitemap = (providers.data ?? []).map((p) => ({
      url: `${BRAND.siteUrl}/provider/${p.id}`,
      lastModified: new Date(p.created_at as string),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    const spaceEntries: MetadataRoute.Sitemap = (spaces.data ?? []).map((s) => ({
      url: `${BRAND.siteUrl}/provider/${s.provider_id}/space`,
      lastModified: new Date(s.created_at as string),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const eventEntries: MetadataRoute.Sitemap = (events.data ?? []).map((e) => ({
      url: `${BRAND.siteUrl}/events/${e.id}`,
      lastModified: new Date(e.created_at as string),
      // A competition stops being worth recrawling the day after it runs.
      changeFrequency: new Date(e.starts_at as string) > now ? "daily" : "yearly",
      priority: 0.7,
    }));

    return [...staticEntries, ...coachEntries, ...spaceEntries, ...eventEntries];
  } catch {
    // A sitemap that 500s is worse than a short one: the pages that were
    // always listed stop being listed too.
    return staticEntries;
  }
}
