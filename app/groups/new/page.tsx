"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  fetchSeekerLocations,
  fetchTaxonomy,
  type Area,
  type City,
} from "@/lib/api/reference";
import {
  DEFAULT_VALIDITY_DAYS,
  MEMBERS_TO_ACTIVATE,
  MIN_STUDENTS,
  VALIDITY_OPTIONS,
} from "@/lib/groups";
import RequirementFields from "@/components/requirements/RequirementFields";
import {
  Requirement,
  ServiceOption,
  emptyRequirement,
  getRequirementErrors,
  groupServices,
  requirementToColumns,
} from "@/lib/requirements";


export default function NewGroupPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [society, setSociety] = useState("");
  const [studentCount, setStudentCount] = useState(String(MIN_STUDENTS));
  const [notes, setNotes] = useState("");
  // Same questions the parent's own profile now asks, in the same words —
  // a group is a requirement several families share, not a different object.
  const [requirement, setRequirement] = useState<Requirement>(emptyRequirement());
  const [showPhone, setShowPhone] = useState(false);
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, profile_complete")
        .eq("id", auth.user.id)
        .maybeSingle();

      // A group is a demand signal, and its member count only means something
      // if members are real. Both rules are enforced in the database too.
      if (profile?.role !== "seeker") {
        setBlocked("Only parents and students can create a group.");
        setReady(true);
        return;
      }
      if (!profile?.profile_complete) {
        setBlocked("Finish your profile first — a group needs contactable members.");
        setReady(true);
        return;
      }

      // Live areas only — a group is seeker-side demand, and the launch gate
      // applies to it exactly as it does to search.
      const [{ cities: c, areas: a }, { serviceCategories: s }] = await Promise.all([
        fetchSeekerLocations(),
        fetchTaxonomy(),
      ]);

      setCities((c as City[]) || []);
      setAreas((a as Area[]) || []);
      setServices((s as ServiceOption[]) || []);
      if ((c as City[])?.length) setCityId((c as City[])[0].id);
      setReady(true);
    };

    load();
  }, [router]);

  const cityAreas = useMemo(() => areas.filter((a) => a.cityId === cityId), [areas, cityId]);

  const servicesByGroup = useMemo(() => groupServices(services), [services]);

  const create = async () => {
    setError("");

    if (!serviceId) return setError("Choose what you're looking for.");
    if (!areaId) return setError("Choose your area.");
    if (society.trim().length < 2) return setError("Enter your society or locality.");

    const count = Number(studentCount);
    if (!Number.isInteger(count) || count < MIN_STUDENTS || count > 100) {
      return setError(
        `A group is for ${MIN_STUDENTS} or more students — that's the point of sharing a coach.`
      );
    }

    // The group's own subject is the select above, so the shared fields are
    // never asked for one.
    const detailErrors = getRequirementErrors(requirement, { requireLookingFor: false });
    const firstDetailError = Object.values(detailErrors).flat()[0];
    if (firstDetailError) return setError(firstDetailError);

    setSaving(true);

    const { data: auth } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase
      .from("groups")
      .insert({
        creator_id: auth.user!.id,
        service_category_id: serviceId,
        area_id: areaId,
        society_name: society.trim(),
        student_count: count,
        notes: notes.trim() || null,
        show_phone: showPhone,
        ...requirementToColumns(requirement),
        expires_at: new Date(Date.now() + validityDays * 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message || "Could not create the group.");
      return;
    }

    router.push(`/groups/${data.id}?created=1`);
  };

  if (!ready) return <div className="min-h-screen bg-bg" />;

  if (blocked) {
    return (
      <main className="min-h-screen bg-bg">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="cf-card p-8 text-center">
            <p className="text-muted">{blocked}</p>
            <Link href="/complete-profile/seeker" className="cf-btn-primary mt-6">
              Complete my profile
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-10">
        <header className="cf-card p-8">
          <p className="cf-eyebrow">Start a group</p>
          <h1 className="cf-display mt-3 text-3xl text-ink">Find a coach together</h1>
          <p className="mt-3 leading-relaxed text-muted">
            Get neighbours together and coaches come to you. Share the link once you&apos;ve created
            it — a group reaches coaches at{" "}
            <strong className="text-ink">{MEMBERS_TO_ACTIVATE} members</strong>, and runs for as
            long as you choose.
          </p>
        </header>

        <section className="cf-card space-y-5 p-7">
          {error && (
            <div className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-muted">What are you looking for?</label>
            <select className="cf-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Choose…</option>
              {servicesByGroup.map((g) => (
                <optgroup key={g.group} label={g.label}>
                  {g.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-muted">City</label>
              <select
                className="cf-input"
                value={cityId}
                onChange={(e) => {
                  setCityId(e.target.value);
                  setAreaId("");
                }}
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm text-muted">Area</label>
              <select className="cf-input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Choose…</option>
                {cityAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="mb-2 block text-sm text-muted">Society or locality</label>
              <input
                className="cf-input"
                placeholder="e.g. Gaur Green Avenue"
                value={society}
                onChange={(e) => setSociety(e.target.value)}
              />
              <p className="mt-2 text-xs text-faint">
                Only shown to coaches after you accept them.
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm text-muted">Students</label>
              <input
                className="cf-input"
                inputMode="numeric"
                value={studentCount}
                onChange={(e) => setStudentCount(e.target.value)}
              />
              <p className="mt-2 text-xs text-faint">{MIN_STUDENTS} or more.</p>
            </div>
          </div>

          <div className="border-t border-line-soft pt-5">
            <p className="cf-eyebrow">The details</p>
            <p className="mt-2 mb-4 text-xs text-faint">
              The same questions your own profile asks. Coaches read these before deciding whether
              to write, so a filled-in group gets better replies than a bare one.
            </p>
            <RequirementFields
              value={requirement}
              onChange={setRequirement}
              errors={getRequirementErrors(requirement, { requireLookingFor: false })}
              showLookingFor={false}
              showNotes={false}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">How long should it run?</label>
            <select
              className="cf-input"
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
            >
              {VALIDITY_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-faint">
              You can extend or close it at any time. Groups expire so coaches aren&apos;t shown
              requests that are no longer live.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">Anything else? (optional)</label>
            <textarea
              className="cf-input min-h-24"
              placeholder="Ages, preferred days or timings, level…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={showPhone}
              onChange={(e) => setShowPhone(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">Let accepted coaches call me</span>
              <span className="mt-1 block text-muted">
                Your number is shared only with coaches whose message you accept. You can message
                without this.
              </span>
            </span>
          </label>

          <button type="button" onClick={create} disabled={saving} className="cf-btn-primary w-full">
            {saving ? "Creating…" : "Create group"}
          </button>
        </section>
      </div>
    </main>
  );
}
