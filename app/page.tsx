import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import GuestHome from "@/components/GuestHome";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin, supabaseServerAuth } from "@/lib/supabase-server";
import type { City, FeedPost } from "@/lib/spaces";

/**
 * The feed, cached for five minutes across every visitor.
 *
 * The page itself cannot be statically rendered — it reads the auth cookie to
 * catch a user who signed in but has no role yet — so the caching goes around
 * the queries instead, which is where the cost actually was: two Postgres
 * round trips on the busiest and least personal route in the product.
 *
 * Deliberately the plain anon client, not the cookie-bound one. This data is
 * identical for everybody and the cache is shared, so reading it as a
 * particular user would be both pointless and wrong.
 */
const getCityFeed = unstable_cache(
  async (cityId: string) => {
    const { data } = await supabaseServerAuth.rpc("public_city_feed", {
      p_city_id: cityId,
      p_limit: 12,
      p_before: null,
    });
    return (data as FeedPost[]) || [];
  },
  ["public-city-feed"],
  // Content is already six hours stale by design (space_public_delay), so
  // five minutes of cache costs the reader nothing they would notice.
  { revalidate: 300, tags: ["city-feed"] },
);

const getLiveCities = unstable_cache(
  async () => {
    const { data } = await supabaseServerAuth.rpc("live_cities");
    return (data as City[]) || [];
  },
  ["live-cities"],
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

  const cities = await getLiveCities();

  // live_cities() orders by coach count, so the head of the list is the best
  // page we can show someone who has not chosen. An unknown ?city= falls back
  // to it rather than rendering an empty feed for a city that isn't open.
  const selected = cities.find((c) => c.id === requestedCity) ?? cities[0] ?? null;

  const posts = selected ? await getCityFeed(selected.id) : [];

  return <GuestHome cities={cities} selectedCity={selected} posts={posts} />;
}
