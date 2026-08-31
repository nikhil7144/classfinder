"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

const baseNavPillClass =
  "cursor-pointer rounded-full px-4 py-2 text-sm font-medium shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition";

const activeNavPillClass =
  "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]";

const inactiveNavPillClass =
  "bg-white/85 text-slate-700 hover:bg-white hover:text-slate-950";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <nav className="sticky top-0 z-50 border-b border-white/40 bg-slate-50/80 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="cursor-pointer transition"
        >
          <img
            src="/mentbridge-logo.svg"
            alt="MentBridge"
            className="h-12 w-auto"
          />
        </button>

        <div className="hidden items-center gap-3 md:flex">
          <button onClick={() => navigate("/why-mentbridge")} className={navPillClass("/why-mentbridge")}>
            Why MentBridge
          </button>

          <button onClick={() => navigate("/startup/news")} className={navPillClass("/startup/news")}>
            Startup News
          </button>

          <button onClick={() => navigate("/blog")} className={navPillClass("/blog")}>
            Blog
          </button>

          <button
            onClick={() => navigate("/veterans")}
            className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold text-white transition ${
              isActivePath("/veterans")
                ? "bg-slate-950 shadow-[0_12px_28px_rgba(15,23,42,0.22)]"
                : "bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 shadow-[0_12px_28px_rgba(79,70,229,0.25)] hover:brightness-105"
            }`}
          >
            Search Industry Leaders
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
                className="cursor-pointer rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_20px_rgba(244,63,94,0.22)] transition hover:bg-rose-600"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className={`${baseNavPillClass} px-5 py-2.5 font-semibold ${
                isActivePath("/login") ? activeNavPillClass : "bg-white text-indigo-700 hover:bg-slate-100"
              }`}
            >
              Log In / Sign Up
            </button>
          )}
        </div>

        <button
          className="cursor-pointer text-slate-700 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
      </div>

      {menuOpen && (
        <div className="mt-4 flex flex-col gap-3 md:hidden">
          <button onClick={() => navigate("/why-mentbridge")} className={navPillClass("/why-mentbridge")}>
            Why MentBridge
          </button>

          <button onClick={() => navigate("/startup/news")} className={navPillClass("/startup/news")}>
            Startup News
          </button>

          <button onClick={() => navigate("/blog")} className={navPillClass("/blog")}>
            Blog
          </button>

          <button
            onClick={() => navigate("/veterans")}
            className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold text-white ${
              isActivePath("/veterans")
                ? "bg-slate-950"
                : "bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700"
            }`}
          >
            Search Industry Leaders
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
                className="cursor-pointer rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className={`${baseNavPillClass} px-5 py-2.5 font-semibold ${
                isActivePath("/login") ? activeNavPillClass : "bg-white text-indigo-700"
              }`}
            >
              Log In / Sign Up
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
