import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import GuestHome from "@/components/GuestHome";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin } from "@/lib/supabase-server";
import { fetchCitiesOrThrow, fetchCityFeedOrThrow, type City, type FeedPost } from "@/lib/api/client";

/**
 * The feed, cached for five minutes across every visitor.
 *
 * The page itself cannot be statically rendered — it reads the auth cookie to
 * catch a user who signed in but has no role yet — so the caching goes around
 * the queries instead, which is where the cost actually was: two Postgres
 * round trips on the busiest and least personal route in the product.
 *
 * Read through the API rather than Supabase, like every other feed call. The
 * endpoint is public and identical for everybody, which is what makes it safe
 * to share one cache entry across all visitors.
 */
/**
 * These throw on failure on purpose, and the caller catches.
 *
 * A rejected promise is not cached; a resolved empty array is. When these
 * degraded internally, an unreachable API wrote an empty list into the cache
 * and the homepage kept serving it for the full hour after the API came back
 * — one bad moment turned into a long, silent outage of the feed.
 *
 * The keys carry a version so a deploy that changes this behaviour does not
 * inherit an entry written by the old one.
 */
const getCityFeed = unstable_cache(
  async (cityId: string) => fetchCityFeedOrThrow(cityId, 12),
  ["public-city-feed", "v2"],
  // Content is already six hours stale by design (space_public_delay), so
  // five minutes of cache costs the reader nothing they would notice.
  { revalidate: 300, tags: ["city-feed"] },
);

const getLiveCities = unstable_cache(
  async () => fetchCitiesOrThrow(),
  ["live-cities", "v2"],
  // Changes only when an admin opens an area or approves a coach.
  { revalidate: 3600, tags: ["city-feed"] },
);

/**
 * The city feed is fetched here rather than in the client component, so the
 * homepage arrives as HTML with real content in it.
 *
 * That is the whole reason ?city= is a URL parameter and not component state:
 * every live city gets its own crawlable page carrying the posts of the
 * coaches in it, which is the only acquisition surface this product has that
 * is not paid.
 */
type Props = {
  searchParams: Promise<{ city?: string }>;
};

export default async function LandingPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A magic link (or any auth that skips the in-app OTP step) lands here
  // already signed in but with no profile row yet. Without this the page
  // shows signup buttons to someone who is already signed in, and they end
  // up stuck. Send them to pick a role instead.
  if (user) {
    const { data: profile } = await supabaseServerAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.role) {
      redirect("/choose-role");
    }
  }

  const { city: requestedCity } = await searchParams;

  // Caught here rather than inside the cached function, so a failure is not
  // what gets remembered for the next hour.
  const cities = await getLiveCities().catch(() => [] as City[]);

  // live_cities() orders by coach count, so the head of the list is the best
  // page we can show someone who has not chosen. An unknown ?city= falls back
  // to it rather than rendering an empty feed for a city that isn't open.
  const selected = cities.find((c) => c.id === requestedCity) ?? cities[0] ?? null;

  const posts = selected ? await getCityFeed(selected.id).catch(() => [] as FeedPost[]) : [];

  return <GuestHome cities={cities} selectedCity={selected} posts={posts} />;
}
