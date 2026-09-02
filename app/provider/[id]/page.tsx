import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import EnquiryForm from "@/components/provider/EnquiryForm";
import { formatExperience, formatFees } from "@/lib/search";
import { WEEK_DAYS } from "@/lib/profile-rules";

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
  const { data: placeRows } = await supabase.from("teaching_place_master").select("id, label");
  const placeLabel = Object.fromEntries(
    ((placeRows as { id: string; label: string }[]) || []).map((p) => [p.id, p.label])
  );

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

  const isInstitution = provider.provider_type === "institution";

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <Link href="/search" className="text-sm text-muted transition hover:text-ink">
          ← Back to search
        </Link>

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

        <EnquiryForm
          providerId={provider.id}
          providerName={provider.display_name || "this coach"}
          services={provider.services || []}
        />
      </div>
    </main>
  );
}
