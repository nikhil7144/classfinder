import Link from "next/link";
import { areasWithCoaches, publicCoverage, seoReference, slugify } from "@/lib/seo-pages";

/**
 * The crawlable way into the coach pages, on every page of the site.
 *
 * Without this the landing pages are reachable only from the sitemap, and a
 * sitemap is a suggestion — internal links are what a crawler actually
 * follows, and what tells it which pages this site considers important.
 *
 * A server component on purpose. The footer beside it is a client component,
 * so anything it fetched in an effect would be absent from the HTML a crawler
 * reads; these links have to be in the first response or they may as well not
 * exist.
 *
 * It degrades to nothing rather than throwing. This renders in the root
 * layout, so an exception here would take down every page on the site to
 * protect a row of links — a bad trade at any hour, and a worse one during the
 * outage that caused it.
 */
export default async function BrowseLinks() {
  let cities: { name: string; areas: string[] }[] = [];

  try {
    const [reference, coverage] = await Promise.all([seoReference(), publicCoverage()]);
    if (!reference.ok) return null;

    cities = reference.cities
      .map((city) => ({
        name: city.name,
        areas: areasWithCoaches(coverage, reference.areas, city.id).map((a) => a.name),
      }))
      .filter((c) => c.areas.length > 0);
  } catch {
    return null;
  }

  if (cities.length === 0) return null;

  return (
    <nav aria-label="Browse coaches by area" className="border-t border-line bg-bg px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <p className="cf-eyebrow">Browse by area</p>
        <div className="mt-4 space-y-3">
          {cities.map((city) => (
            <div key={city.name} className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <Link
                href={`/coaches/${slugify(city.name)}`}
                className="text-sm font-semibold text-ink transition hover:text-accent-ink"
              >
                {city.name}
              </Link>
              {city.areas.map((area) => (
                <Link
                  key={area}
                  href={`/coaches/${slugify(city.name)}/${slugify(area)}`}
                  className="text-sm text-muted transition hover:text-ink"
                >
                  {area}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
