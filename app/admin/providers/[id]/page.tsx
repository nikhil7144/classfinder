"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Branch = {
  id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  phone: string | null;
};

type ProviderDetail = {
  id: string;
  display_name: string | null;
  bio: string | null;
  help_statement: string | null;
  provider_type: string;
  city: string | null;
  area: string | null;
  photo_url: string | null;
  approved: boolean;
  is_suspended: boolean;
  is_featured: boolean;
  experience_years: number | null;
  age: number | null;
  fee_min: number | null;
  fee_max: number | null;
  fee_period: string | null;
  certifications: { name: string; issuer?: string; year?: string }[] | null;
  availability: { day: string; place: string; start: string; end: string }[] | null;
};

export default function AdminProviderDetail() {
  const params = useParams();
  const id = params?.id as string;

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [serviceNames, setServiceNames] = useState<string[]>([]);
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ""}` };
  };

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/providers?id=${id}`, { headers: await authHeader() });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to load this provider.");
      setLoading(false);
      return;
    }

    setProvider(result.provider);
    setCategoryName(result.categoryName || "");
    setServiceNames(result.serviceNames || []);
    setAreaNames(result.areaNames || []);
    setBranches(result.branches || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // Every action goes through the admin API. Updating via the anon client
  // matched no rows under RLS and returned success while changing nothing.
  const update = async (patch: Record<string, boolean>) => {
    setBusy(true);
    setError("");

    const response = await fetch("/api/admin/providers", {
      method: "PATCH",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error || "That didn't work.");
      return;
    }

    setProvider((prev) => (prev ? { ...prev, ...result.provider } : prev));
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!provider) return <div className="p-8 text-sm text-gray-500">Provider not found.</div>;

  const fees =
    provider.fee_min !== null || provider.fee_max !== null
      ? `₹${provider.fee_min ?? "?"}–${provider.fee_max ?? "?"} ${provider.fee_period || ""}`
      : "Not set";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/providers" className="text-sm text-indigo-600 hover:text-indigo-700">
          ← Back to Providers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {provider.display_name || "Unnamed provider"}
          </h1>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
            {provider.provider_type}
          </span>
          {provider.is_suspended ? (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700">Suspended</span>
          ) : (
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                provider.approved ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
              }`}
            >
              {provider.approved ? "Approved" : "Awaiting review"}
            </span>
          )}
          {provider.is_featured && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">Featured</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-gray-200 p-6 text-sm">
          <h2 className="text-base font-semibold text-gray-900">Profile</h2>
          {provider.help_statement && (
            <p className="text-gray-700">{provider.help_statement}</p>
          )}
          <p className="text-gray-600">{provider.bio || "No bio added."}</p>
          <div className="text-gray-500">Category: {categoryName || "—"}</div>
          <div className="text-gray-500">
            Experience: {provider.experience_years ?? "—"} yrs
            {provider.age ? ` · Age ${provider.age}` : ""}
          </div>
          <div className="text-gray-500">Fees: {fees}</div>
          <div className="text-gray-500">Teaches: {serviceNames.join(", ") || "—"}</div>
          <div className="text-gray-500">
            {provider.provider_type === "institution" ? "Branch areas" : "Serves"}:{" "}
            {areaNames.join(", ") || "—"}
          </div>
          <div className="text-gray-500">
            Certifications:{" "}
            {(provider.certifications || []).map((c) => c.name).join(", ") || "—"}
          </div>
          <div className="text-gray-500">
            Availability: {(provider.availability || []).length} slot(s)
          </div>
          {provider.photo_url && (
            <img
              src={provider.photo_url}
              alt=""
              className="mt-2 h-24 w-24 rounded-2xl border object-cover"
            />
          )}
        </div>

        {provider.provider_type === "institution" && (
          <div className="rounded-2xl border border-gray-200 p-6 text-sm">
            <h2 className="text-base font-semibold text-gray-900">Branches ({branches.length})</h2>
            <div className="mt-3 space-y-3">
              {branches.length === 0 ? (
                <p className="text-gray-500">No branches added.</p>
              ) : (
                branches.map((branch) => (
                  <div key={branch.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="font-medium text-gray-900">{branch.label || "Unnamed branch"}</div>
                    <div className="text-gray-500">{branch.address}</div>
                    <div className="text-gray-500">
                      {[branch.area, branch.city].filter(Boolean).join(", ")}
                      {branch.phone ? ` · ${branch.phone}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => update({ approved: !provider.approved })}
          disabled={busy || provider.is_suspended}
          className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            provider.approved ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {provider.approved ? "Disapprove" : "Approve"}
        </button>
        <button
          onClick={() => update({ is_featured: !provider.is_featured })}
          disabled={busy}
          className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
        >
          {provider.is_featured ? "Unfeature" : "Feature"}
        </button>
        <button
          onClick={() => update({ is_suspended: !provider.is_suspended })}
          disabled={busy}
          className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
            provider.is_suspended ? "bg-slate-600 hover:bg-slate-700" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {provider.is_suspended ? "Reinstate" : "Suspend"}
        </button>
      </div>
    </div>
  );
}
