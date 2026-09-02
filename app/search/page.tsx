"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  fetchSeekerLocations,
  fetchTaxonomy,
  type Area,
  type City,
  type ProviderCategory,
  type ServiceCategory,
  type TeachingPlace,
} from "@/lib/api/reference";
import ProviderCard from "@/components/ProviderCard";
import {
  DEFAULT_RADIUS_KM,
  RADIUS_OPTIONS,
  SearchResult,
  searchProviders,
} from "@/lib/search";
import { ServiceOption, groupServices } from "@/lib/requirements";
import SuggestedCoaches from "@/components/seeker/SuggestedCoaches";


// ServiceOption is structurally the generated ServiceCategory, so the two
// interoperate and lib/requirements' grouping helpers still take these rows.
type Service = ServiceOption;
type Category = ProviderCategory;

function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [places, setPlaces] = useState<TeachingPlace[]>([]);

  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState(params.get("area") || "");
  const [serviceId, setServiceId] = useState(params.get("service") || "");
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  /**
   * The subject filter was applied from the parent's saved requirement rather
   * than chosen here. Tracked so the page can say so and offer to undo it — a
   * search that silently starts filtered is a search that quietly hides
   * results, which is the one thing a search must never do without saying.
   */
  const [subjectFromProfile, setSubjectFromProfile] = useState(false);

  useEffect(() => {
    const load = async () => {
      // One call for all five, shared with every other screen that needs
      // them. fetchSeekerLocations applies the area-wise launch gate: seekers
      // only ever see live areas.
      const [{ cities: c, areas: a }, taxonomy] = await Promise.all([
        fetchSeekerLocations(),
        fetchTaxonomy(),
      ]);

      setCities(c);
      setAreas(a);
      setServices(taxonomy.serviceCategories);
      setCategories(taxonomy.providerCategories);
      setPlaces(taxonomy.teachingPlaces);

      // Start from what this parent has already told us.
      //
      // A link carrying ?area= or ?service= always wins: it was either shared
      // with them or is their own back button, and either way it is a more
      // specific intent than a profile field. Guests and coaches have no
      // seekers row, so both reads come back empty and nothing changes.
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data: me } = await supabase
        .from("seekers")
        .select("area_id, looking_for")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (!me) return;

      // Their area was asked for at signup and then never used here, so
      // arriving from the navbar showed "choose an area" to someone who had.
      //
      // The city goes with it. The effect below has already defaulted it to
      // the first city by the time this returns, and if the parent lives in
      // any other one their area would not be among that city's options —
      // leaving a filled-in search behind an apparently empty dropdown.
      if (!params.get("area") && me.area_id) {
        setAreaId(me.area_id);
        const home = ((a as Area[]) || []).find((row) => row.id === me.area_id);
        if (home) setCityId(home.cityId);
      }

      // Only when there is exactly one thing they want. Two subjects have no
      // single right answer, and picking one of them for someone is worse
      // than picking none.
      const wanted: string[] = me.looking_for || [];
      if (!params.get("service") && wanted.length === 1) {
        setServiceId(wanted[0]);
        setSubjectFromProfile(true);
      }
    };

    load();
    // params is read once, as the opening state — a later URL rewrite by this
    // page's own shareable-link effect must not re-run any of this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default the city to whichever one holds the selected area.
  useEffect(() => {
    if (cityId || cities.length === 0) return;
    const fromArea = areas.find((a) => a.id === areaId);
    setCityId(fromArea?.cityId ?? cities[0].id);
  }, [cities, areas, areaId, cityId]);

  const cityAreas = useMemo(
    () => areas.filter((a) => a.cityId === cityId),
    [areas, cityId]
  );

  const categoryName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const serviceName = useMemo(
    () => Object.fromEntries(services.map((s) => [s.id, s.name])),
    [services]
  );
  const placeLabel = useMemo(
    () => Object.fromEntries(places.map((p) => [p.id, p.label])),
    [places]
  );

  const servicesByGroup = useMemo(() => groupServices(services), [services]);

  const runSearch = useCallback(async () => {
    if (!areaId && !coords) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { results: found } = await searchProviders({
      areaId: areaId || null,
      serviceCategoryId: serviceId || null,
      coords,
      radiusKm,
    });
    setResults(found);
    setSearched(true);
    setLoading(false);
  }, [areaId, serviceId, coords, radiusKm]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  // Keep the URL shareable.
  useEffect(() => {
    const q = new URLSearchParams();
    if (areaId) q.set("area", areaId);
    if (serviceId) q.set("service", serviceId);
    const qs = q.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [areaId, serviceId, router]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote("Your browser can't share location — pick an area instead.");
      return;
    }
    setLocating(true);
    setLocationNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setLocationNote("Sorted by distance from you.");
      },
      () => {
        setLocating(false);
        setLocationNote("No problem — results are sorted from the centre of your area.");
      },
      { timeout: 10000 }
    );
  };

  const noAreasYet = areas.length === 0;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="cf-eyebrow">Find classes</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">Who&apos;s teaching near you</h1>

        {noAreasYet ? (
          <div className="cf-card mt-8 p-8 text-center">
            <p className="text-muted">
              We haven&apos;t opened any areas yet. ClassFinder launches area by area — check back
              shortly.
            </p>
          </div>
        ) : (
          <>
            <section className="cf-card mt-6 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs text-muted">City</label>
                  <select
                    className="cf-input"
                    value={cityId}
                    onChange={(e) => {
                      setCityId(e.target.value);
                      setAreaId("");
                    }}
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs text-muted">Area</label>
                  <select
                    className="cf-input"
                    value={areaId}
                    onChange={(e) => setAreaId(e.target.value)}
                  >
                    <option value="">Choose an area…</option>
                    {cityAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs text-muted">What are you looking for?</label>
                  <select
                    className="cf-input"
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      // Once they touch it, it is their choice and the note
                      // about where it came from stops being true.
                      setSubjectFromProfile(false);
                    }}
                  >
                    <option value="">Anything</option>
                    {servicesByGroup.map((g) => (
                      <optgroup key={g.group} label={g.label}>
                        {g.items.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Said out loud, with the undo next to it. The filter is doing
                  the parent a favour and hiding coaches to do it, and only one
                  of those two is visible in the dropdown. */}
              {subjectFromProfile && serviceId && (
                <p className="mt-3 text-xs text-muted">
                  Filtered to{" "}
                  <span className="font-semibold text-ink">{serviceName[serviceId]}</span> because
                  that&apos;s what you said you&apos;re looking for.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setServiceId("");
                      setSubjectFromProfile(false);
                    }}
                    className="cursor-pointer font-semibold text-gold underline-offset-2 transition hover:text-accent-ink hover:underline"
                  >
                    Show everything
                  </button>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
                <button type="button" onClick={useMyLocation} disabled={locating} className="cf-btn-ghost px-4 py-2 text-sm">
                  {locating ? "Locating…" : coords ? "Location on" : "Use my location"}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Within</span>
                  {RADIUS_OPTIONS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      className="cf-pill px-3 py-1.5 text-xs"
                      data-selected={radiusKm === km}
                      onClick={() => setRadiusKm(km)}
                    >
                      {km} km
                    </button>
                  ))}
                </div>

                {locationNote && <span className="text-xs text-faint">{locationNote}</span>}
              </div>
            </section>

            {/* Above the results, not inside them: a parent who has already
                told us what they want should not have to re-run their own
                search to be shown the answer. Renders nothing for anyone who
                hasn't, which includes every guest. */}
            <SuggestedCoaches variant="search" />

            <section className="mt-6">
              {loading ? (
                <p className="py-10 text-center text-sm text-muted">Searching…</p>
              ) : !searched ? (
                <div className="cf-card p-8 text-center">
                  <p className="text-muted">
                    Choose an area, or share your location, to see who teaches nearby.
                  </p>
                </div>
              ) : results.length === 0 ? (
                <div className="cf-card p-8 text-center">
                  <p className="text-ink">Nothing here yet.</p>
                  <p className="mt-2 text-sm text-muted">
                    {radiusKm < Math.max(...RADIUS_OPTIONS)
                      ? "Try widening the distance, or removing the subject filter."
                      : "Try removing the subject filter, or a different area."}
                  </p>
                  {radiusKm < Math.max(...RADIUS_OPTIONS) && (
                    <button
                      type="button"
                      onClick={() => setRadiusKm(Math.max(...RADIUS_OPTIONS))}
                      className="cf-btn-ghost mt-5 px-5 py-2 text-sm"
                    >
                      Search within {Math.max(...RADIUS_OPTIONS)} km
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">
                    {results.length} {results.length === 1 ? "match" : "matches"}
                    {coords ? ", nearest first" : ""}
                  </p>
                  <div className="space-y-3">
                    {results.map((r) => (
                      <ProviderCard
                        key={r.id}
                        provider={r}
                        categoryName={categoryName[r.provider_category_id || ""]}
                        serviceNames={(r.service_category_ids || [])
                          .map((id) => serviceName[id])
                          .filter(Boolean)}
                        teachingPlaceLabels={placeLabel}
                        showDistance={Boolean(coords)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function SearchPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <SearchPage />
    </Suspense>
  );
}
