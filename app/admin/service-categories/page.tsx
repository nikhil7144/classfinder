"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ServiceCategory = {
  id: string;
  name: string;
  group: string;
  is_active: boolean;
};

const groupOptions = [
  { value: "sport", label: "Sport" },
  { value: "wellness_fitness", label: "Wellness & Fitness" },
  { value: "mind_game", label: "Mind Game" },
  { value: "indoor_game", label: "Indoor Game" },
  { value: "dance", label: "Dance" },
  { value: "music", label: "Music" },
  { value: "subject", label: "Subject" },
  { value: "exam_board", label: "Exam Board" },
];

export default function ServiceCategoriesAdmin() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("sport");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("service_category_master")
      .select("*")
      .order("group")
      .order("name");

    setCategories((data as ServiceCategory[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  // The seeded taxonomy runs to 100+ rows, which is many screens of flat
  // list — filtering keeps a single edit from being a scroll hunt.
  const grouped = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const visible = query
      ? categories.filter((item) => item.name.toLowerCase().includes(query))
      : categories;

    return visible.reduce<Record<string, ServiceCategory[]>>((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [categories, filter]);

  const visibleCount = useMemo(
    () => Object.values(grouped).reduce((sum, items) => sum + items.length, 0),
    [grouped]
  );

  const withAuthHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ""}` };
  };

  const addCategory = async () => {
    if (!name.trim() || saving) return;

    setSaving(true);
    setError("");

    const response = await fetch("/api/admin/taxonomy/service-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await withAuthHeader()) },
      body: JSON.stringify({ name, group }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to add category.");
      setSaving(false);
      return;
    }

    setName("");
    setSaving(false);
    load();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/taxonomy/service-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await withAuthHeader()) },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Service Categories</h1>
        <p className="mt-2 text-sm text-gray-500">
          What providers actually teach or coach — sports, mind games, subjects, exams, and so on.
          Grouped so onboarding and search can stay organized as this list grows.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cricket, Chess, Class 10 Math, JEE"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-indigo-400"
          />
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-indigo-400"
          >
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={addCategory}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl shadow-sm transition disabled:opacity-60"
          >
            Add Category
          </button>
        </div>
      </div>

      <div className="mb-6">
        <input
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400"
          placeholder="Filter categories…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter.trim() && (
          <p className="mt-2 text-sm text-gray-500">
            {visibleCount} of {categories.length} shown
          </p>
        )}
      </div>

      <div className="space-y-6">
        {groupOptions.map((groupOption) => {
          const items = grouped[groupOption.value] || [];
          if (items.length === 0) return null;

          return (
            <div key={groupOption.value}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                {groupOption.label}
              </h2>
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                {items.map((cat, index) => (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between px-6 py-4 ${
                      index !== items.length - 1 ? "border-b border-gray-200" : ""
                    } ${!cat.is_active ? "opacity-50" : ""}`}
                  >
                    <span className="font-medium text-gray-900">{cat.name}</span>
                    <button
                      onClick={() => toggleActive(cat.id, cat.is_active)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        cat.is_active ? "text-gray-500 hover:bg-gray-100" : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {cat.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {categories.length === 0 && (
          <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">
            No service categories yet.
          </div>
        )}

        {categories.length > 0 && visibleCount === 0 && (
          <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">
            Nothing matches “{filter.trim()}”.
          </div>
        )}
      </div>
    </div>
  );
}
