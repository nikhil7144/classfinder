"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";
import { usePathname } from "next/navigation";

const footerLinkClass =
  "text-sm text-muted transition hover:text-ink";

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
    <footer className="border-t border-line bg-surface px-6 py-12">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Link href="/" className="inline-flex transition">
            <img src={BRAND.logo} alt={BRAND.name} className="h-12 w-auto" />
          </Link>
          <p className="cf-eyebrow mt-2">{BRAND.slogan}</p>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">{BRAND.legalName}</p>
          <p className="mt-2 max-w-xl text-sm leading-7 text-faint">{BRAND.tagline}</p>

          {/* Beneath the legal name rather than in a nav column: these are the
              two documents Google asks for before it will verify the sign-in
              screen, so they have to be reachable from every page. */}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className={footerLinkClass}>
              Privacy
            </Link>
            <Link href="/terms" className={footerLinkClass}>
              Terms
            </Link>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="cf-eyebrow">
              Explore
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link href="/" className={footerLinkClass}>
                Home
              </Link>
              <Link href="/signup/seeker" className={footerLinkClass}>
                Find a coach or tutor
              </Link>
              <Link href="/for-coaches" className={footerLinkClass}>
                For coaches
              </Link>
              <Link href="/signup/provider" className={footerLinkClass}>
                List your classes
              </Link>
              <Link href="/signup/organiser" className={footerLinkClass}>
                Run events
              </Link>
            </div>
          </div>

          <div>
            <p className="cf-eyebrow">
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
