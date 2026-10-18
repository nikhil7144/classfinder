import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { fetchGroupsIn } from "@/lib/api/client";
import GroupList from "@/components/seo/GroupList";
import {
  findArea,
  findCity,
  findService,
  isWorthIndexing,
  requireSeoReference,
} from "@/lib/seo-pages";

type Params = { params: Promise<{ city: string; slug: string }> };

export const revalidate = 3600;

/**
 * One place, or one subject, in a city — /groups/in/<city>/<area-or-subject>.
 *
 * Both at this depth, exactly as /coaches/<city>/<slug> does it: the city
 * namespaces them so an area and a service cannot be confused, and an area
 * wins a tie because an area named after a sport is the rarer accident.
 */
async function resolve(citySlug: string, slug: string) {
  const { cities, areas, services } = await requireSeoReference();

  const city = findCity(cities, citySlug);
  if (!city) return null;

  const area = findArea(areas, city.id, slug);
  const service = area ? null : findService(services, slug);
  if (!area && !service) return null;

  return { city, area, service };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug, slug } = await params;
  const found = await resolve(citySlug, slug);
  if (!found) return { title: "Not found" };

  const { city, area, service } = found;
  const groups = await fetchGroupsIn({
    cityId: city.id,
    areaId: area?.id ?? null,
    serviceCategoryId: service?.id ?? null,
    limit: 24,
  });

  const what = area ? `${area.name}, ${city.name}` : `${service!.name} in ${city.name}`;
  const title = `Group classes in ${what} — ${BRAND.name}`;
  const description = area
    ? `Families in ${area.name} learning together, in their own society, park or community hall.`
    : `${service!.name} groups in ${city.name}: families near each other learning together.`;
  const url = `${BRAND.siteUrl}/groups/in/${citySlug}/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: BRAND.name, title, description, url, locale: "en_IN" },
    robots: isWorthIndexing(groups.length) ? undefined : { index: false, follow: true },
  };
}

export default async function GroupsInSlugPage({ params }: Params) {
  const { city: citySlug, slug } = await params;
  const found = await resolve(citySlug, slug);
  if (!found) notFound();

  const { city, area, service } = found;
  const groups = await fetchGroupsIn({
    cityId: city.id,
    areaId: area?.id ?? null,
    serviceCategoryId: service?.id ?? null,
    limit: 24,
  });

  const heading = area ? area.name : service!.name;

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <p className="cf-eyebrow">
          <Link href={`/groups/in/${citySlug}`} className="hover:text-accent-ink">
            Group classes in {city.name}
          </Link>
        </p>
        <h1 className="cf-display mt-4 text-[clamp(1.9rem,4.2vw,2.8rem)] leading-[1.1] text-ink">
          {area ? `Group classes in ${heading}` : `${heading} groups in ${city.name}`}
        </h1>
        <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-muted">
          {area
            ? "Neighbours here agreed what they wanted between themselves, then found a coach."
            : `Families near each other learning ${heading.toLowerCase()} together.`}
        </p>

        <GroupList
          groups={groups}
          emptyNote={`No groups are being shown in ${heading} yet.`}
        />
      </section>
    </main>
  );
}
