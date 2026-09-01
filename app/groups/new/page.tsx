"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DEFAULT_VALIDITY_DAYS, MEMBERS_TO_ACTIVATE, VALIDITY_OPTIONS } from "@/lib/groups";

type City = { id: string; name: string };
type Area = { id: string; city_id: string; name: string };
type Service = { id: string; name: string; group: string };

const GROUP_LABEL: Record<string, string> = {
  sport: "Sports",
  wellness_fitness: "Wellness & Fitness",
  mind_game: "Mind Games",
  indoor_game: "Indoor Games",
  dance: "Dance",
  music: "Music",
  subject: "School Subjects",
  exam_board: "Boards & Exams",
};
const GROUP_ORDER = Object.keys(GROUP_LABEL);

export default function NewGroupPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [society, setSociety] = useState("");
  const [studentCount, setStudentCount] = useState("3");
  const [notes, setNotes] = useState("");
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

      const [{ data: c }, { data: a }, { data: s }] = await Promise.all([
        supabase.from("cities").select("id, name").eq("is_active", true).order("name"),
        supabase.from("areas").select("id, city_id, name").eq("is_live", true).order("name"),
        supabase
          .from("service_category_master")
          .select("id, name, group")
          .eq("is_active", true)
          .order("name"),
      ]);

      setCities((c as City[]) || []);
      setAreas((a as Area[]) || []);
      setServices((s as Service[]) || []);
      if ((c as City[])?.length) setCityId((c as City[])[0].id);
      setReady(true);
    };

    load();
  }, [router]);

  const cityAreas = useMemo(() => areas.filter((a) => a.city_id === cityId), [areas, cityId]);

  const servicesByGroup = useMemo(() => {
    const grouped = services.reduce<Record<string, Service[]>>((acc, s) => {
      (acc[s.group] = acc[s.group] || []).push(s);
      return acc;
    }, {});
    return GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => ({
      group: g,
      label: GROUP_LABEL[g],
      items: grouped[g],
    }));
  }, [services]);

  const create = async () => {
    setError("");

    if (!serviceId) return setError("Choose what you're looking for.");
    if (!areaId) return setError("Choose your area.");
    if (society.trim().length < 2) return setError("Enter your society or locality.");

    const count = Number(studentCount);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return setError("Number of students should be between 1 and 100.");
    }

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
            </div>
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
