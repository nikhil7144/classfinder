"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProviderCategory = {
  id: string;
  name: string;
  provider_type: string;
  is_active: boolean;
};

const providerTypeOptions = [
  { value: "individual", label: "Individual" },
  { value: "institution", label: "Institution" },
];

export default function ProviderCategoriesAdmin() {
  const [categories, setCategories] = useState<ProviderCategory[]>([]);
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("individual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("provider_category_master")
      .select("*")
      .order("provider_type")
      .order("name");

    setCategories((data as ProviderCategory[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  const withAuthHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ""}` };
  };

  const addCategory = async () => {
    if (!name.trim() || saving) return;

    setSaving(true);
    setError("");

    const response = await fetch("/api/admin/taxonomy/provider-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await withAuthHeader()) },
      body: JSON.stringify({ name, providerType }),
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
    await fetch("/api/admin/taxonomy/provider-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await withAuthHeader()) },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Provider Categories</h1>
        <p className="mt-2 text-sm text-gray-500">
          The self-description providers pick at signup (Coach, Home Tutor, Sports Academy, etc.),
          each gated to individual or institution providers.
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
            placeholder="Category name"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-indigo-400"
          />
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-indigo-400"
          >
            {providerTypeOptions.map((option) => (
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

      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-8 text-sm text-gray-500">No categories yet.</div>
        ) : (
          categories.map((cat, index) => (
            <div
              key={cat.id}
              className={`flex items-center justify-between px-6 py-4 ${
                index !== categories.length - 1 ? "border-b border-gray-200" : ""
              } ${!cat.is_active ? "opacity-50" : ""}`}
            >
              <div>
                <span className="font-medium text-gray-900">{cat.name}</span>
                <span className="ml-3 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {cat.provider_type}
                </span>
              </div>
              <button
                onClick={() => toggleActive(cat.id, cat.is_active)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  cat.is_active ? "text-gray-500 hover:bg-gray-100" : "text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {cat.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
