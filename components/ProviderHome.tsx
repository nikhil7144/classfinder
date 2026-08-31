"use client";

import { useRouter } from "next/navigation";

export default function ProviderHome({
  profileComplete,
  providerType,
}: {
  profileComplete: boolean;
  providerType: string | null;
}) {
  const router = useRouter();

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
              Provider Dashboard
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
              {profileComplete ? "Your listing is live" : "Finish setting up your listing"}
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600">
              {providerType === "institution"
                ? "Manage your branches, and soon your space, bookings, and messages, from here."
                : "Bookings, spaces, and messages are coming in a later build — for now this is a placeholder home."}
            </p>
          </div>

          {!profileComplete && (
            <button
              onClick={() => router.push("/complete-profile/provider")}
              className="bg-yellow-500 text-white px-5 py-3 rounded-xl shadow-sm"
            >
              Complete Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
