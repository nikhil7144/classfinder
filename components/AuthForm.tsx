"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveProfileAndRedirect } from "@/lib/auth-redirect";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthFormProps = {
  eyebrow: string;
  heading: string;
  subheading: string;
  // Pre-sets the role a brand-new sign-up gets, skipping the /choose-role
  // step. Ignored entirely for a returning user — they always land on
  // their own real dashboard, never re-routed by whichever link they
  // happened to click.
  intendedRole?: "seeker" | "provider";
};

export default function AuthForm({ eyebrow, heading, subheading, intendedRole }: AuthFormProps) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Someone already signed in has no business on a login form — and if they
  // arrived from an invite, sitting here loses it. Send them on instead.
  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data } = await supabase.auth.getSession();

      if (!active) return;

      if (data.session) {
        await resolveProfileAndRedirect(router, intendedRole, next);
        return;
      }

      setCheckingSession(false);
    };

    check();

    return () => {
      active = false;
    };
  }, [router, intendedRole, next]);

  const sendCode = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError("");
    setFormError("");
    setLoading(true);

    // Supabase decides whether the email carries a 6-digit code or a link,
    // based on its email templates. Point the link at /auth/callback with the
    // same intendedRole the code path uses, so clicking it lands the user in
    // exactly the same place as typing the code — whichever the template sends.
    const callbackParams = new URLSearchParams();
    if (intendedRole) callbackParams.set("intendedRole", intendedRole);
    if (next) callbackParams.set("next", next);
    const params = callbackParams.toString() ? `?${callbackParams}` : "";

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback${params}`,
      },
    });

    setLoading(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setStep("otp");
  };

  const verifyCode = async () => {
    if (!otp.trim()) {
      setFormError("Enter the code we emailed you.");
      return;
    }

    setFormError("");
    setLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });

    if (error || !data.session) {
      setFormError(error?.message || "That code didn't work — check it and try again.");
      setLoading(false);
      return;
    }

    const result = await resolveProfileAndRedirect(router, intendedRole, next);

    if (result.error) {
      setFormError(result.error);
    }

    setLoading(false);
  };

  const continueWithGoogle = async () => {
    setGoogleLoading(true);
    setFormError("");

    const oauthParams = new URLSearchParams();
    if (intendedRole) oauthParams.set("intendedRole", intendedRole);
    if (next) oauthParams.set("next", next);
    const params = oauthParams.toString() ? `?${oauthParams}` : "";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback${params}` },
    });

    if (error) {
      setFormError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser navigates away to Google, so no further
    // client-side state update happens here.
  };

  if (checkingSession) return <div className="min-h-screen bg-bg" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="cf-card w-full max-w-md p-8">
        <p className="cf-eyebrow">
          {eyebrow}
        </p>
        <h1 className="cf-display mt-4 mb-2 text-3xl text-ink">
          {step === "email" ? heading : "Enter your code"}
        </h1>
        <p className="mb-6 text-sm text-muted">
          {step === "email" ? subheading : `We sent a 6-digit code to ${email.trim()}.`}
        </p>

        {formError && (
          <div className="mb-4 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </div>
        )}

        {step === "email" ? (
          <>
            <input
              type="email"
              placeholder="Email"
              className="cf-input mb-1"
              aria-invalid={Boolean(emailError)}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            {emailError && <p className="mb-3 mt-1 text-sm font-medium text-danger">{emailError}</p>}
            {!emailError && <div className="mb-3" />}

            <button
              onClick={sendCode}
              disabled={loading}
              className="cf-btn-primary w-full"
            >
              {loading ? "Sending code..." : "Send code"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-faint">
              <div className="h-px flex-1 bg-line" />
              or
              <div className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={continueWithGoogle}
              disabled={googleLoading}
              className="cf-btn-ghost w-full"
            >
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              // Length is a Supabase setting, not ours — it is currently 8 —
              // so the placeholder doesn't name a number it can't guarantee.
              placeholder="Enter the code"
              className="cf-input mb-4 text-center font-mono text-lg tracking-[0.35em]"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value);
                if (formError) setFormError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && verifyCode()}
            />

            <button
              onClick={verifyCode}
              disabled={loading}
              className="cf-btn-primary w-full"
            >
              {loading ? "Verifying..." : "Verify & continue"}
            </button>

            <button
              onClick={() => {
                setStep("email");
                setOtp("");
                setFormError("");
              }}
              className="mt-4 w-full text-center text-sm font-semibold text-gold transition hover:text-accent-ink"
            >
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
