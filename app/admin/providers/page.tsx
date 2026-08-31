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
  is_featured: boolean;
};

export default function AdminProviders() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      // Through the admin API, not the anon client: RLS hides unapproved
      // providers from everyone but their owner, so reading directly showed
      // an admin zero of the rows they exist to act on.
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/providers", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Unable to load providers.");
        setLoading(false);
        return;
      }

      setProviders(result.providers || []);
      setLoading(false);
    };

    load();
  }, []);

  const pending = providers.filter((p) => !p.approved && !p.is_suspended);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Providers</h1>
        <p className="mt-2 text-sm text-gray-500">
          Review a listing before it appears in search — open one to see its branches, areas and
          services, then approve or suspend.
        </p>
        {!loading && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
              {providers.length} total
            </span>
            <span
              className={`rounded-full px-3 py-1 ${
                pending.length ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {pending.length} awaiting review
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

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
                          provider.approved
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {provider.approved ? "Approved" : "Awaiting review"}
                      </span>
                    )}
                    {provider.is_featured && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
                        Featured
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
