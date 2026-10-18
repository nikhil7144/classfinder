import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { fetchGroupsIn } from "@/lib/api/client";
import { isWorthIndexing, seoReference, slugify } from "@/lib/seo-pages";

/**
 * Every city with a published group — /groups/in.
 *
 * Under `in` rather than at /groups/<city>, because /groups/[id] already
 * exists and is the page an invite link points at. Those links have been
 * shared between neighbours; taking the segment for a city slug would 404
 * every one of them. A static segment wins over a dynamic one in Next, so
 * `in` costs nothing and breaks nothing.
 */

export const revalidate = 3600;

const DESCRIPTION =
  "Groups of families near each other learning together — cricket, dance, music, " +
  "maths and more, in their own society, park or community hall.";

export const metadata: Metadata = {
  title: `Group classes near you — ${BRAND.name}`,
  description: DESCRIPTION,
  alternates: { canonical: `${BRAND.siteUrl}/groups/in` },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `Group classes near you — ${BRAND.name}`,
    description: DESCRIPTION,
    url: `${BRAND.siteUrl}/groups/in`,
    locale: "en_IN",
  },
};

export default async function GroupCitiesPage() {
  // seoReference, not requireSeoReference: this page takes no params, so Next
  // prerenders it at build time, and a throw there fails the whole build
  // rather than one page. It degrades to an empty list, which this page
  // already renders honestly — the same choice sitemap.ts makes, for the same
  // reason: a build that dies because a service was briefly down is worse
  // than a page that says there is nothing yet.
  const { cities } = await seoReference();

  // One call per city rather than one for everything: the discover endpoint
  // is paginated per city, and a city with nothing published should not be
  // offered as a link to an empty page.
  const counted = await Promise.all(
    cities.map(async (city) => ({
      city,
      count: (await fetchGroupsIn({ cityId: city.id, limit: 24 })).length,
    })),
  );

  const live = counted.filter((c) => isWorthIndexing(c.count));

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16">
        <p className="cf-eyebrow">Group classes</p>
        <h1 className="cf-display mt-4 text-[clamp(2rem,4.5vw,3rem)] leading-[1.1] text-ink">
          Families learning together, near you
        </h1>
        <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-muted">
          Neighbours who wanted the same class agreed on it between themselves, then found a
          coach. Each group below is live and open about what it is doing.
        </p>

        {live.length > 0 ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {live.map(({ city, count }) => (
              <Link
                key={city.id}
                href={`/groups/in/${slugify(city.name)}`}
                className="cf-card block p-6 transition hover:border-faint"
              >
                <h2 className="font-display text-lg font-bold text-ink">{city.name}</h2>
                <p className="mt-1.5 text-sm text-muted">
                  {count} {count === 1 ? "group" : "groups"} to see
                </p>
              </Link>
            ))}
          </div>
        ) : (
          /* Honest rather than empty: the page still renders, and says so. */
          <p className="mt-10 text-sm leading-6 text-faint">
            No groups are being shown publicly yet. Groups start privately between neighbours,
            and a group only appears here once the people in it choose to show it.
          </p>
        )}

        <div className="mt-12 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-base font-bold text-ink">
            Want a group where you live?
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Two families near each other wanting the same class are enough to start one. You
            agree what you want between yourselves, and coaches come to you.
          </p>
          <Link href="/groups/new" className="cf-btn-primary mt-5 inline-flex">
            Start a group
          </Link>
        </div>
      </section>
    </main>
  );
}
