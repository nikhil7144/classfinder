"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveProfileAndRedirect } from "@/lib/auth-redirect";

// Google redirects here after the OAuth consent screen. `lib/supabase.ts`
// has detectSessionInUrl: true, so the browser client parses the returned
// tokens and establishes a session automatically — this page just waits
// for that, then runs the same first-time-vs-returning resolution the
// email-OTP flow uses. `intendedRole` survives the round trip to Google
// and back as a query param on the redirectTo URL (AuthForm.tsx sets it).
function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intendedRole = searchParams.get("intendedRole");
  const next = searchParams.get("next");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const finish = async () => {
      // The tokens arrive in the URL hash and the client parses them
      // asynchronously, so the session isn't always there on the first read.
      // Poll briefly rather than declaring failure too early.
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

      const data = { session };

      const result = await resolveProfileAndRedirect(
        router,
        data.session.access_token,
        intendedRole === "seeker" || intendedRole === "provider" ? intendedRole : undefined,
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
