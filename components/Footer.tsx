"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";
import { usePathname } from "next/navigation";

const footerLinkClass =
  "text-sm text-slate-600 transition hover:text-slate-950";

export default function Footer() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();

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

  if (pathname === "/messages" || pathname?.startsWith("/chat/")) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-[linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_100%)] px-6 py-12">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Link href="/" className="inline-flex transition">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{BRAND.name}</span>
          </Link>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">{BRAND.legalName}</p>
          <p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">{BRAND.tagline}</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Explore
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link href="/" className={footerLinkClass}>
                Home
              </Link>
              <Link href="/signup/seeker" className={footerLinkClass}>
                Find a coach or tutor
              </Link>
              <Link href="/signup/provider" className={footerLinkClass}>
                List your classes
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Account
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {user ? (
                <>
                  <Link href="/dashboard" className={footerLinkClass}>
                    Dashboard
                  </Link>
                  <Link href="/account" className={footerLinkClass}>
                    Account
                  </Link>
                </>
              ) : (
                <Link href="/login" className={footerLinkClass}>
                  Log In / Sign Up
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
