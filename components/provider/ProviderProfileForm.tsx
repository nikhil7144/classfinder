"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ServiceCategoryPicker, { ServiceCategory } from "@/components/provider/ServiceCategoryPicker";
import AvailabilityEditor from "@/components/provider/AvailabilityEditor";
import { ServiceAreaPicker, BranchAreaSelect, CityRow, AreaRow } from "@/components/provider/AreaPicker";
import {
  AvailabilitySlotInput,
  CertificationInput,
  FEE_PERIODS,
  ProviderBranchInput,
  ProviderProfileFieldErrors,
  emptyBranch,
  emptyCertification,
  getProviderProfileFieldErrors,
  isBlankBranch,
  isBlankCertification,
} from "@/lib/profile-rules";

type ProviderCategory = { id: string; name: string; provider_type: string };
type TeachingPlace = { id: string; label: string; description: string | null };

const providerTypeOptions = [
  { value: "individual", title: "Individual", description: "A coach, teacher, or tutor working on your own." },
  { value: "institution", title: "Institution", description: "An academy, coaching centre, or sports centre with one or more branches." },
  { value: "event_planner", title: "Event Planner", description: "You run events and take bookings — you won't appear in coach/tutor search." },
];

const errorText = "mt-2 text-sm text-danger";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cf-card p-7">
      <h2 className="cf-display text-xl text-ink">{title}</h2>
      {hint && <p className="mt-2 text-sm leading-6 text-muted">{hint}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

type FormProps = {
  /** Where to go after a successful save. Null keeps the user on the page,
   *  which is what editing inside the account section wants. */
  redirectTo?: string | null;
  /** First-time setup shows the page chrome; the account section supplies its own. */
  variant?: "setup" | "account";
};

/**
 * The selection read back as a sentence.
 *
 * Three bordered cards with two of them lit is not a statement a coach can
 * check. Saying it in words is how they notice they have claimed to run an
 * academy they do not have, or forgotten the one they do.
 */
function formatSummary(
  selected: string[],
  options: { id: string; label: string }[],
  travels: boolean | null
): string {
  const has = (id: string) => selected.includes(id);
  const known = new Set(["my_academy", "group_classes", "individual_classes"]);

  const parts: string[] = [];
  if (has("my_academy")) parts.push("students come to your own place");
  if (has("group_classes") && has("individual_classes")) {
    parts.push("you teach both groups and one-to-one");
  } else if (has("group_classes")) {
    parts.push("you teach groups");
  } else if (has("individual_classes")) {
    parts.push("you teach one-to-one");
  }

  // Anything an admin adds to the master list later, named rather than dropped.
  for (const id of selected) {
    if (!known.has(id)) {
      const label = options.find((o) => o.id === id)?.label;
      if (label) parts.push(label.toLowerCase());
    }
  }

  if (travels === true) parts.push("and you travel to students");
  if (travels === false && !has("my_academy")) {
    parts.push("and students come to you");
  }

  if (parts.length === 0) return "";
  if (parts.length === 1) return `So: ${parts[0]}.`;

  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(", ");
  return `So: ${rest}${last.startsWith("and ") ? ", " : ", and "}${last}.`;
}

export default function ProviderProfileForm({ redirectTo = "/dashboard", variant = "setup" }: FormProps) {
  const router = useRouter();
  // An invite that sent them here is still waiting once the profile exists.
  const nextPath = useSearchParams().get("next");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const [providerType, setProviderType] = useState<"individual" | "institution" | "event_planner" | "">("");
  const [providerCategoryId, setProviderCategoryId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [helpStatement, setHelpStatement] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [feeMin, setFeeMin] = useState("");
  const [feeMax, setFeeMax] = useState("");
  const [feePeriod, setFeePeriod] = useState("");
  const [feesNote, setFeesNote] = useState("");
  const [teachingPlaces, setTeachingPlaces] = useState<string[]>([]);
  // Null until answered. Not derived from teachingPlaces: that list is about
  // format, and format says nothing about venue. See phase2u.
  const [travelsToStudents, setTravelsToStudents] = useState<boolean | null>(null);
  const [certifications, setCertifications] = useState<CertificationInput[]>([emptyCertification()]);
  const [availability, setAvailability] = useState<AvailabilitySlotInput[]>([]);
  const [serviceAreaIds, setServiceAreaIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<ProviderBranchInput[]>([emptyBranch()]);
  const [selectedServiceCategories, setSelectedServiceCategories] = useState<string[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);

  const [providerCategories, setProviderCategories] = useState<ProviderCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [teachingPlaceOptions, setTeachingPlaceOptions] = useState<TeachingPlace[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);

  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push("/login");
        return;
      }

      const uid = authData.user.id;
      setUserId(uid);

      const [
        { data: cats },
        { data: services },
        { data: places },
        { data: cityRows },
        { data: areaRows },
        { data: profileRow },
        { data: providerRow },
      ] = await Promise.all([
        supabase.from("provider_category_master").select("*").eq("is_active", true).order("name"),
        supabase.from("service_category_master").select("*").eq("is_active", true).order("name"),
        supabase.from("teaching_place_master").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("cities").select("id, name, state").eq("is_active", true).order("name"),
        supabase.from("areas").select("id, city_id, name, is_live").order("name"),
        supabase.from("profiles").select("phone, profile_complete").eq("id", uid).maybeSingle(),
        supabase.from("providers").select("*").eq("user_id", uid).maybeSingle(),
      ]);

      setProviderCategories((cats as ProviderCategory[]) || []);
      setServiceCategories((services as ServiceCategory[]) || []);
      setTeachingPlaceOptions((places as TeachingPlace[]) || []);
      setCities((cityRows as CityRow[]) || []);
      setAreas((areaRows as AreaRow[]) || []);

      // Functional update: don't clobber a value the user already started typing.
      setPhone((current) => current || profileRow?.phone || "");
      setIsComplete(Boolean(profileRow?.profile_complete));

      if (providerRow) {
        setHasExistingProfile(true);
        setProviderId(providerRow.id);
        setProviderType(providerRow.provider_type || "");
        setProviderCategoryId(providerRow.provider_category_id || null);
        setDisplayName(providerRow.display_name || "");
        setBio(providerRow.bio || "");
        setHelpStatement(providerRow.help_statement || "");
        setAge(providerRow.age === null || providerRow.age === undefined ? "" : String(providerRow.age));
        setExperienceYears(
          providerRow.experience_years === null || providerRow.experience_years === undefined
            ? ""
            : String(providerRow.experience_years)
        );
        setFeeMin(providerRow.fee_min === null || providerRow.fee_min === undefined ? "" : String(providerRow.fee_min));
        setFeeMax(providerRow.fee_max === null || providerRow.fee_max === undefined ? "" : String(providerRow.fee_max));
        setFeePeriod(providerRow.fee_period || "");
        setFeesNote(providerRow.fees_note || "");
        setTeachingPlaces(providerRow.teaching_places || []);
        setTravelsToStudents(
          providerRow.travels_to_students === null || providerRow.travels_to_students === undefined
            ? null
            : Boolean(providerRow.travels_to_students)
        );
        setCertifications(
          providerRow.certifications?.length ? providerRow.certifications : [emptyCertification()]
        );
        setAvailability(providerRow.availability || []);
        setExistingPhoto(providerRow.photo_url || null);
        setSelectedServiceCategories(providerRow.service_category_ids || []);

        const [{ data: branchRows }, { data: areaLinks }] = await Promise.all([
          supabase.from("branches").select("*").eq("provider_id", providerRow.id),
          supabase.from("provider_service_areas").select("area_id").eq("provider_id", providerRow.id),
        ]);

        if (branchRows?.length) {
          setBranches(
            branchRows.map((b) => ({
              label: b.label || "",
              address: b.address || "",
              areaId: b.area_id || null,
              phone: b.phone || "",
            }))
          );
        }
        if (areaLinks?.length) {
          setServiceAreaIds(areaLinks.map((l) => l.area_id));
        }
      }
    };

    load();
  }, [router]);

  // Object URLs must be revoked or they leak for the life of the page.
  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const isEventPlanner = providerType === "event_planner";
  const isInstitution = providerType === "institution";

  const availableCategories = useMemo(
    () => providerCategories.filter((c) => c.provider_type === providerType),
    [providerCategories, providerType]
  );

  const selectedCategoryName = useMemo(
    () => providerCategories.find((c) => c.id === providerCategoryId)?.name || "",
    [providerCategories, providerCategoryId]
  );

  // Availability is place-wise, so these must be actual locations — not class
  // formats. An institution's places are its branches. An individual's are
  // their own premises (if they teach there) plus each area they travel to,
  // which is what lets a home tutor say "Indirapuram on Monday, Vaishali on
  // Saturday".
  const availabilityPlaces = useMemo(() => {
    if (isInstitution) {
      return branches.filter((b) => b.label.trim()).map((b) => b.label.trim());
    }

    const places: string[] = [];
    if (teachingPlaces.includes("my_academy")) {
      places.push("My place");
    }
    // Only when they actually travel. For a coach who does not, the service
    // areas are where they ARE, not places they go — listing them here put
    // areas a coach has never visited into their availability, and the
    // scheduler would have believed it.
    if (travelsToStudents) {
      for (const id of serviceAreaIds) {
        const area = areas.find((a) => a.id === id);
        if (area) places.push(area.name);
      }
    }
    return places;
  }, [isInstitution, branches, teachingPlaces, travelsToStudents, serviceAreaIds, areas]);

  /**
   * The areas question has been asking two different things under one label.
   * For a coach who travels it is "where can you get to"; for one who does
   * not it is "where is your place" — which parents still search by, so it is
   * still required, but it is not the same question and should not pretend to
   * be.
   */
  const areasQuestion = useMemo(() => {
    if (travelsToStudents === false) {
      return {
        title: "Where can parents find you?",
        hint: "The area your own place is in. Parents search by area, so this is how they find you.",
      };
    }
    if (travelsToStudents && teachingPlaces.includes("my_academy")) {
      return {
        title: "Where can you travel to?",
        hint:
          "Besides your own place — the areas you can reach around your academy classes. Parents search by area, so pick every one you cover.",
      };
    }
    if (travelsToStudents) {
      return {
        title: "Which areas do you travel to?",
        hint: "Parents search by area, so pick every one you cover.",
      };
    }
    return {
      title: "Where do you teach?",
      hint: "The areas you can travel to or serve. Parents search by area, so pick every one you cover.",
    };
  }, [travelsToStudents, teachingPlaces]);

  const formInput = {
    providerType,
    providerCategoryId,
    displayName,
    bio,
    helpStatement,
    phone,
    age,
    experienceYears,
    feeMin,
    feeMax,
    feePeriod,
    teachingPlaces,
    travelsToStudents,
    certifications,
    availability,
    serviceCategoryIds: selectedServiceCategories,
    photoUrl: photoFile || existingPhoto ? "__provided__" : null,
    serviceAreaIds,
    branches,
  };

  const fieldErrors: ProviderProfileFieldErrors = showValidation
    ? getProviderProfileFieldErrors(formInput)
    : {};

  const invalid = (field: keyof ProviderProfileFieldErrors) => Boolean(fieldErrors[field]?.length);

  const updateBranch = (index: number, patch: Partial<ProviderBranchInput>) =>
    setBranches((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const updateCertification = (index: number, patch: Partial<CertificationInput>) =>
    setCertifications((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const handleSave = async () => {
    if (!userId) return;

    setShowValidation(true);
    if (Object.keys(getProviderProfileFieldErrors(formInput)).length > 0) {
      setFormError("Some details still need attention — they're highlighted below.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSaving(true);
    setFormError("");

    let photoUrl = existingPhoto;

    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${userId}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("provider-photos")
        .upload(path, photoFile, { upsert: true });

      if (uploadError) {
        setFormError(`Photo upload failed: ${uploadError.message}`);
        setIsSaving(false);
        return;
      }

      const { data } = supabase.storage.from("provider-photos").getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const { error: phoneError } = await supabase.from("profiles").update({ phone }).eq("id", userId);
    if (phoneError) {
      setFormError(phoneError.message);
      setIsSaving(false);
      return;
    }

    const cleanBranches = branches.filter((b) => !isBlankBranch(b));
    const cleanCerts = certifications.filter((c) => !isBlankCertification(c));
    const isFirstSave = !hasExistingProfile;

    // City/area now come from areas, but the legacy text columns are still on
    // the table — keep them roughly in step until they're dropped.
    const primaryAreaId = isInstitution ? cleanBranches[0]?.areaId : serviceAreaIds[0];
    const primaryArea = areas.find((a) => a.id === primaryAreaId);
    const primaryCity = cities.find((c) => c.id === primaryArea?.city_id);

    const { data: saved, error } = await supabase
      .from("providers")
      .upsert(
        {
          user_id: userId,
          provider_type: providerType,
          provider_category_id: isEventPlanner ? null : providerCategoryId,
          display_name: displayName,
          bio,
          help_statement: helpStatement || null,
          age: age.trim() ? Number(age) : null,
          experience_years: experienceYears.trim() ? Number(experienceYears) : null,
          fee_min: feeMin.trim() ? Number(feeMin) : null,
          fee_max: feeMax.trim() ? Number(feeMax) : null,
          fee_period: feePeriod || null,
          fees_note: feesNote || null,
          teaching_places: teachingPlaces,
          travels_to_students: travelsToStudents,
          certifications: cleanCerts,
          availability,
          city: primaryCity?.name ?? null,
          area: primaryArea?.name ?? null,
          service_category_ids: selectedServiceCategories,
          photo_url: photoUrl,
          approved: isFirstSave ? false : undefined,
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    if (error || !saved) {
      setFormError(error?.message || "Unable to save profile.");
      setIsSaving(false);
      return;
    }

    setProviderId(saved.id);

    // Replace-all is the simplest correct approach while the whole form saves
    // at once; a dedicated "add branch" action later can append instead.
    if (isInstitution) {
      await supabase.from("branches").delete().eq("provider_id", saved.id);
      if (cleanBranches.length) {
        await supabase.from("branches").insert(
          cleanBranches.map((b) => ({
            provider_id: saved.id,
            label: b.label,
            address: b.address,
            area_id: b.areaId,
            city: areas.find((a) => a.id === b.areaId)
              ? cities.find((c) => c.id === areas.find((a) => a.id === b.areaId)!.city_id)?.name ?? null
              : null,
            area: areas.find((a) => a.id === b.areaId)?.name ?? null,
            phone: b.phone,
          }))
        );
      }
      await supabase.from("provider_service_areas").delete().eq("provider_id", saved.id);
    } else {
      await supabase.from("provider_service_areas").delete().eq("provider_id", saved.id);
      if (serviceAreaIds.length) {
        await supabase
          .from("provider_service_areas")
          .insert(serviceAreaIds.map((areaId) => ({ provider_id: saved.id, area_id: areaId })));
      }
      await supabase.from("branches").delete().eq("provider_id", saved.id);
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
    setHasExistingProfile(true);

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
      <div className={variant === "setup" ? "mx-auto max-w-3xl space-y-6 px-6" : "space-y-5"}>
        {variant === "setup" && (
        <header className="cf-card p-8">
          <p className="cf-eyebrow">{hasExistingProfile ? "Edit listing" : "Provider profile"}</p>
          <h1 className="cf-display mt-3 text-4xl text-ink">
            {hasExistingProfile ? "Edit your listing" : "Set up your listing"}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {hasExistingProfile
              ? "Changes are saved when you press Save at the bottom. Your listing stays visible while you edit."
              : "Your listing is reviewed before parents and students can see it. You can keep editing it any time after."}
          </p>
          {!isComplete && variant === "setup" && (
            <p className="mt-4 text-sm text-faint">
              Actually looking for classes?{" "}
              <a href="/choose-role" className="font-semibold text-gold hover:text-accent-ink">
                Switch to a seeker account
              </a>
            </p>
          )}
        </header>
        )}

        {savedAt !== null && (
          <div className="rounded-2xl border border-teal/30 bg-teal-soft px-5 py-4 text-sm font-medium text-teal">
            Your listing has been saved.
          </div>
        )}

        {formError && (
          <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm font-medium text-danger">
            {formError}
          </div>
        )}

        <Section title="What kind of provider are you?">
          <div
            className={`grid gap-3 sm:grid-cols-3 ${
              invalid("providerType") ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-3" : ""
            }`}
          >
            {providerTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setProviderType(option.value as typeof providerType);
                  setProviderCategoryId(null);
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  providerType === option.value
                    ? "border-gold bg-surface-3"
                    : "border-line bg-surface-2 hover:border-faint"
                }`}
              >
                <div className="text-sm font-semibold text-ink">{option.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted">{option.description}</div>
              </button>
            ))}
          </div>
          {fieldErrors.providerType?.[0] && <p className={errorText}>{fieldErrors.providerType[0]}</p>}

          {providerType && !isEventPlanner && (
            <div className="mt-6">
              <p className="cf-eyebrow">Category</p>
              <div
                className={`mt-3 flex flex-wrap gap-2 ${
                  invalid("providerCategoryId") ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-3" : ""
                }`}
              >
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="cf-pill"
                    data-selected={providerCategoryId === cat.id}
                    onClick={() => setProviderCategoryId(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              {fieldErrors.providerCategoryId?.[0] && (
                <p className={errorText}>{fieldErrors.providerCategoryId[0]}</p>
              )}
            </div>
          )}
        </Section>

        <Section title="About you">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <input
                className="cf-input"
                placeholder="Name / business name"
                aria-invalid={invalid("displayName")}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.displayName?.[0] && <p className={errorText}>{fieldErrors.displayName[0]}</p>}
            </div>
            <div>
              <input
                className="cf-input"
                placeholder="Mobile number"
                aria-invalid={invalid("phone")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {fieldErrors.phone?.[0] && <p className={errorText}>{fieldErrors.phone[0]}</p>}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-muted">Years of experience</label>
              <input
                className="cf-input"
                inputMode="numeric"
                placeholder="e.g. 8"
                aria-invalid={invalid("experienceYears")}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
              />
              {fieldErrors.experienceYears?.[0] && (
                <p className={errorText}>{fieldErrors.experienceYears[0]}</p>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm text-muted">Age (optional)</label>
              <input
                className="cf-input"
                inputMode="numeric"
                placeholder="e.g. 34"
                aria-invalid={invalid("age")}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              {fieldErrors.age?.[0] && <p className={errorText}>{fieldErrors.age[0]}</p>}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm text-muted">Short bio</label>
            <textarea
              className="cf-input min-h-24"
              placeholder="Your background and approach."
              aria-invalid={invalid("bio")}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            {fieldErrors.bio?.[0] && <p className={errorText}>{fieldErrors.bio[0]}</p>}
          </div>

          {!isEventPlanner && (
            <div className="mt-4">
              <label className="mb-2 block text-sm text-muted">
                How can you help your students?
              </label>
              <textarea
                className="cf-input min-h-24"
                placeholder="What a student actually gets from you — what you'll work on, and what improves."
                aria-invalid={invalid("helpStatement")}
                value={helpStatement}
                onChange={(e) => setHelpStatement(e.target.value)}
              />
              {fieldErrors.helpStatement?.[0] && (
                <p className={errorText}>{fieldErrors.helpStatement[0]}</p>
              )}
            </div>
          )}

          <div className="mt-6">
            <label className="mb-2 block text-sm text-muted">Photo / logo</label>
            <div className="flex items-center gap-4">
              {shownPhoto ? (
                <img
                  src={shownPhoto}
                  alt="Profile preview"
                  className="h-20 w-20 rounded-2xl border border-line object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2 text-xs text-faint">
                  No photo
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                />
                {photoPreview && <p className="mt-2 text-xs text-teal">New photo ready to save</p>}
              </div>
            </div>
            {fieldErrors.photoUrl?.[0] && <p className={errorText}>{fieldErrors.photoUrl[0]}</p>}
          </div>
        </Section>

        <Section
          title="What do you teach or coach?"
          hint="Pick everything that applies — search, or open a section to browse."
        >
          <ServiceCategoryPicker
            categories={serviceCategories}
            selectedIds={selectedServiceCategories}
            onChange={setSelectedServiceCategories}
            suggestedForCategory={selectedCategoryName}
            invalid={invalid("serviceCategoryIds")}
          />
          {fieldErrors.serviceCategoryIds?.[0] && (
            <p className={errorText}>{fieldErrors.serviceCategoryIds[0]}</p>
          )}
        </Section>

        {!isEventPlanner && (
          <Section
            title="How do you run your classes?"
            hint="Details of specific batches are best posted in your Space, where parents can see them."
          >
            <div
              className={`grid gap-3 sm:grid-cols-3 ${
                invalid("teachingPlaces") ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-3" : ""
              }`}
            >
              {teachingPlaceOptions.map((place) => {
                const checked = teachingPlaces.includes(place.id);
                return (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() =>
                      setTeachingPlaces((prev) =>
                        checked ? prev.filter((p) => p !== place.id) : [...prev, place.id]
                      )
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      checked ? "border-gold bg-surface-3" : "border-line bg-surface-2 hover:border-faint"
                    }`}
                  >
                    <div className="text-sm font-semibold text-ink">{place.label}</div>
                    {place.description && (
                      <div className="mt-1 text-xs leading-5 text-muted">{place.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
            {fieldErrors.teachingPlaces?.[0] && <p className={errorText}>{fieldErrors.teachingPlaces[0]}</p>}

            {/* Nothing in three bordered cards says "you may pick more than
                one", and a coach who runs an academy AND takes one-to-one
                students was picking whichever single card felt closest. */}
            <p className="mt-3 text-xs text-faint">
              Pick every one that applies — most coaches do more than one of these.
            </p>

            {teachingPlaces.length > 0 && (
              <p className="mt-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
                {formatSummary(teachingPlaces, teachingPlaceOptions, travelsToStudents)}
              </p>
            )}

            {/* The question the format cards only look like they answer.
                Running group classes tells nobody whether you run them at your
                own centre or theirs, and everything below — which areas we
                ask for, and what your availability means — turns on it. */}
            {!isInstitution && (
              <div
                className={`mt-5 border-t border-line-soft pt-5 ${
                  invalid("travelsToStudents")
                    ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-4"
                    : ""
                }`}
              >
                <p className="text-sm font-semibold text-ink">Do you travel to students?</p>
                <p className="mt-1 text-xs text-muted">
                  Going to a home, a society hall or a ground — as opposed to students always
                  coming to you.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="cf-pill px-4 py-2 text-sm"
                    data-selected={travelsToStudents === true}
                    onClick={() => setTravelsToStudents(true)}
                  >
                    Yes, I travel
                  </button>
                  <button
                    type="button"
                    className="cf-pill px-4 py-2 text-sm"
                    data-selected={travelsToStudents === false}
                    onClick={() => setTravelsToStudents(false)}
                  >
                    No, students come to me
                  </button>
                </div>
                {fieldErrors.travelsToStudents?.[0] && (
                  <p className={errorText}>{fieldErrors.travelsToStudents[0]}</p>
                )}
              </div>
            )}
          </Section>
        )}

        <Section
          title={isInstitution ? "Branches" : areasQuestion.title}
          hint={
            isInstitution
              ? "Every location you operate from — this is how parents find you."
              : areasQuestion.hint
          }
        >
          {isInstitution ? (
            <>
              <div className="space-y-4">
                {branches.map((branch, index) => (
                  <div key={index} className="rounded-2xl border border-line bg-surface-2 p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="cf-input"
                        placeholder="Branch name"
                        value={branch.label}
                        onChange={(e) => updateBranch(index, { label: e.target.value })}
                      />
                      <input
                        className="cf-input"
                        placeholder="Branch phone"
                        value={branch.phone}
                        onChange={(e) => updateBranch(index, { phone: e.target.value })}
                      />
                    </div>
                    <input
                      className="cf-input mt-3"
                      placeholder="Address"
                      value={branch.address}
                      onChange={(e) => updateBranch(index, { address: e.target.value })}
                    />
                    <div className="mt-3">
                      <BranchAreaSelect
                        cities={cities}
                        areas={areas}
                        areaId={branch.areaId}
                        onChange={(areaId) => updateBranch(index, { areaId })}
                      />
                    </div>
                    {branches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBranches((prev) => prev.filter((_, i) => i !== index))}
                        className="mt-3 text-sm font-semibold text-muted transition hover:text-danger"
                      >
                        Remove branch
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {fieldErrors.branches?.[0] && <p className={errorText}>{fieldErrors.branches[0]}</p>}
              <button
                type="button"
                onClick={() => setBranches((prev) => [...prev, emptyBranch()])}
                className="mt-4 text-sm font-semibold text-gold transition hover:text-accent-ink"
              >
                + Add another branch
              </button>
            </>
          ) : (
            <>
              <ServiceAreaPicker
                cities={cities}
                areas={areas}
                selectedIds={serviceAreaIds}
                onChange={setServiceAreaIds}
                invalid={invalid("serviceAreaIds")}
              />
              {fieldErrors.serviceAreaIds?.[0] && (
                <p className={errorText}>{fieldErrors.serviceAreaIds[0]}</p>
              )}
            </>
          )}
        </Section>

        <Section
          title="Fees"
          hint="Optional, but listings that show a range get far more enquiries than ones that don't."
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr]">
            <input
              className="cf-input"
              inputMode="decimal"
              placeholder="From ₹"
              aria-invalid={invalid("fees")}
              value={feeMin}
              onChange={(e) => setFeeMin(e.target.value)}
            />
            <input
              className="cf-input"
              inputMode="decimal"
              placeholder="To ₹"
              aria-invalid={invalid("fees")}
              value={feeMax}
              onChange={(e) => setFeeMax(e.target.value)}
            />
            <select
              className="cf-input"
              value={feePeriod}
              onChange={(e) => setFeePeriod(e.target.value)}
              aria-label="Fee period"
            >
              <option value="">Per…</option>
              {FEE_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {fieldErrors.fees?.[0] && <p className={errorText}>{fieldErrors.fees[0]}</p>}
          <input
            className="cf-input mt-3"
            placeholder="Anything worth knowing — trial class, sibling discount, equipment cost…"
            value={feesNote}
            onChange={(e) => setFeesNote(e.target.value)}
          />
        </Section>

        <Section title="Certifications" hint="Qualifications, coaching licences, or accreditations.">
          <div className="space-y-3">
            {certifications.map((cert, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[2fr_1.5fr_0.7fr_auto]">
                <input
                  className="cf-input"
                  placeholder="Certification"
                  value={cert.name}
                  onChange={(e) => updateCertification(index, { name: e.target.value })}
                />
                <input
                  className="cf-input"
                  placeholder="Issued by"
                  value={cert.issuer}
                  onChange={(e) => updateCertification(index, { issuer: e.target.value })}
                />
                <input
                  className="cf-input"
                  inputMode="numeric"
                  placeholder="Year"
                  value={cert.year}
                  onChange={(e) => updateCertification(index, { year: e.target.value })}
                />
                {certifications.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCertifications((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded-lg px-3 text-sm text-muted transition hover:text-danger"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {fieldErrors.certifications?.[0] && <p className={errorText}>{fieldErrors.certifications[0]}</p>}
          <button
            type="button"
            onClick={() => setCertifications((prev) => [...prev, emptyCertification()])}
            className="mt-3 text-sm font-semibold text-gold transition hover:text-accent-ink"
          >
            + Add certification
          </button>
        </Section>

        <Section
          title="Availability"
          hint="Day by day, and place by place — so parents know where to find you and when."
        >
          <AvailabilityEditor
            slots={availability}
            places={availabilityPlaces}
            onChange={setAvailability}
            invalid={invalid("availability")}
          />
          {fieldErrors.availability?.[0] && <p className={errorText}>{fieldErrors.availability[0]}</p>}
        </Section>

        <div className="cf-card p-7">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="cf-btn-primary w-full"
          >
            {isSaving ? "Saving…" : hasExistingProfile ? "Save changes" : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
