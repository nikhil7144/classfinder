"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveProfileAndRedirect } from "@/lib/auth-redirect";

// Where both sign-in paths land: the Google round trip (Google returns to
// Supabase at /auth/v1/callback, and Supabase redirects here) and the magic
// link, whose emailRedirectTo points here too.
//
// Nothing below exchanges anything by hand. detectSessionInUrl is on by
// default in supabase-js — `lib/supabase.ts` does not set it — and it covers
// both shapes the URL can arrive in: the PKCE `?code=` this client actually
// gets, which it trades for a session using the verifier stored back when
// signInWithOAuth was called, and the hash tokens an implicit-flow link
// carries. This page waits for whichever happened, then runs the same
// first-time-vs-returning resolution the email-OTP flow uses.
//
// `intendedRole` survives the round trip to Google and back as a query param
// on the redirectTo URL (AuthForm.tsx sets it).
function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intendedRole = searchParams.get("intendedRole");
  const next = searchParams.get("next");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const finish = async () => {
      // getSession() waits for the client to finish initializing, so one read
      // is usually enough. The retries are for the PKCE exchange, which is a
      // network call to Supabase: a slow one would otherwise read null and
      // tell someone their link had expired when the sign-in was fine.
      let session = null;
      for (let attempt = 0; attempt < 10 && active; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!active) return;

      if (!session) {
        setError("That sign-in link didn't work — it may have expired. Request a new one.");
        return;
      }

      const result = await resolveProfileAndRedirect(
        router,
        intendedRole === "seeker" || intendedRole === "provider" || intendedRole === "organiser"
          ? intendedRole
          : undefined,
        next
      );

      if (result.error && active) {
        setError(result.error);
      }
    };

    finish();

    return () => {
      active = false;
    };
  }, [router, intendedRole, next]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="cf-card w-full max-w-md p-8 text-center">
        {error ? (
          <>
            <p className="text-sm font-semibold text-danger">{error}</p>
            <a href="/login" className="mt-4 inline-block text-sm font-semibold text-gold hover:text-accent-ink">
              Back to login
            </a>
          </>
        ) : (
          <p className="text-sm text-muted">Signing you in…</p>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
