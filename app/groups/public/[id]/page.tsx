import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { fetchPublicGroup, fetchPublicGroupPosts } from "@/lib/api/client";

type Params = { params: Promise<{ id: string }> };

export const revalidate = 600;

/**
 * A published group, as a stranger sees it — /groups/public/<id>.
 *
 * A separate page from /groups/<id> on purpose, and not a cosmetic one.
 * /groups/<id> runs on get_group_invite, which hands the society name to
 * anybody holding the link because that is exactly what an invite is for.
 * Publishing makes the id discoverable, so pointing the public listings at
 * that page would publish every group's society with it — the one thing the
 * design withholds everywhere else, including from the coach being pitched.
 *
 * This runs on group_public instead: service, area, city, counts. No society,
 * no creator, no member names.
 *
 * `public` is a static segment, so it beats the [id] route and neither the
 * invite links already shared between neighbours nor the chat route move.
 */

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const group = await fetchPublicGroup(id);
  if (!group) return { title: "Not found", robots: { index: false, follow: false } };

  const what = group.publicHeadline || `${group.serviceName} group`;
  const where = [group.areaName, group.cityName].filter(Boolean).join(", ");
  const title = `${what}${where ? ` in ${where}` : ""} — ${BRAND.name}`;
  const description =
    group.publicAbout ||
    `${group.memberCount} families learning ${group.serviceName} together${
      where ? ` in ${where}` : ""
    }.`;

  return {
    title,
    description,
    alternates: { canonical: `${BRAND.siteUrl}/groups/public/${id}` },
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      title,
      description,
      url: `${BRAND.siteUrl}/groups/public/${id}`,
      locale: "en_IN",
      // No images, deliberately. Photos here were posted by families about
      // their own children; they render on the page for a reader who came
      // looking, and they are not handed to a crawler or a link preview.
    },
  };
}

export default async function PublicGroupPage({ params }: Params) {
  const { id } = await params;

  const group = await fetchPublicGroup(id);
  // Unpublished reads as missing rather than forbidden: whether a group
  // exists at all is not a visitor's business.
  if (!group) notFound();

  const posts = await fetchPublicGroupPosts(id);

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-3xl px-6 pt-20 pb-16">
        <p className="cf-eyebrow">
          <Link href="/groups/in" className="hover:text-accent-ink">
            Group classes
          </Link>
        </p>

        <h1 className="cf-display mt-4 text-[clamp(1.9rem,4.2vw,2.6rem)] leading-[1.1] text-ink">
          {group.publicHeadline || `${group.serviceName} group`}
        </h1>

        <p className="mt-3 text-muted">
          {[group.areaName, group.cityName].filter(Boolean).join(", ")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="cf-badge cf-badge-neutral">
            {group.memberCount} {group.memberCount === 1 ? "family" : "families"}
          </span>
          <span className="cf-badge cf-badge-neutral">{group.studentCount} students</span>
          {group.hasCoach && <span className="cf-badge cf-badge-ok">Has a coach</span>}
        </div>

        {group.publicAbout && (
          <p className="mt-8 text-[1.02rem] leading-relaxed text-ink">{group.publicAbout}</p>
        )}

        {posts.length > 0 && (
          <div className="mt-10">
            <h2 className="cf-display text-lg text-ink">From their sessions</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {posts.map((p) => (
                <article key={p.id} className="cf-card overflow-hidden">
                  {p.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {p.body && (
                    <p className="p-5 text-sm leading-6 text-muted">{p.body}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-base font-bold text-ink">
            Want something like this where you live?
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Two families near each other wanting the same class are enough to start a group. You
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
