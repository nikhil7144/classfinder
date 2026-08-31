"use client";

import { useEffect, useState } from "react";
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
  provider_type: string;
  provider_category_id: string | null;
  city: string | null;
  area: string | null;
  service_category_ids: string[] | null;
  photo_url: string | null;
  approved: boolean;
  is_suspended: boolean;
  is_featured: boolean;
};

export default function AdminProviderDetail() {
  const params = useParams();
  const id = params?.id as string;

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [serviceNames, setServiceNames] = useState<string[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: providerData } = await supabase
        .from("providers")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!providerData) {
        setLoading(false);
        return;
      }

      setProvider(providerData as ProviderDetail);

      const [{ data: category }, { data: services }, { data: branchRows }] = await Promise.all([
        providerData.provider_category_id
          ? supabase
              .from("provider_category_master")
              .select("name")
              .eq("id", providerData.provider_category_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        providerData.service_category_ids?.length
          ? supabase.from("service_category_master").select("name").in("id", providerData.service_category_ids)
          : Promise.resolve({ data: [] }),
        providerData.provider_type === "institution"
          ? supabase.from("branches").select("*").eq("provider_id", providerData.id)
          : Promise.resolve({ data: [] }),
      ]);

      setCategoryName(category?.name || "");
      setServiceNames(((services as { name: string }[] | null) || []).map((s) => s.name));
      setBranches((branchRows as Branch[] | null) || []);
      setLoading(false);
    };

    if (id) load();
  }, [id]);

  const toggleApproval = async () => {
    if (!provider) return;
    const { error } = await supabase
      .from("providers")
      .update({ approved: !provider.approved })
      .eq("id", provider.id);

    if (!error) setProvider({ ...provider, approved: !provider.approved });
  };

  const toggleSuspension = async () => {
    if (!provider) return;
    const { error } = await supabase
      .from("providers")
      .update({ is_suspended: !provider.is_suspended })
      .eq("id", provider.id);

    if (!error) setProvider({ ...provider, is_suspended: !provider.is_suspended });
  };

  const toggleFeatured = async () => {
    if (!provider) return;
    const { error } = await supabase
      .from("providers")
      .update({ is_featured: !provider.is_featured })
      .eq("id", provider.id);

    if (!error) setProvider({ ...provider, is_featured: !provider.is_featured });
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!provider) return <div className="p-8 text-sm text-gray-500">Provider not found.</div>;

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
              {provider.approved ? "Approved" : "Pending"}
            </span>
          )}
          {provider.is_featured && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">Featured</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-6 space-y-3 text-sm">
          <h2 className="text-base font-semibold text-gray-900">Profile</h2>
          <p className="text-gray-600">{provider.bio || "No bio added."}</p>
          <div className="text-gray-500">Category: {categoryName || "—"}</div>
          <div className="text-gray-500">
            Location: {[provider.area, provider.city].filter(Boolean).join(", ") || "—"}
          </div>
          <div className="text-gray-500">Teaches/coaches: {serviceNames.join(", ") || "—"}</div>
          {provider.photo_url && (
            <img
              src={provider.photo_url}
              alt={provider.display_name || "Provider photo"}
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
          onClick={toggleApproval}
          disabled={provider.is_suspended}
          className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            provider.approved ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {provider.approved ? "Disapprove" : "Approve"}
        </button>
        <button
          onClick={toggleFeatured}
          className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          {provider.is_featured ? "Unfeature" : "Feature"}
        </button>
        <button
          onClick={toggleSuspension}
          className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition ${
            provider.is_suspended ? "bg-slate-600 hover:bg-slate-700" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {provider.is_suspended ? "Reinstate" : "Suspend"}
        </button>
      </div>
    </div>
  );
}
