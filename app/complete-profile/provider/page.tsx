"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getProviderProfileFieldErrors,
  ProviderBranchInput,
  ProviderProfileFieldErrors,
} from "@/lib/profile-rules";

type ProviderCategory = { id: string; name: string; provider_type: string };
type ServiceCategory = { id: string; name: string; group: string };

const inputClass =
  "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400";
const errorTextClass = "mt-2 text-sm text-red-600";
const sectionClass = "rounded-3xl border border-gray-200 bg-white p-8 shadow-sm";

const providerTypeOptions = [
  { value: "individual", title: "Individual", description: "A coach, teacher, or tutor working on your own." },
  { value: "institution", title: "Institution", description: "An academy, coaching center, or sports center with one or more branches." },
  { value: "event_planner", title: "Event Planner", description: "You run sports events and take bookings — you won't show up in coach/tutor search." },
];

const emptyBranch = (): ProviderBranchInput => ({ label: "", address: "", city: "", area: "", phone: "" });

// Explicit order + display labels for the service-category groups. Without
// this the groups render in whatever order they happen to come back in,
// which put "Mind Games" above "Sports" and buried the most common picks.
const SERVICE_GROUP_ORDER: { key: string; label: string }[] = [
  { key: "sport", label: "Sports" },
  { key: "wellness_fitness", label: "Wellness & Fitness" },
  { key: "mind_game", label: "Mind Games" },
  { key: "indoor_game", label: "Indoor Games" },
  { key: "dance", label: "Dance" },
  { key: "music", label: "Music" },
  { key: "subject", label: "School Subjects" },
  { key: "exam_board", label: "Boards & Exams" },
];

// How many options a section shows inline before offering "View all" — past
// this a section stops being scannable and becomes a wall.
const INLINE_OPTION_LIMIT = 20;

// The provider already told us their category a section earlier, so lead with
// the groups that category actually teaches. This only reorders and pre-opens
// sections — nothing is ever hidden, because a sports academy may well also
// run yoga, and an unrecognised category just falls back to all-collapsed.
const CATEGORY_GROUP_HINTS: Record<string, string[]> = {
  Coach: ["sport", "mind_game", "indoor_game"],
  "Academic Teacher": ["subject", "exam_board"],
  "Home Tutor": ["subject", "exam_board"],
  "Sports Academy": ["sport"],
  "Sports Center": ["sport", "wellness_fitness"],
  "Coaching Center": ["subject", "exam_board"],
  "Dance Teacher": ["dance"],
  "Music Teacher": ["music"],
  "Dance Academy": ["dance"],
  "Music School": ["music"],
};

export default function CompleteProviderProfile() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  const [providerType, setProviderType] = useState<"individual" | "institution" | "event_planner" | "">("");
  const [providerCategoryId, setProviderCategoryId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [selectedServiceCategories, setSelectedServiceCategories] = useState<string[]>([]);
  const [branches, setBranches] = useState<ProviderBranchInput[]>([emptyBranch()]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [modalGroupKey, setModalGroupKey] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState("");

  const [providerCategories, setProviderCategories] = useState<ProviderCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);

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

      const [{ data: cats }, { data: services }, { data: profileRow }, { data: providerRow }] =
        await Promise.all([
          supabase.from("provider_category_master").select("*").eq("is_active", true).order("name"),
          supabase.from("service_category_master").select("*").eq("is_active", true).order("name"),
          supabase.from("profiles").select("phone").eq("id", uid).maybeSingle(),
          supabase.from("providers").select("*").eq("user_id", uid).maybeSingle(),
        ]);

      setProviderCategories((cats as ProviderCategory[]) || []);
      setServiceCategories((services as ServiceCategory[]) || []);
      // Functional update: don't clobber a phone number the user already
      // started typing while this fetch was still in flight.
      setPhone((current) => current || profileRow?.phone || "");

      if (providerRow) {
        setHasExistingProfile(true);
        setProviderId(providerRow.id);
        setProviderType(providerRow.provider_type || "");
        setProviderCategoryId(providerRow.provider_category_id || null);
        setDisplayName(providerRow.display_name || "");
        setBio(providerRow.bio || "");
        setCity(providerRow.city || "");
        setArea(providerRow.area || "");
        setExistingPhoto(providerRow.photo_url || null);
        setSelectedServiceCategories(providerRow.service_category_ids || []);

        if (providerRow.provider_type === "institution") {
          const { data: branchRows } = await supabase
            .from("branches")
            .select("*")
            .eq("provider_id", providerRow.id);

          if (branchRows?.length) {
            setBranches(
              branchRows.map((b) => ({
                label: b.label || "",
                address: b.address || "",
                city: b.city || "",
                area: b.area || "",
                phone: b.phone || "",
              }))
            );
          }
        }
      }
    };

    load();
  }, [router]);

  const availableCategories = useMemo(
    () => providerCategories.filter((c) => c.provider_type === providerType),
    [providerCategories, providerType]
  );

  const servicesByGroup = useMemo(() => {
    return serviceCategories.reduce<Record<string, ServiceCategory[]>>((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [serviceCategories]);

  const serviceQuery = serviceSearch.trim().toLowerCase();

  const selectedCategoryName = useMemo(
    () => providerCategories.find((c) => c.id === providerCategoryId)?.name || "",
    [providerCategories, providerCategoryId]
  );

  const suggestedGroups = useMemo(
    () => CATEGORY_GROUP_HINTS[selectedCategoryName] || [],
    [selectedCategoryName]
  );

  // Everything the provider has picked so far, so their choices stay visible
  // even when the group they came from is collapsed.
  const selectedServices = useMemo(
    () => serviceCategories.filter((item) => selectedServiceCategories.includes(item.id)),
    [serviceCategories, selectedServiceCategories]
  );

  // Groups carrying their search-filtered items and selection count, with the
  // ones suggested by the provider's category floated to the top.
  const serviceGroups = useMemo(() => {
    const groups = SERVICE_GROUP_ORDER.map(({ key, label }) => {
      const all = servicesByGroup[key] || [];
      return {
        key,
        label,
        total: all.length,
        suggested: suggestedGroups.includes(key),
        items: serviceQuery
          ? all.filter((item) => item.name.toLowerCase().includes(serviceQuery))
          : all,
        selectedCount: all.filter((item) => selectedServiceCategories.includes(item.id)).length,
      };
    }).filter((group) => group.total > 0);

    // Stable partition: suggested groups first, each side keeping SERVICE_GROUP_ORDER.
    return [...groups.filter((g) => g.suggested), ...groups.filter((g) => !g.suggested)];
  }, [servicesByGroup, serviceQuery, selectedServiceCategories, suggestedGroups]);

  // "View all" popup — always shows the whole group with its own search,
  // independent of whatever is typed in the section-level search box.
  const modalLabel = SERVICE_GROUP_ORDER.find((g) => g.key === modalGroupKey)?.label || "";

  const modalItems = useMemo(() => {
    if (!modalGroupKey) return [];
    const all = servicesByGroup[modalGroupKey] || [];
    const query = modalSearch.trim().toLowerCase();
    return query ? all.filter((item) => item.name.toLowerCase().includes(query)) : all;
  }, [modalGroupKey, servicesByGroup, modalSearch]);

  const closeModal = () => {
    setModalGroupKey(null);
    setModalSearch("");
  };

  useEffect(() => {
    if (!modalGroupKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalGroupKey]);

  const toggleService = (id: string) => {
    setSelectedServiceCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const fieldErrors: ProviderProfileFieldErrors = showValidation
    ? getProviderProfileFieldErrors({
        providerType,
        providerCategoryId,
        displayName,
        bio,
        phone,
        city,
        serviceCategoryIds: selectedServiceCategories,
        photoUrl: photoFile || existingPhoto ? "__provided__" : null,
        branches,
      })
    : {};

  const getFieldClass = (field: keyof ProviderProfileFieldErrors) =>
    `${inputClass} ${fieldErrors[field]?.length ? "border-red-300 bg-red-50/60 focus:border-red-400" : ""}`;

  const updateBranch = (index: number, patch: Partial<ProviderBranchInput>) => {
    setBranches((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const handleSave = async () => {
    if (!userId) return;

    setShowValidation(true);
    const validationErrors = getProviderProfileFieldErrors({
      providerType,
      providerCategoryId,
      displayName,
      bio,
      phone,
      city,
      serviceCategoryIds: selectedServiceCategories,
      photoUrl: photoFile || existingPhoto ? "__provided__" : null,
      branches,
    });

    if (Object.keys(validationErrors).length > 0) return;

    setIsSaving(true);
    setFormError("");

    let photoUrl = existingPhoto;

    if (photoFile) {
      const fileExt = photoFile.name.split(".").pop() || "jpg";
      const path = `${userId}/profile.${fileExt}`;

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

    const firstBranch = branches[0];
    const isFirstProfileSave = !hasExistingProfile;

    const { data: savedProvider, error } = await supabase
      .from("providers")
      .upsert(
        {
          user_id: userId,
          provider_type: providerType,
          provider_category_id: providerType === "event_planner" ? null : providerCategoryId,
          display_name: displayName,
          bio,
          city: providerType === "institution" ? firstBranch.city : city,
          area: providerType === "institution" ? firstBranch.area : area,
          service_category_ids: selectedServiceCategories,
          photo_url: photoUrl,
          approved: isFirstProfileSave ? false : undefined,
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    if (error || !savedProvider) {
      setFormError(error?.message || "Unable to save profile.");
      setIsSaving(false);
      return;
    }

    setProviderId(savedProvider.id);

    if (providerType === "institution") {
      // Simplest correct approach for now: replace all branches on every
      // save. Fine for initial setup; a dedicated "add branch" action in
      // the provider dashboard (later) will append without wiping others.
      await supabase.from("branches").delete().eq("provider_id", savedProvider.id);

      const validBranches = branches.filter((b) => b.label.trim() && b.address.trim() && b.city.trim());

      if (validBranches.length) {
        await supabase.from("branches").insert(
          validBranches.map((b) => ({
            provider_id: savedProvider.id,
            label: b.label,
            address: b.address,
            city: b.city,
            area: b.area,
            phone: b.phone,
          }))
        );
      }
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
      <div className="mx-auto max-w-3xl space-y-8 px-6">
        <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
            Provider Profile
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
            Set up your listing
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            Your profile is reviewed before it's visible to parents and students — you can keep
            editing it any time after.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="text-xl font-semibold text-gray-900">What kind of provider are you?</h2>
          <div className={`mt-6 grid gap-3 sm:grid-cols-3 ${fieldErrors.providerType?.length ? "rounded-2xl border border-red-300 bg-red-50/40 p-3" : ""}`}>
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
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="text-sm font-semibold">{option.title}</div>
                <div className="mt-1 text-xs leading-5 text-gray-500">{option.description}</div>
              </button>
            ))}
          </div>
          {fieldErrors.providerType?.[0] && <p className={errorTextClass}>{fieldErrors.providerType[0]}</p>}

          {providerType && providerType !== "event_planner" && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Category
              </h3>
              <div className={`mt-3 flex flex-wrap gap-3 ${fieldErrors.providerCategoryId?.length ? "rounded-2xl border border-red-300 bg-red-50/40 p-3" : ""}`}>
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setProviderCategoryId(cat.id)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      providerCategoryId === cat.id
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              {fieldErrors.providerCategoryId?.[0] && (
                <p className={errorTextClass}>{fieldErrors.providerCategoryId[0]}</p>
              )}
            </div>
          )}
        </div>

        <div className={sectionClass}>
          <h2 className="text-xl font-semibold text-gray-900">Basic Information</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <input
                className={getFieldClass("displayName")}
                placeholder="Name / Business name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.displayName?.[0] && <p className={errorTextClass}>{fieldErrors.displayName[0]}</p>}
            </div>
            <div>
              <input
                className={getFieldClass("phone")}
                placeholder="Mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {fieldErrors.phone?.[0] && <p className={errorTextClass}>{fieldErrors.phone[0]}</p>}
            </div>
          </div>

          <textarea
            className={`${getFieldClass("bio")} mt-4 min-h-28`}
            placeholder="A short bio — your experience, approach, what makes you worth booking."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          {fieldErrors.bio?.[0] && <p className={errorTextClass}>{fieldErrors.bio[0]}</p>}

          {providerType !== "institution" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <input
                  className={getFieldClass("city")}
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                {fieldErrors.city?.[0] && <p className={errorTextClass}>{fieldErrors.city[0]}</p>}
              </div>
              <input
                className={inputClass}
                placeholder="Area (optional)"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
          )}

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Photo / logo</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            {fieldErrors.photoUrl?.[0] && <p className={errorTextClass}>{fieldErrors.photoUrl[0]}</p>}
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900">What do you teach or coach?</h2>
            {selectedServiceCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedServiceCategories([])}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Clear {selectedServiceCategories.length} selected
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Pick everything that applies — search, or open a section to browse.
          </p>

          {selectedServices.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-gray-50 p-3">
              {selectedServices.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setSelectedServiceCategories((prev) => prev.filter((id) => id !== item.id))
                  }
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2.5 text-sm text-white transition hover:bg-indigo-700"
                  aria-label={`Remove ${item.name}`}
                >
                  {item.name}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}

          <input
            className={`${inputClass} mt-4`}
            placeholder="Search — e.g. Cricket, Physics, JEE, Yoga"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
          />

          <div className={`mt-5 space-y-3 ${fieldErrors.serviceCategoryIds?.length ? "rounded-2xl border border-red-300 bg-red-50/40 p-4" : ""}`}>
            {serviceGroups.map((group) => {
              // While searching, groups auto-open to reveal matches and groups
              // with no matches drop out entirely. Otherwise an explicit toggle
              // wins, falling back to "open if it suits their category".
              const expanded = serviceQuery
                ? group.items.length > 0
                : expandedGroups[group.key] ?? group.suggested;
              if (serviceQuery && group.items.length === 0) return null;

              return (
                <div key={group.key} className="rounded-2xl border border-gray-200">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
                      {group.label}
                      <span className="text-xs font-normal text-gray-400">
                        {serviceQuery ? `${group.items.length} of ${group.total}` : group.total}
                      </span>
                      {group.suggested && !serviceQuery && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Usual for {selectedCategoryName}
                        </span>
                      )}
                      {group.selectedCount > 0 && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          {group.selectedCount} selected
                        </span>
                      )}
                    </span>
                    {!serviceQuery && (
                      <span className="text-gray-400">{expanded ? "−" : "+"}</span>
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {group.items.slice(0, INLINE_OPTION_LIMIT).map((item) => {
                          const checked = selectedServiceCategories.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleService(item.id)}
                              // py-2.5 keeps the tap target near the 44px mobile
                              // guideline; py-1.5 rendered these at ~34px.
                              className={`rounded-full border px-3.5 py-2.5 text-sm transition ${
                                checked
                                  ? "border-indigo-600 bg-indigo-600 text-white"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"
                              }`}
                            >
                              {item.name}
                            </button>
                          );
                        })}
                      </div>

                      {group.items.length > INLINE_OPTION_LIMIT && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalGroupKey(group.key);
                            setModalSearch("");
                          }}
                          className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View all {group.total} {group.label.toLowerCase()} →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {serviceQuery && serviceGroups.every((g) => g.items.length === 0) && (
              <p className="px-1 py-2 text-sm text-gray-500">
                Nothing matches “{serviceSearch.trim()}”.
              </p>
            )}
          </div>
          {fieldErrors.serviceCategoryIds?.[0] && <p className={errorTextClass}>{fieldErrors.serviceCategoryIds[0]}</p>}
        </div>

        {providerType === "institution" && (
          <div className={sectionClass}>
            <h2 className="text-xl font-semibold text-gray-900">Branches</h2>
            <p className="mt-2 text-sm text-gray-500">
              Add every location you operate from — location is how parents find you.
            </p>

            <div className="mt-6 space-y-5">
              {branches.map((branch, index) => (
                <div key={index} className="rounded-2xl border border-gray-200 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <input
                      className={inputClass}
                      placeholder="Branch name"
                      value={branch.label}
                      onChange={(e) => updateBranch(index, { label: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder="Phone"
                      value={branch.phone}
                      onChange={(e) => updateBranch(index, { phone: e.target.value })}
                    />
                  </div>
                  <input
                    className={`${inputClass} mt-4`}
                    placeholder="Address"
                    value={branch.address}
                    onChange={(e) => updateBranch(index, { address: e.target.value })}
                  />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input
                      className={inputClass}
                      placeholder="City"
                      value={branch.city}
                      onChange={(e) => updateBranch(index, { city: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder="Area"
                      value={branch.area}
                      onChange={(e) => updateBranch(index, { area: e.target.value })}
                    />
                  </div>
                  {branches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBranches((prev) => prev.filter((_, i) => i !== index))}
                      className="mt-3 text-sm font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove branch
                    </button>
                  )}
                </div>
              ))}
            </div>
            {fieldErrors.branches?.[0] && <p className={errorTextClass}>{fieldErrors.branches[0]}</p>}

            <button
              type="button"
              onClick={() => setBranches((prev) => [...prev, emptyBranch()])}
              className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              + Add another branch
            </button>
          </div>
        )}

        <div className={sectionClass}>
          {formError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {formError}
            </div>
          )}
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

      {modalGroupKey && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-4 py-6"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`All ${modalLabel} options`}
        >
          <div
            className="mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{modalLabel}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedServices.filter((s) => s.group === modalGroupKey).length} of{" "}
                  {(servicesByGroup[modalGroupKey] || []).length} selected
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-3 py-1 text-2xl leading-none text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="border-b border-gray-100 px-6 py-4">
              <input
                autoFocus
                className={inputClass}
                placeholder={`Search ${modalLabel.toLowerCase()}…`}
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {modalItems.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing matches “{modalSearch.trim()}”.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {modalItems.map((item) => {
                    const checked = selectedServiceCategories.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleService(item.id)}
                        className={`rounded-full border px-3.5 py-2.5 text-sm transition ${
                          checked
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"
                        }`}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
