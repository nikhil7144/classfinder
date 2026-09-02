"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchSeekerLocations } from "@/lib/api/reference";
import { getSeekerProfileFieldErrors, SeekerProfileFieldErrors } from "@/lib/profile-rules";
import RequirementFields from "@/components/requirements/RequirementFields";
import {
  RELATIONS,
  Requirement,
  RequirementErrors,
  emptyRequirement,
  getRequirementErrors,
  requirementFromRow,
  requirementToColumns,
} from "@/lib/requirements";
import type { AreaRow, CityRow } from "@/components/provider/AreaPicker";

const errorText = "mt-2 text-sm text-danger";

type FormProps = { redirectTo?: string | null; variant?: "setup" | "account" };

export default function SeekerProfileForm({ redirectTo = "/dashboard", variant = "setup" }: FormProps) {
  const router = useRouter();
  // An invite that sent them here is still waiting once the profile exists.
  const nextPath = useSearchParams().get("next");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Asked here rather than with the requirement: it is true of the person,
  // not of what they happen to want this month. See profile-rules.
  const [relation, setRelation] = useState("");
  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");

  const [requirement, setRequirement] = useState<Requirement>(emptyRequirement());
  const [openToOffers, setOpenToOffers] = useState(true);
  // Separate from openToOffers, and defaulted off. That one is "coaches on
  // this site may write to me about this"; this one is "you may tell me about
  // other things", and conflating a consent with a feature is how people end
  // up on lists they never joined.
  const [marketingOptIn, setMarketingOptIn] = useState(false);

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

      // Seekers only pick from live areas — the launch gate, applied inside
      // fetchSeekerLocations so every seeker-side screen agrees on it.
      const [{ cities: cityRows, areas: areaRows }, { data: profileRow }, { data: seekerRow }] =
        await Promise.all([
          fetchSeekerLocations(),
          supabase.from("profiles").select("phone, profile_complete").eq("id", authData.user.id).maybeSingle(),
          supabase.from("seekers").select("*").eq("user_id", authData.user.id).maybeSingle(),
        ]);

      setCities((cityRows as CityRow[]) || []);
      setAreas((areaRows as AreaRow[]) || []);
      setPhone((current) => current || profileRow?.phone || "");
      setIsComplete(Boolean(profileRow?.profile_complete));

      if (seekerRow) {
        setName(seekerRow.name || "");
        setRelation(seekerRow.relation_to_learner || "");
        setAreaId(seekerRow.area_id || null);
        setExistingPhoto(seekerRow.photo_url || null);
        setRequirement(
          requirementFromRow(seekerRow, {
            lookingFor: seekerRow.looking_for || [],
            notes: seekerRow.requirement_notes,
          })
        );
        setOpenToOffers(seekerRow.open_to_offers ?? true);
        setMarketingOptIn(seekerRow.marketing_opt_in ?? false);
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
    setCityId(saved?.cityId ?? cities[0].id);
  }, [cities, areas, areaId, cityId]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const cityAreas = useMemo(
    () => areas.filter((a) => a.cityId === cityId).sort((a, b) => a.name.localeCompare(b.name)),
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
    ? getSeekerProfileFieldErrors({ name, phone, areaId, relation })
    : {};

  // What they want is only required of someone who has asked to be found —
  // a parent who just wants to browse and message owes us nothing.
  const requirementRules = { requireLookingFor: openToOffers };
  const requirementErrors: RequirementErrors = showValidation
    ? getRequirementErrors(requirement, requirementRules)
    : {};

  const handleSave = async () => {
    if (!userId) return;

    setShowValidation(true);
    if (Object.keys(getSeekerProfileFieldErrors({ name, phone, areaId, relation })).length > 0)
      return;
    if (Object.keys(getRequirementErrors(requirement, requirementRules)).length > 0) return;

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
        relation_to_learner: relation,
        area_id: areaId,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        city: cityName,
        area: areaName,
        photo_url: photoUrl,
        looking_for: requirement.lookingFor,
        requirement_notes: requirement.notes.trim() || null,
        open_to_offers: openToOffers,
        marketing_opt_in: marketingOptIn,
        // Stamped on save rather than by a trigger: the demand feed sorts on
        // it, and a parent who re-confirms what they want should come back to
        // the top of a coach's list.
        requirement_updated_at: new Date().toISOString(),
        ...requirementToColumns(requirement),
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

    if (nextPath || redirectTo) {
      router.push(nextPath || redirectTo!);
      return;
    }

    setSavedAt(Date.now());
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shownPhoto = photoPreview || existingPhoto;

  return (
    <div className={variant === "setup" ? "min-h-screen bg-bg py-12 pb-28" : ""}>
      <div className={variant === "setup" ? "mx-auto max-w-2xl space-y-6 px-6" : "space-y-5"}>
        {variant === "setup" && (
        <header className="cf-card p-8">
          <p className="cf-eyebrow">Your profile</p>
          <h1 className="cf-display mt-3 text-4xl text-ink">Tell us a bit about you</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Just enough to book and message providers — you can add more later.
          </p>
          {!isComplete && variant === "setup" && (
            <p className="mt-4 text-sm text-faint">
              Actually here to teach?{" "}
              <a href="/choose-role" className="font-semibold text-gold hover:text-accent-ink">
                Switch to a provider account
              </a>
            </p>
          )}
        </header>
        )}

        {savedAt !== null && (
          <div className="rounded-2xl border border-teal/30 bg-teal-soft px-5 py-4 text-sm font-medium text-teal">
            Your profile has been saved.
          </div>
        )}

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
            <label className="mb-2 block text-sm text-muted">
              Who are you looking for classes for?
            </label>
            <select
              className="cf-input"
              aria-invalid={Boolean(fieldErrors.relation?.length)}
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              <option value="">Choose…</option>
              {RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-faint">
              Teaching an adult and teaching someone&apos;s child are different jobs — a coach
              shouldn&apos;t have to guess which one you&apos;re asking about.
            </p>
            {fieldErrors.relation?.[0] && <p className={errorText}>{fieldErrors.relation[0]}</p>}
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

        </section>

        {/* The half of the marketplace this form never asked about. Until now
            a parent told us where they were and nothing about what they
            wanted, so every coach on the platform was waiting on a search
            that only the parent could start. */}
        <section className="cf-card space-y-5 p-7">
          <div>
            <p className="cf-eyebrow">What you&apos;re looking for</p>
            <h2 className="cf-display mt-2 text-xl text-ink">Tell coaches what you need</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Answer as much or as little as you like. The more you say, the better the coaches
              who get in touch — and the fewer who shouldn&apos;t.
            </p>
          </div>

          <RequirementFields
            value={requirement}
            onChange={setRequirement}
            errors={requirementErrors}
            relation={relation}
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={openToOffers}
              onChange={(e) => setOpenToOffers(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">Let coaches get in touch with me</span>
              <span className="mt-1 block text-muted">
                Coaches who teach what you want, near you, can see this requirement and your area
                — never your name, photo or number. If one writes, you decide whether to reply,
                and nothing is shared until you do. Turn this off and you go back to searching
                only.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">
                Tell me about camps, competitions and events
              </span>
              <span className="mt-1 block text-muted">
                Off unless you turn it on. Occasional emails about things matching what you&apos;re
                looking for — a holiday camp, a local tournament, a trial day. Your details go to
                an organiser only if you fill in their form yourself.
              </span>
            </span>
          </label>
        </section>

        <section className="cf-card p-7">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="cf-btn-primary w-full"
          >
            {isSaving ? "Saving…" : variant === "setup" ? "Save & Continue" : "Save"}
          </button>
        </section>
      </div>
    </div>
  );
}
