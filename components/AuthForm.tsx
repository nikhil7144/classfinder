"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const sendCode = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError("");
    setFormError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { shouldCreateUser: true },
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

    const result = await resolveProfileAndRedirect(router, data.session.access_token, intendedRole);

    if (result.error) {
      setFormError(result.error);
    }

    setLoading(false);
  };

  const continueWithGoogle = async () => {
    setGoogleLoading(true);
    setFormError("");

    const params = intendedRole ? `?intendedRole=${intendedRole}` : "";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-indigo-600">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 mb-2">
          {step === "email" ? heading : "Enter your code"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === "email" ? subheading : `We sent a 6-digit code to ${email.trim()}.`}
        </p>

        {formError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {formError}
          </div>
        )}

        {step === "email" ? (
          <>
            <input
              type="email"
              placeholder="Email"
              className={`w-full mb-1 px-4 py-3 border rounded-2xl outline-none focus:border-indigo-400 ${
                emailError ? "border-rose-300" : "border-gray-200"
              }`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            {emailError && <p className="mb-3 mt-1 text-sm font-medium text-rose-600">{emailError}</p>}
            {!emailError && <div className="mb-3" />}

            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Sending code..." : "Send code"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              <div className="h-px flex-1 bg-gray-200" />
              or
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              onClick={continueWithGoogle}
              disabled={googleLoading}
              className="w-full rounded-full border border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              className="w-full mb-4 px-4 py-3 border border-gray-200 rounded-2xl outline-none focus:border-indigo-400 tracking-[0.3em] text-center text-lg"
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
              className="w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Verifying..." : "Verify & continue"}
            </button>

            <button
              onClick={() => {
                setStep("email");
                setOtp("");
                setFormError("");
              }}
              className="mt-4 w-full text-center text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
