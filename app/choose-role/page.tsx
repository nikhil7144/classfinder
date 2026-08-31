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
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const destinationFor = (role: string) => {
    if (role === "admin") return "/admin";
    if (role === "provider") return "/complete-profile/provider";
    return "/complete-profile/seeker";
  };

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      const { data: existing } = await supabase
        .from("profiles")
        .select("role, profile_complete")
        .eq("id", data.user.id)
        .maybeSingle();

      // A finished profile (or an admin) has a real account behind it, so the
      // choice is settled — send them where they belong rather than offering a
      // pick that would fail on the profiles primary key. An unfinished one can
      // still change its mind, so fall through and show the picker.
      if (existing?.role && (existing.profile_complete || existing.role === "admin")) {
        router.replace(destinationFor(existing.role));
        return;
      }

      setCurrentRole(existing?.role ?? null);
      setUserId(data.user.id);
      setChecking(false);
    };

    check();
  }, [router]);

  const chooseRole = async (role: "seeker" | "provider") => {
    if (!userId || saving) return;

    setSaving(true);
    setError("");

    // Changing an existing role goes through the server, which enforces that
    // it's only allowed while the profile is incomplete and clears the
    // half-finished row for the role being left.
    if (currentRole && currentRole !== role) {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/account/switch-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({ role }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Unable to change account type.");
        setSaving(false);
        return;
      }

      router.push(destinationFor(role));
      return;
    }

    // upsert, not insert: two quick clicks or a concurrent tab would
    // otherwise fail on the primary key with a raw Postgres error.
    const { error: saveError } = await supabase
      .from("profiles")
      .upsert({ id: userId, role, profile_complete: false }, { onConflict: "id" });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    router.push(destinationFor(role));
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
          {currentRole ? "Change your account type" : "What brings you here?"}
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-center text-sm text-gray-500">
          {currentRole
            ? "You can still change this because your profile isn't finished. Switching clears what you've filled in so far, and once your profile is complete it's locked."
            : "This decides what your dashboard looks like. You can change it any time until your profile is complete."}
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
              className={`rounded-3xl border bg-white p-6 text-left transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 ${
                currentRole === option.value
                  ? "border-indigo-500 ring-2 ring-indigo-100"
                  : "border-gray-200 hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-gray-900">{option.title}</span>
                {currentRole === option.value && (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm leading-6 text-gray-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
