"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const { data } = await supabase
        .from("profiles")
        .select("role, profile_complete")
        .eq("id", authData.user.id)
        .maybeSingle();

      setRole(data?.role ?? null);
      setProfileComplete(data?.profile_complete ?? null);
    };

    load();
  }, []);

  // Messaging, Spaces and payments add their own entries here as those phases
  // land. Profile editing lives in the complete-profile forms, which load
  // existing values and double as the edit screen.
  const navItems = [
    {
      href: role === "provider" ? "/complete-profile/provider" : "/complete-profile/seeker",
      label: "Profile",
    },
    { href: "/account/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-bg py-10">
      <div className="mx-auto grid max-w-5xl gap-6 px-6 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-4">
          <div className="cf-card p-6">
            <p className="cf-eyebrow">Account</p>
            <h2 className="cf-display mt-2 text-2xl text-ink">Your account</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your profile and sign-in details.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {role && <span className="cf-badge cf-badge-neutral capitalize">{role}</span>}
              {profileComplete !== null && (
                <span className={`cf-badge ${profileComplete ? "cf-badge-ok" : "cf-badge-warn"}`}>
                  {profileComplete ? "Profile complete" : "Profile incomplete"}
                </span>
              )}
            </div>
          </div>

          <nav className="cf-card overflow-hidden">
            {navItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-5 py-4 text-sm transition ${
                  index > 0 ? "border-t border-line-soft" : ""
                } ${
                  pathname === item.href
                    ? "bg-surface-3 font-semibold text-ink"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {item.label}
                <span className="font-mono text-xs text-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </Link>
            ))}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
