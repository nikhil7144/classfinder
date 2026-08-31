"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSeekerProfileFieldErrors, SeekerProfileFieldErrors } from "@/lib/profile-rules";
import type { AreaRow, CityRow } from "@/components/provider/AreaPicker";

const errorText = "mt-2 text-sm text-danger";

export default function CompleteSeekerProfile() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);

  const [cities, setCities] = useState<CityRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [formError, setFormError] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push("/login");
        return;
      }

      setUserId(authData.user.id);

      const [{ data: cityRows }, { data: areaRows }, { data: profileRow }, { data: seekerRow }] =
        await Promise.all([
          supabase.from("cities").select("id, name, state").eq("is_active", true).order("name"),
          // Seekers only pick from live areas — that's the launch gate.
          supabase.from("areas").select("id, city_id, name, is_live").eq("is_live", true).order("name"),
          supabase.from("profiles").select("phone, profile_complete").eq("id", authData.user.id).maybeSingle(),
          supabase.from("seekers").select("*").eq("user_id", authData.user.id).maybeSingle(),
        ]);

      setCities((cityRows as CityRow[]) || []);
      setAreas((areaRows as AreaRow[]) || []);
      setPhone((current) => current || profileRow?.phone || "");
      setIsComplete(Boolean(profileRow?.profile_complete));

      if (seekerRow) {
        setName(seekerRow.name || "");
        setAreaId(seekerRow.area_id || null);
        setExistingPhoto(seekerRow.photo_url || null);
        if (seekerRow.lat !== null && seekerRow.lng !== null) {
          setCoords({ lat: seekerRow.lat, lng: seekerRow.lng });
        }
      }
    };

    load();
  }, [router]);

  // Default the city dropdown to whichever city the saved area belongs to.
  useEffect(() => {
    if (cityId || cities.length === 0) return;
    const saved = areas.find((a) => a.id === areaId);
    setCityId(saved?.city_id ?? cities[0].id);
  }, [cities, areas, areaId, cityId]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const cityAreas = useMemo(
    () => areas.filter((a) => a.city_id === cityId).sort((a, b) => a.name.localeCompare(b.name)),
    [areas, cityId]
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote("Your browser can't share location — results will use your area instead.");
      return;
    }

    setLocating(true);
    setLocationNote("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setLocationNote("Location saved — results will be sorted by how near they are to you.");
      },
      () => {
        setLocating(false);
        // Denying is normal and must not be a dead end — the area centroid
        // is the fallback origin for ranking.
        setLocationNote("No problem — we'll sort results from the centre of your area instead.");
      },
      { timeout: 10000 }
    );
  };

  const fieldErrors: SeekerProfileFieldErrors = showValidation
    ? getSeekerProfileFieldErrors({ name, phone, areaId })
    : {};

  const handleSave = async () => {
    if (!userId) return;

    setShowValidation(true);
    if (Object.keys(getSeekerProfileFieldErrors({ name, phone, areaId })).length > 0) return;

    setIsSaving(true);
    setFormError("");

    let photoUrl = existingPhoto;

    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${userId}/profile.${ext}`;
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

    const { error: phoneError } = await supabase.from("profiles").update({ phone }).eq("id", userId);
    if (phoneError) {
      setFormError(phoneError.message);
      setIsSaving(false);
      return;
    }

    const areaName = areas.find((a) => a.id === areaId)?.name ?? null;
    const cityName = cities.find((c) => c.id === cityId)?.name ?? null;

    const { error } = await supabase.from("seekers").upsert(
      {
        user_id: userId,
        name,
        area_id: areaId,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        city: cityName,
        area: areaName,
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

  const shownPhoto = photoPreview || existingPhoto;

  return (
    <div className="min-h-screen bg-bg py-12 pb-28">
      <div className="mx-auto max-w-2xl space-y-6 px-6">
        <header className="cf-card p-8">
          <p className="cf-eyebrow">Your profile</p>
          <h1 className="cf-display mt-3 text-4xl text-ink">Tell us a bit about you</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Just enough to book and message providers — you can add more later.
          </p>
          {!isComplete && (
            <p className="mt-4 text-sm text-faint">
              Actually here to teach?{" "}
              <a href="/choose-role" className="font-semibold text-gold hover:text-accent-ink">
                Switch to a provider account
              </a>
            </p>
          )}
        </header>

        <section className="cf-card space-y-5 p-7">
          {formError && (
            <div className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-muted">Your name</label>
            <input
              className="cf-input"
              aria-invalid={Boolean(fieldErrors.name?.length)}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {fieldErrors.name?.[0] && <p className={errorText}>{fieldErrors.name[0]}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">Mobile number</label>
            <input
              className="cf-input"
              aria-invalid={Boolean(fieldErrors.phone?.length)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {fieldErrors.phone?.[0] && <p className={errorText}>{fieldErrors.phone[0]}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">Where are you looking?</label>
            {cities.length === 0 ? (
              <p className="text-sm text-muted">
                No areas are open yet. Check back shortly — we&apos;re opening area by area.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="cf-input"
                  value={cityId}
                  onChange={(e) => {
                    setCityId(e.target.value);
                    setAreaId(null);
                  }}
                  aria-label="City"
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="cf-input"
                  value={areaId ?? ""}
                  onChange={(e) => setAreaId(e.target.value || null)}
                  aria-label="Area"
                  aria-invalid={Boolean(fieldErrors.areaId?.length)}
                >
                  <option value="">Select area…</option>
                  {cityAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {fieldErrors.areaId?.[0] && <p className={errorText}>{fieldErrors.areaId[0]}</p>}
          </div>

          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Sort results by distance</p>
                <p className="mt-1 text-xs text-muted">
                  Optional. Without it we sort from the centre of your area.
                </p>
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="cf-btn-ghost px-4 py-2 text-sm"
              >
                {locating ? "Locating…" : coords ? "Update location" : "Use my location"}
              </button>
            </div>
            {locationNote && <p className="mt-3 text-xs text-muted">{locationNote}</p>}
            {coords && (
              <p className="mt-2 font-mono text-xs text-teal">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">Photo (optional)</label>
            <div className="flex items-center gap-4">
              {shownPhoto ? (
                <img
                  src={shownPhoto}
                  alt="Profile preview"
                  className="h-16 w-16 rounded-2xl border border-line object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2 text-xs text-faint">
                  None
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="cf-btn-primary w-full"
          >
            {isSaving ? "Saving…" : "Save & Continue"}
          </button>
        </section>
      </div>
    </div>
  );
}
