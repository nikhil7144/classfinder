"use client";

import { useMemo, useState } from "react";

export type CityRow = { id: string; name: string; state: string | null };
export type AreaRow = { id: string; city_id: string; name: string; is_live: boolean };

type MultiProps = {
  cities: CityRow[];
  areas: AreaRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
};

/**
 * Areas a provider serves. Every defined area is offered, including ones not
 * yet live — providers can register anywhere, and `is_live` only gates what
 * seekers can search, so supply can build up before an area opens.
 */
export function ServiceAreaPicker({ cities, areas, selectedIds, onChange, invalid }: MultiProps) {
  // Cities arrive after first render, so an initial useState value would
  // capture "" and never update. Derive the effective city instead, letting
  // an explicit choice override the default.
  const [chosenCityId, setChosenCityId] = useState<string>("");
  const cityId = chosenCityId || cities[0]?.id || "";
  const [query, setQuery] = useState("");

  const cityAreas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return areas
      .filter((a) => a.city_id === cityId)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [areas, cityId, query]);

  const selected = useMemo(
    () => areas.filter((a) => selectedIds.includes(a.id)),
    [areas, selectedIds]
  );

  const cityNameById = useMemo(
    () => Object.fromEntries(cities.map((c) => [c.id, c.name])),
    [cities]
  );

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  if (cities.length === 0) {
    return (
      <p className="text-sm text-muted">
        No cities have been set up yet. Ask an admin to add your city and areas.
      </p>
    );
  }

  return (
    <div className={invalid ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-4" : ""}>
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-surface-2 p-3">
          {selected.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              aria-label={`Remove ${a.name}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-ink px-3.5 py-2 text-sm font-semibold text-[#1a0d06]"
            >
              {a.name}
              <span className="text-xs opacity-70">{cityNameById[a.city_id]}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          className="cf-input sm:max-w-[14rem]"
          value={cityId}
          onChange={(e) => {
            setChosenCityId(e.target.value);
            setQuery("");
          }}
          aria-label="City"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.state ? ` — ${c.state}` : ""}
            </option>
          ))}
        </select>
        <input
          className="cf-input"
          placeholder="Search areas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {cityAreas.length === 0 ? (
          <p className="text-sm text-faint">
            {query.trim() ? `No areas match “${query.trim()}”.` : "No areas in this city yet."}
          </p>
        ) : (
          cityAreas.map((a) => (
            <button
              key={a.id}
              type="button"
              className="cf-pill"
              data-selected={selectedIds.includes(a.id)}
              onClick={() => toggle(a.id)}
            >
              {a.name}
              {!a.is_live && (
                <span className="ml-1.5 text-[0.7rem] opacity-60" title="Not open to seekers yet">
                  soon
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

type SingleProps = {
  cities: CityRow[];
  areas: AreaRow[];
  areaId: string | null;
  onChange: (areaId: string | null) => void;
};

/** One city + one area, for a single branch location. */
export function BranchAreaSelect({ cities, areas, areaId, onChange }: SingleProps) {
  const currentCityId = useMemo(() => {
    const area = areas.find((a) => a.id === areaId);
    return area?.city_id ?? cities[0]?.id ?? "";
  }, [areaId, areas, cities]);

  // Same reason as above: cities load after first render, so hold only an
  // explicit override and fall back to the area's own city.
  const [chosenCityId, setChosenCityId] = useState<string | null>(null);
  const cityId = chosenCityId ?? currentCityId;

  const cityAreas = useMemo(
    () => areas.filter((a) => a.city_id === cityId).sort((a, b) => a.name.localeCompare(b.name)),
    [areas, cityId]
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <select
        className="cf-input"
        value={cityId}
        onChange={(e) => {
          setChosenCityId(e.target.value);
          onChange(null); // the previous area belongs to the old city
        }}
        aria-label="Branch city"
      >
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        className="cf-input"
        value={areaId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Branch area"
      >
        <option value="">Select area…</option>
        {cityAreas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.is_live ? "" : " (soon)"}
          </option>
        ))}
      </select>
    </div>
  );
}
