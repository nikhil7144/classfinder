import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServerAdmin } from "@/lib/supabase-server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { formatExperience, formatFees } from "@/lib/search";
import { WEEK_DAYS } from "@/lib/profile-rules";

type Params = { params: Promise<{ id: string }> };

type Availability = { day: string; place: string; start: string; end: string };
type Certification = { name: string; issuer?: string; year?: string };

const DAY_LABEL = Object.fromEntries(WEEK_DAYS.map((d) => [d.value, d.label]));
// Widened to string[]: availability comes back from JSONB, so a day value
// is not narrowed to the literal union the constant carries.
const DAY_ORDER: string[] = WEEK_DAYS.map((d) => d.value);

export default async function ProviderProfilePage({ params }: Params) {
  const { id } = await params;

  const { data: provider } = await supabaseServerAdmin
    .from("providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Mirror what the public can see: an unapproved, suspended, or event-planner
  // provider has no public page, regardless of who holds the link.
  if (
    !provider ||
    !provider.approved ||
    provider.is_suspended ||
    provider.provider_type === "event_planner"
  ) {
    notFound();
  }

  const [{ data: category }, { data: services }, { data: branches }, { data: areaLinks }, { data: placeRows }] =
    await Promise.all([
      provider.provider_category_id
        ? supabaseServerAdmin
            .from("provider_category_master")
            .select("name")
            .eq("id", provider.provider_category_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      provider.service_category_ids?.length
        ? supabaseServerAdmin
            .from("service_category_master")
            .select("id, name, group")
            .in("id", provider.service_category_ids)
        : Promise.resolve({ data: [] }),
      supabaseServerAdmin
        .from("branches")
        .select("label, address, area_id, phone")
        .eq("provider_id", provider.id),
      supabaseServerAdmin
        .from("provider_service_areas")
        .select("area_id")
        .eq("provider_id", provider.id),
      supabaseServerAdmin.from("teaching_place_master").select("id, label"),
    ]);

  const areaIds = [
    ...(areaLinks || []).map((l) => l.area_id),
    ...(branches || []).map((b) => b.area_id).filter(Boolean),
  ];

  const { data: areaRows } = areaIds.length
    ? await supabaseServerAdmin
        .from("areas")
        .select("id, name, city_id, cities(name)")
        .in("id", areaIds)
    : { data: [] };

  const areaById = Object.fromEntries(
    ((areaRows as { id: string; name: string; cities: { name: string } | null }[]) || []).map((a) => [
      a.id,
      { name: a.name, city: a.cities?.name ?? "" },
    ])
  );
  const placeLabel = Object.fromEntries(
    ((placeRows as { id: string; label: string }[]) || []).map((p) => [p.id, p.label])
  );

  const fees = formatFees(provider.fee_min, provider.fee_max, provider.fee_period);
  const experience = formatExperience(provider.experience_years);
  const certifications = (provider.certifications || []) as Certification[];

  // Group availability by place, then order days properly — a raw list is
  // hard to read, and a parent is deciding "can I get there on a Saturday".
  const availability = (provider.availability || []) as Availability[];
  const byPlace = availability.reduce<Record<string, Availability[]>>((acc, slot) => {
    (acc[slot.place] = acc[slot.place] || []).push(slot);
    return acc;
  }, {});
  for (const slots of Object.values(byPlace)) {
    slots.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start.localeCompare(b.start));
  }

  // Booking and messaging land in later phases; until then be honest rather
  // than showing a button that does nothing.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const serviceList = (services as { id: string; name: string }[]) || [];
  const servedAreas = (areaLinks || []).map((l) => areaById[l.area_id]).filter(Boolean);

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
              <p className="mt-1 text-muted">{category?.name}</p>
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

        {serviceList.length > 0 && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Teaches</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {serviceList.map((s) => (
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
                  {(provider.teaching_places as string[]).map((p) => (
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

        {(servedAreas.length > 0 || (branches || []).length > 0) && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">
              {provider.provider_type === "institution" ? "Branches" : "Areas served"}
            </h2>
            {provider.provider_type === "institution" ? (
              <div className="mt-4 space-y-3">
                {(branches || []).map((b, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface-2 p-4">
                    <p className="font-semibold text-ink">{b.label}</p>
                    <p className="mt-1 text-sm text-muted">{b.address}</p>
                    {b.area_id && areaById[b.area_id] && (
                      <p className="mt-1 text-sm text-faint">
                        {areaById[b.area_id].name}, {areaById[b.area_id].city}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {servedAreas.map((a, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted"
                  >
                    {a.name}
                    <span className="ml-1.5 text-xs text-faint">{a.city}</span>
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

        <section className="cf-card p-7 text-center">
          <p className="text-sm text-muted">
            Messaging and booking arrive in a later release.
          </p>
          {!user && (
            <p className="mt-3 text-sm text-faint">
              <Link href="/signup/seeker" className="font-semibold text-gold hover:text-accent-ink">
                Create an account
              </Link>{" "}
              and you&apos;ll be ready when they do.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
