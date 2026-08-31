"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const roleOptions = [
  {
    value: "seeker",
    title: "I'm looking for a coach or tutor",
    description: "Browse and book coaches, tutors, and coaching centers for yourself or your child.",
  },
  {
    value: "provider",
    title: "I'm a coach, tutor, or coaching center",
    description: "List your services, run your own space, and connect with parents and students.",
  },
];

export default function ChooseRolePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);
      setChecking(false);
    };

    check();
  }, [router]);

  const chooseRole = async (role: "seeker" | "provider") => {
    if (!userId || saving) return;

    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      role,
      profile_complete: false,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push(role === "seeker" ? "/complete-profile/seeker" : "/complete-profile/provider");
  };

  if (checking) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-indigo-600 text-center">
          One more step
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 text-center mb-2">
          What brings you here?
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          This decides what your dashboard looks like — you can't switch later, so pick the one that's actually you.
        </p>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => chooseRole(option.value as "seeker" | "provider")}
              className="rounded-3xl border border-gray-200 bg-white p-6 text-left transition hover:border-indigo-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="text-lg font-semibold text-gray-900">{option.title}</div>
              <div className="mt-2 text-sm leading-6 text-gray-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
