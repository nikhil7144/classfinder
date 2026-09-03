"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAlerts } from "@/components/AlertsBadge";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const alerts = useAlerts();

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

  // Everything account-related lives in this section so the left menu stays
  // mounted. Spaces and payments join this list as those phases land.
  const navItems: { href: string; label: string; badge?: number }[] = [
    { href: "/account/profile", label: "Profile" },
    // Groups are a seeker's own demand; providers see matching demand on their
    // dashboard instead. Messages sits beside it because a parent talks to
    // coaches both through a group and directly, and thinks of it as one
    // inbox either way.
    ...(role === "seeker"
      ? [
          { href: "/account/groups", label: "Groups", badge: Number(alerts?.pending_pitches || 0) },
          {
            href: "/account/messages",
            label: "Messages",
            badge: Number(alerts?.unread_threads || 0),
          },
          // Asking for a call is not a conversation, so it is not in the
          // inbox — but a parent still needs to see what they asked for.
          { href: "/account/queries", label: "Requests" },
        ]
      : []),
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
                <span className="flex items-center gap-2">
                  {item.label}
                  {Boolean(item.badge) && (
                    <span className="rounded-full bg-accent-ink px-1.5 py-0.5 text-[0.7rem] font-bold text-[#1a0d06]">
                      {item.badge}
                    </span>
                  )}
                </span>
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
