import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchTaxonomy } from "@/lib/api/reference";
import { BRAND } from "@/lib/brand";
import CoachList from "@/components/seo/CoachList";
import {
  coachCount,
  coachesFor,
  countInArea,
  findArea,
  findCity,
  findService,
  isWorthIndexing,
  publicCoverage,
  requireSeoReference,
  slugify,
  subjectsAcross,
} from "@/lib/seo-pages";

type Params = { params: Promise<{ city: string; slug: string }> };

// Cached for an hour. A crawler hitting forty of these pages in a minute
// should not cost forty round trips, and a coach approved this morning is
// still offered up today.
export const revalidate = 3600;

/**
 * One place, or one subject, in a city — /coaches/<city>/<area-or-subject>.
 *
 * Both live at this depth on purpose. The city already namespaces them, so
 * "indiranagar" and "table-tennis" cannot be confused for each other, and a
 * reader gets the short URL for both of the two things they might narrow by.
 * An area wins a tie, since an area named after a sport is the rarer accident
 * and the area page is the more specific promise.
 */
async function resolve(citySlug: string, slug: string) {
  const { cities, areas, services } = await requireSeoReference();

  const city = findCity(cities, citySlug);
  if (!city) return null;

  const area = findArea(areas, city.id, slug);
  const service = area ? null : findService(services, slug);
  if (!area && !service) return null;

  return { city, area, service, areas, services };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug, slug } = await params;
  const found = await resolve(citySlug, slug);
  if (!found) return {};

  const { city, area, service } = found;

  const coaches = await coachesFor({
    areaId: area?.id ?? null,
    serviceId: service?.id ?? null,
    cityName: service ? city.name : null,
  });

  const title = area
    ? `Coaches and Tutors in ${area.name}, ${city.name}`
    : `${service!.name} Coaches in ${city.name}`;

  const description = area
    ? `${coachCount(coaches.length)} teaching in ${area.name}, ${city.name} — fees, timings and how to get in touch.`
    : `${coachCount(coaches.length)} teaching ${service!.name} in ${city.name} — fees, timings and how to get in touch.`;

  const url = `${BRAND.siteUrl}/coaches/${citySlug}/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: BRAND.name },
    // A page with nobody on it is a page worth having for the person who
    // landed on it and not worth offering to anybody else. Asking not to be
    // indexed is how a site with real depth avoids looking like one padded
    // out with empty results.
    robots: isWorthIndexing(coaches.length) ? undefined : { index: false, follow: true },
  };
}

export default async function AreaOrSubjectPage({ params }: Params) {
  const { city: citySlug, slug } = await params;
  const found = await resolve(citySlug, slug);
  if (!found) notFound();

  const { city, area, service, areas, services } = found;

  const [coaches, taxonomy, coverage] = await Promise.all([
    coachesFor({
      areaId: area?.id ?? null,
      serviceId: service?.id ?? null,
      cityName: service ? city.name : null,
    }),
    fetchTaxonomy(),
    publicCoverage(),
  ]);

  // What to narrow to next. From an area, the subjects taught in it; from a
  // subject, the areas that have somebody teaching it. Either way the links
  // go to the /<area>/<subject> pages, which are the ones that answer a real
  // search query.
  const narrowings = area
    ? subjectsAcross(coverage, services, [area]).map((s) => ({
        label: s.name,
        href: `/coaches/${citySlug}/${slug}/${slugify(s.name)}`,
      }))
    : areas
        .filter((a) => a.cityId === city.id && countInArea(coverage, a.id, service!.id) > 0)
        .map((a) => ({
          label: a.name,
          href: `/coaches/${citySlug}/${slugify(a.name)}/${slug}`,
        }));

  const heading = area
    ? `Coaches and tutors in ${area.name}`
    : `${service!.name} coaches in ${city.name}`;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-7 px-6 py-10">
        <nav className="text-sm text-muted">
          <Link href={`/coaches/${citySlug}`} className="transition hover:text-ink">
            {city.name}
          </Link>
          <span className="mx-2 text-faint">/</span>
          <span className="text-ink">{area ? area.name : service!.name}</span>
        </nav>

        <header>
          <h1 className="cf-display text-3xl text-ink">{heading}</h1>
          <p className="mt-3 text-muted">
            {coaches.length > 0
              ? `${coachCount(coaches.length)} on ${BRAND.name}.`
              : "Nobody is listed here yet."}
          </p>
        </header>

        {narrowings.length > 0 && (
          <section>
            <h2 className="cf-eyebrow">{area ? "By subject" : "By area"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {narrowings.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted transition hover:border-faint hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        <CoachList
          coaches={coaches}
          categories={taxonomy.providerCategories}
          services={taxonomy.serviceCategories}
          places={taxonomy.teachingPlaces}
          emptyMessage={
            area
              ? `No one teaches in ${area.name} yet. ${BRAND.name} opens area by area.`
              : `No one teaches ${service!.name} in ${city.name} yet.`
          }
        />
      </div>
    </main>
  );
}
