"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { withNext } from "@/lib/next-path";
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
  {
    value: "organiser",
    title: "I run events",
    description:
      "Tournaments, competitions and showcases. You won't appear in coach or tutor search — " +
      "parents find your events instead.",
  },
];

function ChooseRolePage() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // `next` follows the user through role choice, so an invite that sent them
  // here is still waiting once their profile exists.
  const destinationFor = (role: string) => {
    if (role === "admin") return "/admin";
    // seeker, provider and organiser each have a route of the same shape.
    return withNext(`/complete-profile/${role}`, next);
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

  const chooseRole = async (role: "seeker" | "provider" | "organiser") => {
    if (!userId || saving) return;

    setSaving(true);
    setError("");

    // Changing an existing role goes through switch_role(), a definer
    // function: it enforces that switching is only allowed while the profile
    // is incomplete, and clears the half-finished row for the role being
    // left. That delete is the part RLS cannot express — seekers and
    // providers have no delete policy, deliberately.
    //
    // It used to be a route holding the service role, which meant the mobile
    // app could not switch roles at all. Same rules, somewhere both clients
    // can reach.
    if (currentRole && currentRole !== role) {
      const { error: switchError } = await supabase.rpc("switch_role", { p_role: role });

      if (switchError) {
        setError(switchError.message || "Unable to change account type.");
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
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="cf-eyebrow text-center">
          One more step
        </p>
        <h1 className="cf-display mt-4 mb-2 text-center text-3xl text-ink">
          {currentRole ? "Change your account type" : "What brings you here?"}
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-center text-sm text-muted">
          {currentRole
            ? "You can still change this because your profile isn't finished. Switching clears what you've filled in so far, and once your profile is complete it's locked."
            : "This decides what your dashboard looks like. You can change it any time until your profile is complete."}
        </p>

        {error && (
          <div className="mb-4 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => chooseRole(option.value as "seeker" | "provider" | "organiser")}
              className={`cf-card p-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                currentRole === option.value ? "border-gold" : "hover:border-faint"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="cf-display text-lg text-ink">{option.title}</span>
                {currentRole === option.value && (
                  <span className="cf-badge cf-badge-neutral shrink-0">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted">{option.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChooseRolePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <ChooseRolePage />
    </Suspense>
  );
}
