"use client";

import { useRouter } from "next/navigation";

export default function SeekerHome({ profileComplete }: { profileComplete: boolean }) {
  const router = useRouter();

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
              Seeker Dashboard
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
              Find a coach, tutor, or coaching center
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600">
              Browse and search is coming next — for now this is a placeholder home while the
              rest of the discovery flow is built out.
            </p>
          </div>

          {!profileComplete && (
            <button
              onClick={() => router.push("/complete-profile/seeker")}
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
