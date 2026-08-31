"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// There is deliberately no password here. ClassFinder signs people in with an
// emailed code or Google — a password set on this screen could never be used
// to log in, so offering one would be a trap. The email address IS the login,
// which is why changing it is the one credential action that belongs here.
export default function AccountSettings() {
  const router = useRouter();

  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setCurrentEmail(data.user.email || "");
    };
    load();
  }, [router]);

  const changeEmail = async () => {
    const trimmed = newEmail.trim();
    setError("");
    setMessage("");

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setError("That's already your email address.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: trimmed });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(
      `We've emailed ${trimmed} to confirm the change. Your current address keeps working until you confirm.`
    );
    setNewEmail("");
  };

  const logOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Settings</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">Sign-in &amp; account</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          You sign in with a one-time code sent to your email, or with Google — there&apos;s no
          password to manage.
        </p>
      </header>

      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">Email address</h2>
        <p className="mt-2 text-sm text-muted">
          This is how you sign in, so changing it changes your login.
        </p>

        <div className="mt-5">
          <label className="mb-2 block text-sm text-muted">Current</label>
          <p className="font-mono text-sm text-ink">{currentEmail || "…"}</p>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm text-muted">New email address</label>
          <input
            className="cf-input"
            placeholder="you@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {message && (
          <p className="mt-3 rounded-xl border border-teal/30 bg-teal-soft px-4 py-3 text-sm text-teal">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={changeEmail}
          disabled={saving || !newEmail.trim()}
          className="cf-btn-primary mt-5"
        >
          {saving ? "Sending…" : "Change email"}
        </button>
      </section>

      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">Sign out</h2>
        <p className="mt-2 text-sm text-muted">Sign out on this device.</p>
        <button type="button" onClick={logOut} className="cf-btn-ghost mt-5">
          Log out
        </button>
      </section>
    </div>
  );
}
