"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  const linkClass = (path: string) =>
    `group relative flex shrink-0 items-center justify-center rounded-2xl px-4 py-3.5 text-sm font-medium whitespace-nowrap transition lg:justify-between ${
      pathname === path
        ? "bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
    }`;

  const navigationItems = [
    { href: "/account/profile", label: "Profile", order: "01" },
    { href: "/account/associations", label: "Associations", order: "02" },
    { href: "/messages", label: "Messages", order: "03" },
    ...(role === "startup"
      ? [
          { href: "/account/create-post", label: "Create Post", order: "04" },
          { href: "/account/my-posts", label: "My Posts", order: "05" },
          {
            href: "/account/requested-associations",
            label: "Requested Associations",
            order: "06",
          },
          { href: "/account/payments", label: "Payment History", order: "07" },
        ]
      : []),
    {
      href: "/account/settings",
      label: "Settings",
      order: role === "startup" ? "08" : "04",
    },
  ];

  useEffect(() => {
    let isActive = true;

    const loadRole = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        const user = sessionData.session?.user;

        if (!user) return;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role,profile_complete")
          .eq("id", user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        if (isActive) {
          setRole(profile?.role || null);
          setProfileComplete(profile?.profile_complete ?? false);
        }
      } catch (error) {
        console.error("Unable to load account role:", error);
      }
    };

    loadRole();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:gap-10 lg:px-8 lg:py-12">

          {/* Sidebar */}
          <div className="w-full overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-[0_24px_60px_rgba(79,70,229,0.12)] backdrop-blur-xl lg:sticky lg:top-24 lg:h-fit lg:w-72 lg:p-6">
            <div className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-800 p-6 text-white">
              <div className="absolute inset-0 opacity-60">
                <div className="absolute -left-12 -top-10 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl" />
                <div className="absolute -right-8 bottom-0 h-24 w-24 rounded-full bg-fuchsia-300/20 blur-2xl" />
              </div>
              <div className="relative z-10">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-blue-100/75">
                  Workspace
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">Account</h2>
                <p className="mt-2 text-sm leading-6 text-blue-100/75">
                  Navigate your profile, associations, posts, and account controls.
                </p>
                <div className="mt-5 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-50">
                  {role || "member"}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.6rem] border border-slate-200/80 bg-slate-50/80 p-3 lg:mt-6">
              <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Navigation
              </p>

              <div className="-mx-1 overflow-x-auto px-1 no-scrollbar lg:mx-0 lg:overflow-visible lg:px-0">
                <div className="flex gap-2 lg:flex-col">
                  {navigationItems.map((item) => (
                    <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                      <span>{item.label}</span>
                      <span className="hidden text-xs opacity-50 transition group-hover:opacity-100 lg:inline">
                        {item.order}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Status Badge */}
            <div className="mb-6">
              <span
                className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] shadow-sm ${
                  profileComplete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {profileComplete ? "Profile Complete" : "Profile Incomplete"}
              </span>
            </div>

            {children}

          </div>

        </div>
      </div>
    </>
  );
}
