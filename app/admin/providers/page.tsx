"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProviderRow = {
  id: string;
  display_name: string | null;
  provider_type: string;
  city: string | null;
  approved: boolean;
  is_suspended: boolean;
};

export default function AdminProviders() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, display_name, provider_type, city, approved, is_suspended")
        .order("approved")
        .order("display_name");

      setProviders((data as ProviderRow[]) || []);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Providers</h1>
        <p className="mt-2 text-sm text-gray-500">
          Review a listing before it appears in search — open a provider to see their branches,
          categories, and photo, then approve or suspend.
        </p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>
        ) : providers.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">
            No providers yet.
          </div>
        ) : (
          providers.map((provider) => (
            <Link
              key={provider.id}
              href={`/admin/providers/${provider.id}`}
              className="block rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {provider.display_name || "Unnamed provider"}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      {provider.provider_type}
                    </span>
                    {provider.is_suspended ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700">
                        Suspended
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          provider.approved ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {provider.approved ? "Approved" : "Pending"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{provider.city || "No city set"}</p>
                </div>

                <span className="text-sm font-semibold text-indigo-600">Review →</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
