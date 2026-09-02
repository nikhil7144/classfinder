"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";
import { useAlerts, waitingCount } from "@/components/AlertsBadge";
import { usePathname, useRouter } from "next/navigation";

const baseNavPillClass =
  "cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition";

const activeNavPillClass =
  "bg-surface-3 text-ink";

const inactiveNavPillClass =
  "text-muted hover:bg-surface-2 hover:text-ink";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  // A coach and a parent are on opposite sides of this marketplace, and the
  // navbar was offering both of them the parent's screen. Held as null until
  // it is known, so nothing flickers between the two labels on first paint.
  const [role, setRole] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const alerts = useAlerts();
  const waiting = waitingCount(alerts);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }

    let active = true;

    const loadRole = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (active) setRole(data?.role ?? null);
    };

    loadRole();
    return () => {
      active = false;
    };
  }, [user]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const navigate = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  const isActivePath = (path: string) => {
    if (!pathname) return false;
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const navPillClass = (path: string) =>
    `${baseNavPillClass} ${
      isActivePath(path) ? activeNavPillClass : inactiveNavPillClass
    }`;

  // Coaches have no use for the parent's search — they are what it returns.
  const isProvider = role === "provider";
  const findPath = isProvider ? "/students" : "/search";
  const findLabel = isProvider ? "Find students" : "Find classes";

  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-bg/85 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="cursor-pointer transition"
        >
          <span className="cf-display text-2xl text-ink">{BRAND.name}</span>
        </button>

        <div className="hidden items-center gap-3 md:flex">
          <button onClick={() => navigate(findPath)} className={navPillClass(findPath)}>
            {findLabel}
          </button>

          {user ? (
            <>
              <button onClick={() => navigate("/dashboard")} className={navPillClass("/dashboard")}>
                Dashboard
              </button>

              <button onClick={() => navigate("/account")} className={navPillClass("/account")}>
                Account
                {waiting > 0 && (
                  <span className="ml-2 rounded-full bg-accent-ink px-1.5 py-0.5 text-[0.7rem] font-bold text-[#1a0d06]">
                    {waiting}
                  </span>
                )}
              </button>

              <button
                onClick={handleLogout}
                className="cursor-pointer rounded-full border border-line bg-surface-2 px-4 py-2 text-sm font-medium text-muted transition hover:border-danger hover:text-danger"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="cf-btn-primary px-5 py-2.5"
            >
              Log In / Sign Up
            </button>
          )}
        </div>

        <button
          className="cursor-pointer text-muted md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
      </div>

      {menuOpen && (
        <div className="mt-4 flex flex-col gap-3 md:hidden">
          <button onClick={() => navigate(findPath)} className={navPillClass(findPath)}>
            {findLabel}
          </button>

          {user ? (
            <>
              <button onClick={() => navigate("/dashboard")} className={navPillClass("/dashboard")}>
                Dashboard
              </button>

              <button onClick={() => navigate("/account")} className={navPillClass("/account")}>
                Account
              </button>

              <button
                onClick={handleLogout}
                className="cursor-pointer rounded-full border border-line bg-surface-2 px-4 py-2 text-sm font-medium text-muted transition hover:border-danger hover:text-danger"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="cf-btn-primary px-5 py-2.5"
            >
              Log In / Sign Up
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
