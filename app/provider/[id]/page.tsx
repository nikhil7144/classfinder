import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { fetchTaxonomy } from "@/lib/api/reference";
import EnquiryForm from "@/components/provider/EnquiryForm";
import RaiseQueryForm from "@/components/provider/RaiseQueryForm";
import { formatExperience, formatFees } from "@/lib/search";
import { WEEK_DAYS } from "@/lib/profile-rules";
import { BRAND } from "@/lib/brand";
import { slugify } from "@/lib/seo-pages";

type Params = { params: Promise<{ id: string }> };

type Availability = { day: string; place: string; start: string; end: string };
type Certification = { name: string; issuer?: string; year?: string };
type Service = { id: string; name: string; group: string };
type Branch = { label: string; address: string; area_name: string | null; city_name: string | null };
type ServiceArea = { area_name: string; city_name: string };

type ProviderProfile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  help_statement: string | null;
  provider_type: string;
  photo_url: string | null;
  is_featured: boolean;
  age: number | null;
  experience_years: number | null;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  fees_note: string | null;
  teaching_places: string[] | null;
  certifications: Certification[] | null;
  availability: Availability[] | null;
  category_name: string | null;
  services: Service[];
  branches: Branch[];
  service_areas: ServiceArea[];
};

const DAY_LABEL = Object.fromEntries(WEEK_DAYS.map((d) => [d.value, d.label]));
const DAY_ORDER: string[] = WEEK_DAYS.map((d) => d.value);

/**
 * What this page is called, to a search engine and to WhatsApp.
 *
 * Every coach page used to inherit the root layout's title — the brand name
 * and a slogan — so all of them were called the same thing and none of them
 * said what anyone teaches or where. A page titled "Aspire91 — Discover.
 * Participate. Achieve." cannot rank for "table tennis coach in Indiranagar"
 * no matter how well the page itself is written.
 *
 * The title is built to be that phrase: what they teach, where they teach it.
 * The description is their own sentence about who they help, because it is the
 * one line on the page written to be read by a parent deciding.
 *
 * The same block does the WhatsApp card, which matters more on day one than
 * Google does — a coach shares their own link long before a stranger searches
 * for one, and a bare link with no photo is a link nobody taps.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_provider_profile", { p_id: id });
  const provider = data as ProviderProfile | null;

  // notFound() in the page itself handles this; here it just means there is
  // nothing to describe.
  if (!provider) return {};

  const name = provider.display_name?.trim() || "Coach";

  // What they teach: their subjects, up to three, else the category they are
  // listed under. More than three reads as keyword stuffing and Google cuts
  // the title at roughly sixty characters anyway.
  const subjects = (provider.services || []).map((s) => s.name).slice(0, 3);
  const teaches = subjects.length > 0 ? subjects.join(", ") : provider.category_name;

  // Where: the areas they actually serve, then their branches. One place only
  // — a title listing five areas ranks for none of them well.
  const where =
    provider.service_areas?.[0]?.area_name ||
    provider.branches?.[0]?.area_name ||
    provider.branches?.[0]?.city_name ||
    null;

  const title = [name, teaches, where && `in ${where}`].filter(Boolean).join(" — ");

  const description =
    provider.help_statement?.trim() ||
    provider.bio?.trim()?.slice(0, 200) ||
    `${name} teaches ${teaches ?? "on Aspire91"}${where ? ` in ${where}` : ""}. ` +
      `See fees, timings and get in touch on ${BRAND.name}.`;

  const url = `${BRAND.siteUrl}/provider/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: BRAND.name,
      // Their own photo, which is the whole point of the card. Without it a
      // shared listing is a grey rectangle with a domain name on it.
      images: provider.photo_url ? [{ url: provider.photo_url }] : undefined,
    },
    twitter: {
      card: provider.photo_url ? "summary_large_image" : "summary",
      title,
      description,
      images: provider.photo_url ? [provider.photo_url] : undefined,
    },
  };
}

export default async function ProviderProfilePage({ params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // get_provider_profile() holds the visibility rule — approved, not
  // suspended, not an event planner — so it lives in one place and the mobile
  // app calls exactly the same function. It runs security-invoker under the
  // anon key, so this page has no elevated privilege at all.
  const { data } = await supabase.rpc("get_provider_profile", { p_id: id });
  const provider = data as ProviderProfile | null;

  if (!provider) notFound();

  // Who is looking is now EnquiryForm's business: it needs the answer on the
  // client anyway to write the enquiry, and asking here as well meant two
  // sources of truth for the same question.
  const { teachingPlaces } = await fetchTaxonomy();
  const placeLabel = Object.fromEntries(teachingPlaces.map((p) => [p.id, p.label]));

  const fees = formatFees(provider.fee_min, provider.fee_max, provider.fee_period);
  const experience = formatExperience(provider.experience_years);
  const certifications = provider.certifications || [];

  // Grouped by place then ordered by day — the question a parent is asking is
  // "can I get there on a Saturday", not "list every slot".
  const byPlace = (provider.availability || []).reduce<Record<string, Availability[]>>(
    (acc, slot) => {
      (acc[slot.place] = acc[slot.place] || []).push(slot);
      return acc;
    },
    {}
  );
  for (const slots of Object.values(byPlace)) {
    slots.sort(
      (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start.localeCompare(b.start)
    );
  }

  // Where this coach sits in the browsable tree.
  //
  // Links out as well as in: the landing pages are how a crawler reaches this
  // profile, and these are how it leaves again to find the rest. A profile
  // that only ever receives links is a dead end, and a dead end is a page a
  // crawler stops coming back to.
  const home = provider.service_areas?.[0] ?? null;
  const homeCity = home?.city_name ?? provider.branches?.[0]?.city_name ?? null;
  const homeArea = home?.area_name ?? provider.branches?.[0]?.area_name ?? null;

  const nearby =
    homeCity && homeArea
      ? [
          {
            label: `Coaches in ${homeArea}`,
            href: `/coaches/${slugify(homeCity)}/${slugify(homeArea)}`,
          },
          ...provider.services.slice(0, 4).map((s) => ({
            label: `${s.name} in ${homeArea}`,
            href: `/coaches/${slugify(homeCity)}/${slugify(homeArea)}/${slugify(s.name)}`,
          })),
        ]
      : [];

  const isInstitution = provider.provider_type === "institution";

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <Link href="/search" className="text-sm text-muted transition hover:text-ink">
          ← Back to search
        </Link>

        {/* Two tabs, not a section: a Space paginates and this page does not,
            and an event planner has a Space with no profile behind it. */}
        <nav className="flex flex-wrap gap-2 border-b border-line pb-3">
          <span className="rounded-full bg-surface-3 px-4 py-2 text-sm font-semibold text-ink">
            Profile
          </span>
          <Link
            href={`/provider/${provider.id}/space`}
            className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            Space
          </Link>
        </nav>

        <header className="cf-card p-7">
          <div className="flex flex-wrap gap-5">
            {provider.photo_url ? (
              <img
                src={provider.photo_url}
                alt=""
                className="h-24 w-24 rounded-2xl border border-line object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-line bg-surface-2 text-2xl font-semibold text-faint">
                {(provider.display_name || "?").charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="cf-display text-3xl text-ink">{provider.display_name}</h1>
                {provider.is_featured && <span className="cf-badge cf-badge-warn">Featured</span>}
              </div>
              <p className="mt-1 text-muted">{provider.category_name}</p>
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-faint">
                {experience && <span>{experience}</span>}
                {provider.age && <span>Age {provider.age}</span>}
                {fees && <span className="text-ink">{fees}</span>}
              </div>
            </div>
          </div>

          {provider.help_statement && (
            <p className="mt-6 border-t border-line-soft pt-5 leading-relaxed text-ink">
              {provider.help_statement}
            </p>
          )}
        </header>

        {provider.bio && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">About</h2>
            <p className="mt-3 leading-relaxed text-muted">{provider.bio}</p>
          </section>
        )}

        {provider.services.length > 0 && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Teaches</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {provider.services.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted"
                >
                  {s.name}
                </span>
              ))}
            </div>
            {(provider.teaching_places || []).length > 0 && (
              <div className="mt-5 border-t border-line-soft pt-4">
                <p className="cf-eyebrow">How classes run</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(provider.teaching_places || []).map((p) => (
                    <span key={p} className="cf-badge cf-badge-neutral">
                      {placeLabel[p] || p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {Object.keys(byPlace).length > 0 && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Availability</h2>
            <div className="mt-4 space-y-4">
              {Object.entries(byPlace).map(([place, slots]) => (
                <div key={place}>
                  <p className="text-sm font-semibold text-ink">{place}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slots.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted"
                      >
                        {DAY_LABEL[s.day] || s.day} {s.start}–{s.end}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(provider.branches.length > 0 || provider.service_areas.length > 0) && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">
              {isInstitution ? "Branches" : "Areas served"}
            </h2>
            {isInstitution ? (
              <div className="mt-4 space-y-3">
                {provider.branches.map((b, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface-2 p-4">
                    <p className="font-semibold text-ink">{b.label}</p>
                    <p className="mt-1 text-sm text-muted">{b.address}</p>
                    {b.area_name && (
                      <p className="mt-1 text-sm text-faint">
                        {b.area_name}
                        {b.city_name ? `, ${b.city_name}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {provider.service_areas.map((a, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted"
                  >
                    {a.area_name}
                    <span className="ml-1.5 text-xs text-faint">{a.city_name}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {certifications.length > 0 && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Certifications</h2>
            <ul className="mt-4 space-y-2">
              {certifications.map((c, i) => (
                <li key={i} className="text-sm text-muted">
                  <span className="text-ink">{c.name}</span>
                  {c.issuer ? ` — ${c.issuer}` : ""}
                  {c.year ? ` (${c.year})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {provider.fees_note && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Fees</h2>
            {fees && <p className="mt-3 text-xl font-semibold text-ink">{fees}</p>}
            <p className="mt-2 text-sm text-muted">{provider.fees_note}</p>
          </section>
        )}

        {/* Two ways to make contact, in the order most parents want them:
            a call back first, a conversation for anyone with a question. */}
        <RaiseQueryForm
          providerId={provider.id}
          providerName={provider.display_name || "This coach"}
          services={provider.services || []}
        />

        <EnquiryForm
          providerId={provider.id}
          providerName={provider.display_name || "this coach"}
          services={provider.services || []}
        />

        {nearby.length > 0 && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Nearby</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {nearby.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-line bg-surface-2 px-4 py-2 text-sm text-muted transition hover:border-faint hover:text-ink"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
