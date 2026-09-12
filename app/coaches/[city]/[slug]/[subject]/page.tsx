import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchTaxonomy } from "@/lib/api/reference";
import { BRAND } from "@/lib/brand";
import CoachList from "@/components/seo/CoachList";
import {
  coachCount,
  coachesFor,
  findArea,
  findCity,
  findService,
  isWorthIndexing,
  requireSeoReference,
} from "@/lib/seo-pages";

type Params = { params: Promise<{ city: string; slug: string; subject: string }> };

// Cached for an hour. A crawler hitting forty of these pages in a minute
// should not cost forty round trips, and a coach approved this morning is
// still offered up today.
export const revalidate = 3600;

/**
 * One subject, in one area — /coaches/<city>/<area>/<subject>.
 *
 * The page this whole tree exists for. "Table tennis coach in Indiranagar" is
 * what a parent types, and it is a phrase no established site is fighting hard
 * for, which is the only kind of query a new domain can win. Everything above
 * it is scaffolding that makes this page reachable.
 *
 * The second segment must be an area here. A subject followed by a subject is
 * not a thing, so it answers notFound() rather than guessing.
 */
async function resolve(citySlug: string, areaSlug: string, subjectSlug: string) {
  const { cities, areas, services } = await requireSeoReference();

  const city = findCity(cities, citySlug);
  if (!city) return null;

  const area = findArea(areas, city.id, areaSlug);
  if (!area) return null;

  const service = findService(services, subjectSlug);
  if (!service) return null;

  return { city, area, service };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug, slug, subject } = await params;
  const found = await resolve(citySlug, slug, subject);
  if (!found) return {};

  const { city, area, service } = found;
  const coaches = await coachesFor({ areaId: area.id, serviceId: service.id });

  // Exactly the phrase somebody searches, in the order they say it.
  const title = `${service.name} Coaches in ${area.name}, ${city.name}`;
  const url = `${BRAND.siteUrl}/coaches/${citySlug}/${slug}/${subject}`;

  return {
    title,
    description: `${coachCount(coaches.length)} teaching ${service.name} in ${area.name}, ${city.name} — fees, timings, and how to get in touch on ${BRAND.name}.`,
    alternates: { canonical: url },
    openGraph: { title, url, siteName: BRAND.name },
    robots: isWorthIndexing(coaches.length) ? undefined : { index: false, follow: true },
  };
}

export default async function AreaSubjectPage({ params }: Params) {
  const { city: citySlug, slug, subject } = await params;
  const found = await resolve(citySlug, slug, subject);
  if (!found) notFound();

  const { city, area, service } = found;

  const [coaches, taxonomy] = await Promise.all([
    coachesFor({ areaId: area.id, serviceId: service.id }),
    fetchTaxonomy(),
  ]);

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-7 px-6 py-10">
        <nav className="text-sm text-muted">
          <Link href={`/coaches/${citySlug}`} className="transition hover:text-ink">
            {city.name}
          </Link>
          <span className="mx-2 text-faint">/</span>
          <Link href={`/coaches/${citySlug}/${slug}`} className="transition hover:text-ink">
            {area.name}
          </Link>
          <span className="mx-2 text-faint">/</span>
          <span className="text-ink">{service.name}</span>
        </nav>

        <header>
          <h1 className="cf-display text-3xl text-ink">
            {service.name} coaches in {area.name}
          </h1>
          <p className="mt-3 text-muted">
            {coaches.length > 0
              ? `${coachCount(coaches.length)} teaching ${service.name} in ${area.name}, ${city.name}.`
              : `Nobody teaches ${service.name} in ${area.name} yet.`}
          </p>
        </header>

        <CoachList
          coaches={coaches}
          categories={taxonomy.providerCategories}
          services={taxonomy.serviceCategories}
          places={taxonomy.teachingPlaces}
          emptyMessage={`No one teaches ${service.name} in ${area.name} yet. Try the ${area.name} page for other subjects, or search a wider radius.`}
        />
      </div>
    </main>
  );
}
