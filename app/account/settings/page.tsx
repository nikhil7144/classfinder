"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { supabase } from "@/lib/supabase";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData?.user) {
        router.push("/login");
        return;
      }

      const email = userData.user.email || "";
      setCurrentEmail(email);
      setNewEmail(email);
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const handleEmailUpdate = async () => {
    if (savingEmail) return;
    if (!newEmail.trim()) {
      alert("Please enter a valid email.");
      return;
    }
    if (newEmail.trim() === currentEmail) {
      alert("Please enter a different email.");
      return;
    }

    setSavingEmail(true);

    const { error } = await supabase.auth.updateUser({
      email: newEmail.trim(),
    });

    if (error) {
      alert(error.message || "Unable to update email.");
      setSavingEmail(false);
      return;
    }

    setCurrentEmail(newEmail.trim());
    alert("Email update initiated. Please check your inbox for confirmation if required.");
    setSavingEmail(false);
  };

  const handlePasswordUpdate = async () => {
    if (savingPassword) return;
    if (!newPassword) {
      alert("Please enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      alert("Password should be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      alert(error.message || "Unable to update password.");
      setSavingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    alert("Password updated successfully.");
    setSavingPassword(false);
  };

  if (loading) return <PageSkeleton variant="detail" />;

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_45%,_#eff6ff_100%)] p-8 shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
          Settings
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
          Account access and security
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          Update your login email and password here. If your Supabase project requires email
          confirmation, the new email will become active after verification.
        </p>
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-indigo-600">
            Change Email
          </p>
          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Current email</label>
              <input
                type="email"
                value={currentEmail}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleEmailUpdate}
              disabled={savingEmail}
              className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingEmail ? "Updating..." : "Update Email"}
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Change Password
          </p>
          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handlePasswordUpdate}
              disabled={savingPassword}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
