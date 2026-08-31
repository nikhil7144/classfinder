"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getSeekerProfileFieldErrors,
  SeekerProfileFieldErrors,
} from "@/lib/profile-rules";

const inputClass =
  "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400";
const errorTextClass = "mt-2 text-sm text-red-600";

export default function CompleteSeekerProfile() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [formError, setFormError] = useState("");
  // Account type is locked once the profile is complete, so the switch link
  // only appears while there is still nothing to lose.
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push("/login");
        return;
      }

      setUserId(authData.user.id);

      const [{ data: profileRow }, { data: seekerRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("phone, profile_complete")
          .eq("id", authData.user.id)
          .maybeSingle(),
        supabase.from("seekers").select("*").eq("user_id", authData.user.id).maybeSingle(),
      ]);

      setIsComplete(Boolean(profileRow?.profile_complete));

      // Functional update: don't clobber a phone number the user already
      // started typing while this fetch was still in flight.
      setPhone((current) => current || profileRow?.phone || "");

      if (seekerRow) {
        setName(seekerRow.name || "");
        setCity(seekerRow.city || "");
        setArea(seekerRow.area || "");
        setExistingPhoto(seekerRow.photo_url || null);
      }
    };

    load();
  }, [router]);

  const fieldErrors: SeekerProfileFieldErrors = showValidation
    ? getSeekerProfileFieldErrors({ name, phone, city })
    : {};

  const getFieldClass = (field: keyof SeekerProfileFieldErrors) =>
    `${inputClass} ${fieldErrors[field]?.length ? "border-red-300 bg-red-50/60 focus:border-red-400" : ""}`;

  const handleSave = async () => {
    if (!userId) return;

    setShowValidation(true);
    const validationErrors = getSeekerProfileFieldErrors({ name, phone, city });

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    setFormError("");

    let photoUrl = existingPhoto;

    if (photoFile) {
      const fileExt = photoFile.name.split(".").pop() || "jpg";
      const path = `${userId}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("seeker-photos")
        .upload(path, photoFile, { upsert: true });

      if (uploadError) {
        setFormError(`Photo upload failed: ${uploadError.message}`);
        setIsSaving(false);
        return;
      }

      const { data } = supabase.storage.from("seeker-photos").getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const { error: phoneError } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", userId);

    if (phoneError) {
      setFormError(phoneError.message);
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.from("seekers").upsert(
      {
        user_id: userId,
        name,
        city,
        area,
        photo_url: photoUrl,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setFormError(error.message);
      setIsSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ profile_complete: true })
      .eq("id", userId);

    if (profileError) {
      setFormError("Profile saved, but completion status could not be updated.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 pb-24">
      <div className="mx-auto max-w-2xl space-y-8 px-6">
        <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
            Your Profile
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
            Tell us a bit about you
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            Just enough to book and message providers — you can add more later.
          </p>
          {!isComplete && (
            <p className="mt-4 text-sm text-gray-500">
              Actually here to teach?{" "}
              <a href="/choose-role" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Switch to a provider account
              </a>
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
          {formError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Your name</label>
            <input
              className={getFieldClass("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {fieldErrors.name?.[0] && <p className={errorTextClass}>{fieldErrors.name[0]}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Mobile number</label>
            <input
              className={getFieldClass("phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {fieldErrors.phone?.[0] && <p className={errorTextClass}>{fieldErrors.phone[0]}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">City</label>
              <input
                className={getFieldClass("city")}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              {fieldErrors.city?.[0] && <p className={errorTextClass}>{fieldErrors.city[0]}</p>}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Area (optional)</label>
              <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Photo (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
