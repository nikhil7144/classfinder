import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { fetchGroupsIn } from "@/lib/api/client";
import GroupList from "@/components/seo/GroupList";
import {
  findCity,
  isWorthIndexing,
  requireSeoReference,
  slugify,
} from "@/lib/seo-pages";

type Params = { params: Promise<{ city: string }> };

export const revalidate = 3600;

async function resolve(citySlug: string) {
  const { cities, areas } = await requireSeoReference();
  const city = findCity(cities, citySlug);
  if (!city) return null;
  return { city, areas: areas.filter((a) => a.cityId === city.id) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug } = await params;
  const found = await resolve(citySlug);
  if (!found) return { title: "Not found" };

  const groups = await fetchGroupsIn({ cityId: found.city.id, limit: 24 });

  const title = `Group classes in ${found.city.name} — ${BRAND.name}`;
  const description =
    `Groups of families in ${found.city.name} learning together, in their own society, ` +
    `park or community hall. ${groups.length} shown publicly right now.`;
  const url = `${BRAND.siteUrl}/groups/in/${citySlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: BRAND.name, title, description, url, locale: "en_IN" },
    // An empty page still renders for anyone who lands on it; it just asks
    // not to be indexed. Same rule the coach pages use.
    robots: isWorthIndexing(groups.length) ? undefined : { index: false, follow: true },
  };
}

export default async function GroupsInCityPage({ params }: Params) {
  const { city: citySlug } = await params;
  const found = await resolve(citySlug);
  if (!found) notFound();

  const { city, areas } = found;
  const groups = await fetchGroupsIn({ cityId: city.id, limit: 24 });

  // Only areas that actually have one, so no link leads nowhere.
  const areasWithGroups = areas.filter((a) => groups.some((g) => g.areaId === a.id));

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <p className="cf-eyebrow">
          <Link href="/groups/in" className="hover:text-accent-ink">
            Group classes
          </Link>
        </p>
        <h1 className="cf-display mt-4 text-[clamp(1.9rem,4.2vw,2.8rem)] leading-[1.1] text-ink">
          Group classes in {city.name}
        </h1>
        <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-muted">
          Neighbours who wanted the same class agreed on it together, then found a coach. These
          are the ones being shown publicly.
        </p>

        {areasWithGroups.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {areasWithGroups.map((a) => (
              <Link
                key={a.id}
                href={`/groups/in/${citySlug}/${slugify(a.name)}`}
                className="cf-pill"
              >
                {a.name}
              </Link>
            ))}
          </div>
        )}

        <GroupList groups={groups} emptyNote={`No groups are being shown in ${city.name} yet.`} />
      </section>
    </main>
  );
}
