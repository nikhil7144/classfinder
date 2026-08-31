"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ProviderCard from "@/components/ProviderCard";
import {
  DEFAULT_RADIUS_KM,
  RADIUS_OPTIONS,
  SearchResult,
  searchProviders,
} from "@/lib/search";

type City = { id: string; name: string };
type Area = { id: string; city_id: string; name: string };
type Service = { id: string; name: string; group: string };
type Category = { id: string; name: string };
type TeachingPlace = { id: string; label: string };

const GROUP_LABEL: Record<string, string> = {
  sport: "Sports",
  wellness_fitness: "Wellness & Fitness",
  mind_game: "Mind Games",
  indoor_game: "Indoor Games",
  dance: "Dance",
  music: "Music",
  subject: "School Subjects",
  exam_board: "Boards & Exams",
};

const GROUP_ORDER = Object.keys(GROUP_LABEL);

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

  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: a }, { data: s }, { data: cat }, { data: p }] = await Promise.all([
        supabase.from("cities").select("id, name").eq("is_active", true).order("name"),
        // Seekers only see live areas — that's the area-wise launch gate.
        supabase.from("areas").select("id, city_id, name").eq("is_live", true).order("name"),
        supabase.from("service_category_master").select("id, name, group").eq("is_active", true).order("name"),
        supabase.from("provider_category_master").select("id, name"),
        supabase.from("teaching_place_master").select("id, label"),
      ]);

      setCities((c as City[]) || []);
      setAreas((a as Area[]) || []);
      setServices((s as Service[]) || []);
      setCategories((cat as Category[]) || []);
      setPlaces((p as TeachingPlace[]) || []);
    };

    load();
  }, []);

  // Default the city to whichever one holds the selected area.
  useEffect(() => {
    if (cityId || cities.length === 0) return;
    const fromArea = areas.find((a) => a.id === areaId);
    setCityId(fromArea?.city_id ?? cities[0].id);
  }, [cities, areas, areaId, cityId]);

  const cityAreas = useMemo(
    () => areas.filter((a) => a.city_id === cityId),
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

  const servicesByGroup = useMemo(() => {
    const grouped = services.reduce<Record<string, Service[]>>((acc, s) => {
      (acc[s.group] = acc[s.group] || []).push(s);
      return acc;
    }, {});
    return GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => ({
      group: g,
      label: GROUP_LABEL[g],
      items: grouped[g],
    }));
  }, [services]);

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
                    onChange={(e) => setServiceId(e.target.value)}
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
