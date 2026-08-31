"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type City = { id: string; name: string; state: string | null; is_active: boolean };
type Area = {
  id: string;
  city_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  is_live: boolean;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400";

const emptyAreaDraft = { name: "", lat: "", lng: "" };

export default function LocationsAdmin() {
  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [cityDraft, setCityDraft] = useState({ name: "", state: "" });
  const [openCityId, setOpenCityId] = useState<string | null>(null);
  const [areaDraft, setAreaDraft] = useState(emptyAreaDraft);
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [areaEdit, setAreaEdit] = useState(emptyAreaDraft);

  const load = useCallback(async () => {
    const [{ data: cityRows }, { data: areaRows }] = await Promise.all([
      supabase.from("cities").select("*").order("name"),
      supabase.from("areas").select("*").order("name"),
    ]);

    setCities((cityRows as City[]) || []);
    setAreas((areaRows as Area[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const areasByCity = useMemo(() => {
    return areas.reduce<Record<string, Area[]>>((acc, area) => {
      (acc[area.city_id] = acc[area.city_id] || []).push(area);
      return acc;
    }, {});
  }, [areas]);

  const call = async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setBusy(true);
    setError("");

    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/locations", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error || "Something went wrong.");
      return false;
    }

    await load();
    return true;
  };

  const addCity = async () => {
    if (!cityDraft.name.trim()) return;
    if (await call("POST", { entity: "city", ...cityDraft })) {
      setCityDraft({ name: "", state: "" });
    }
  };

  const addArea = async (cityId: string) => {
    if (!areaDraft.name.trim()) return;
    if (await call("POST", { entity: "area", cityId, ...areaDraft })) {
      setAreaDraft(emptyAreaDraft);
    }
  };

  const saveArea = async (id: string) => {
    if (await call("PATCH", { entity: "area", id, ...areaEdit })) {
      setEditingArea(null);
    }
  };

  const liveCount = areas.filter((a) => a.is_live).length;
  const missingCoords = areas.filter((a) => a.lat === null || a.lng === null).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Cities & Areas</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Areas are how the platform launches: providers can register in any area you define, but
          seekers only see areas marked live. Coordinates drive distance ranking and are the
          fallback origin when a seeker won&apos;t share GPS.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {cities.length} cities
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {areas.length} areas
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            {liveCount} live
          </span>
          {missingCoords > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
              {missingCoords} missing coordinates
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Add a city</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            placeholder="City, e.g. Ghaziabad"
            value={cityDraft.name}
            onChange={(e) => setCityDraft({ ...cityDraft, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addCity()}
          />
          <input
            className={inputClass}
            placeholder="State, e.g. Uttar Pradesh"
            value={cityDraft.state}
            onChange={(e) => setCityDraft({ ...cityDraft, state: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addCity()}
          />
          <button
            onClick={addCity}
            disabled={busy || !cityDraft.name.trim()}
            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            Add City
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>
      ) : cities.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">
          No cities yet — add one above.
        </div>
      ) : (
        <div className="space-y-4">
          {cities.map((city) => {
            const cityAreas = areasByCity[city.id] || [];
            const open = openCityId === city.id;

            return (
              <div key={city.id} className="rounded-2xl border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <button
                    onClick={() => {
                      setOpenCityId(open ? null : city.id);
                      setAreaDraft(emptyAreaDraft);
                      setEditingArea(null);
                    }}
                    className="flex items-center gap-3 text-left"
                  >
                    <span className="text-gray-400">{open ? "−" : "+"}</span>
                    <span className="text-base font-semibold text-gray-900">{city.name}</span>
                    {city.state && <span className="text-sm text-gray-500">{city.state}</span>}
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                      {cityAreas.length} area{cityAreas.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
                      {cityAreas.filter((a) => a.is_live).length} live
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => call("PATCH", { entity: "city", id: city.id, isActive: !city.is_active })}
                      disabled={busy}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
                    >
                      {city.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    {cityAreas.length === 0 && (
                      <button
                        onClick={() => call("DELETE", { entity: "city", id: city.id })}
                        disabled={busy}
                        className="rounded-lg px-3 py-1.5 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="space-y-2">
                      {cityAreas.length === 0 && (
                        <p className="text-sm text-gray-500">No areas in this city yet.</p>
                      )}

                      {cityAreas.map((area) =>
                        editingArea === area.id ? (
                          <div key={area.id} className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                              <input
                                className={inputClass}
                                placeholder="Area name"
                                value={areaEdit.name}
                                onChange={(e) => setAreaEdit({ ...areaEdit, name: e.target.value })}
                              />
                              <input
                                className={inputClass}
                                placeholder="Latitude"
                                value={areaEdit.lat}
                                onChange={(e) => setAreaEdit({ ...areaEdit, lat: e.target.value })}
                              />
                              <input
                                className={inputClass}
                                placeholder="Longitude"
                                value={areaEdit.lng}
                                onChange={(e) => setAreaEdit({ ...areaEdit, lng: e.target.value })}
                              />
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => saveArea(area.id)}
                                disabled={busy}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingArea(null)}
                                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={area.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-medium text-gray-900">{area.name}</span>
                              {area.lat !== null && area.lng !== null ? (
                                <span className="font-mono text-xs text-gray-500">
                                  {area.lat.toFixed(4)}, {area.lng.toFixed(4)}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
                                  no coordinates
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  area.is_live
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-gray-200 text-gray-600"
                                }`}
                              >
                                {area.is_live ? "Live" : "Not live"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingArea(area.id);
                                  setAreaEdit({
                                    name: area.name,
                                    lat: area.lat === null ? "" : String(area.lat),
                                    lng: area.lng === null ? "" : String(area.lng),
                                  });
                                }}
                                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => call("PATCH", { entity: "area", id: area.id, isLive: !area.is_live })}
                                disabled={busy}
                                className={`rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                                  area.is_live
                                    ? "text-gray-600 hover:bg-gray-200"
                                    : "text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {area.is_live ? "Turn off" : "Go live"}
                              </button>
                              <button
                                onClick={() => call("DELETE", { entity: "area", id: area.id })}
                                disabled={busy}
                                className="rounded-lg px-3 py-1.5 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Add area to {city.name}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                        <input
                          className={inputClass}
                          placeholder="Area, e.g. Indirapuram"
                          value={areaDraft.name}
                          onChange={(e) => setAreaDraft({ ...areaDraft, name: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && addArea(city.id)}
                        />
                        <input
                          className={inputClass}
                          placeholder="Latitude"
                          value={areaDraft.lat}
                          onChange={(e) => setAreaDraft({ ...areaDraft, lat: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && addArea(city.id)}
                        />
                        <input
                          className={inputClass}
                          placeholder="Longitude"
                          value={areaDraft.lng}
                          onChange={(e) => setAreaDraft({ ...areaDraft, lng: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && addArea(city.id)}
                        />
                        <button
                          onClick={() => addArea(city.id)}
                          disabled={busy || !areaDraft.name.trim()}
                          className="shrink-0 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Tip: right-click a spot in Google Maps and copy the coordinates — the first
                        number is latitude, the second longitude. An area needs both before it can go live.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
