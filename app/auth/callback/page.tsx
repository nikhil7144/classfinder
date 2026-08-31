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
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const finish = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!active) return;

      if (sessionError || !data.session) {
        setError("Sign-in didn't complete — go back and try again.");
        return;
      }

      const result = await resolveProfileAndRedirect(
        router,
        data.session.access_token,
        intendedRole === "seeker" || intendedRole === "provider" ? intendedRole : undefined
      );

      if (result.error && active) {
        setError(result.error);
      }
    };

    finish();

    return () => {
      active = false;
    };
  }, [router, intendedRole]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-8 text-center shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-600">{error}</p>
            <a href="/login" className="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Back to login
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-500">Signing you in…</p>
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
