import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  areasWithCoaches,
  coachCount,
  countInArea,
  findCity,
  publicCoverage,
  requireSeoReference,
  slugify,
  subjectsAcross,
} from "@/lib/seo-pages";

type Params = { params: Promise<{ city: string }> };

// Cached for an hour. A crawler hitting forty of these pages in a minute
// should not cost forty round trips, and a coach approved this morning is
// still offered up today.
export const revalidate = 3600;

/**
 * Every coach in one city — /coaches/<city>.
 *
 * The hub. Its real job is not to rank but to be the page that links to the
 * area and subject pages below it, so a crawler arriving from the sitemap
 * reaches all of them in one hop. Ranking is the job of the pages it points
 * at, whose titles are the phrases people actually type.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug } = await params;
  const { cities } = await requireSeoReference();
  const city = findCity(cities, citySlug);
  if (!city) return {};

  const title = `Coaches, Tutors and Academies in ${city.name}`;
  const url = `${BRAND.siteUrl}/coaches/${citySlug}`;

  return {
    title,
    description: `Find coaches, tutors and coaching centres across ${city.name} — by area and by subject, with fees and timings.`,
    alternates: { canonical: url },
    openGraph: { title, url, siteName: BRAND.name },
  };
}

export default async function CityHub({ params }: Params) {
  const { city: citySlug } = await params;
  const { cities, areas, services } = await requireSeoReference();

  const city = findCity(cities, citySlug);
  if (!city) notFound();

  const coverage = await publicCoverage();
  const liveAreas = areasWithCoaches(coverage, areas, city.id);
  const subjects = subjectsAcross(coverage, services, liveAreas);

  const total = new Set(liveAreas.flatMap((a) => [...(coverage.byArea.get(a.id) ?? [])])).size;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <header>
          <p className="cf-eyebrow">{city.name}</p>
          <h1 className="cf-display mt-3 text-3xl text-ink">
            Coaches, tutors and academies in {city.name}
          </h1>
          <p className="mt-3 leading-relaxed text-muted">
            {total > 0
              ? `${coachCount(total)} across ${liveAreas.length} ${
                  liveAreas.length === 1 ? "area" : "areas"
                }. Pick your area, or the subject you're after.`
              : `${BRAND.name} opens area by area. Nobody is listed in ${city.name} yet.`}
          </p>
        </header>

        {liveAreas.length > 0 && (
          <section>
            <h2 className="cf-display text-lg text-ink">By area</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {liveAreas.map((area) => (
                <Link
                  key={area.id}
                  href={`/coaches/${citySlug}/${slugify(area.name)}`}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted transition hover:border-faint hover:text-ink"
                >
                  {area.name}
                  <span className="ml-2 text-faint">{countInArea(coverage, area.id)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {subjects.length > 0 && (
          <section>
            <h2 className="cf-display text-lg text-ink">By subject</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {subjects.map((service) => (
                <Link
                  key={service.id}
                  href={`/coaches/${citySlug}/${slugify(service.name)}`}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted transition hover:border-faint hover:text-ink"
                >
                  {service.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link href="/search" className="cf-btn-primary inline-block">
          Search with filters
        </Link>
      </div>
    </main>
  );
}
