"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ProviderTabs from "@/components/provider/ProviderTabs";
import { useAlerts } from "@/components/AlertsBadge";
import { expiryLabel } from "@/lib/groups";
import {
  DEFAULT_RADIUS_KM,
  Demand,
  DemandKind,
  MIN_APPROACH,
  RADIUS_OPTIONS,
  Suggestion,
  contactLabel,
  contactTone,
  demandKey,
  demandSubtitle,
  demandTitle,
  fetchDemand,
  fetchSuggestions,
  formatDistance,
} from "@/lib/students";
import { budgetLabel, daysLabel, learnerLabel, levelLabel, timeLabel } from "@/lib/requirements";

type Service = { id: string; name: string };
type Area = { id: string; name: string; city: string };
type Filter = "all" | DemandKind;

const sidebarButton = (active: boolean) =>
  `w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm transition ${
    active ? "bg-surface-3 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
  }`;

/**
 * The coach's half of the marketplace.
 *
 * Parents have had a search screen since Phase 1 and coaches have had a
 * waiting room. This is the screen that answers the coach's question — who
 * near me wants what I teach — over both kinds of demand at once: families who
 * published a requirement, and groups of neighbours. Splitting those across
 * two tabs is what made the Groups screen read as "no work" when there was
 * work sitting one query away.
 *
 * Nobody here is named. A coach sees an area and a requirement, writes once,
 * and the family decides whether to answer — the rule Groups has enforced
 * since 2A, applied to the other kind of row.
 */
export default function FindStudentsPage() {
  const router = useRouter();
  const alerts = useAlerts();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [demand, setDemand] = useState<Demand[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  const [kind, setKind] = useState<Filter>("all");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState("");

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [aboutService, setAboutService] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Who the coach is, and what they're allowed to see. Mirrors the checks the
  // database makes in students_for_provider, said in words rather than
  // returning an empty list a coach would read as "no demand".
  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.push("/login");
        return;
      }

      const { data: provider } = await supabase
        .from("providers")
        .select("id, approved, is_suspended, provider_type, service_category_ids")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (!provider) {
        setBlocked(
          "Finish your listing and we'll start showing you families looking for what you teach."
        );
        setLoading(false);
        return;
      }
      if (provider.provider_type === "event_planner") {
        setBlocked("This is for coaches and tutors — event planners aren't matched to classes.");
        setLoading(false);
        return;
      }
      if (provider.is_suspended) {
        setBlocked("Your listing is suspended, so demand isn't shown.");
        setLoading(false);
        return;
      }
      if (!provider.approved) {
        setBlocked(
          "Your listing is still being reviewed. As soon as it's approved you'll see families near you looking for what you teach."
        );
        setLoading(false);
        return;
      }

      const [{ data: serviceRows }, { data: areaLinks }] = await Promise.all([
        supabase
          .from("service_category_master")
          .select("id, name")
          .in("id", provider.service_category_ids || [])
          .order("name"),
        supabase.from("provider_discoverable_areas").select("area_id").eq("provider_id", provider.id),
      ]);

      const ids = (areaLinks || []).map((a) => a.area_id);
      const { data: areaRows } = ids.length
        ? await supabase.from("areas").select("id, name, cities(name)").in("id", ids).order("name")
        : { data: [] };

      setServices((serviceRows as Service[]) || []);
      setAreas(
        ((areaRows as { id: string; name: string; cities: { name: string } | { name: string }[] }[]) || []).map(
          (a) => ({
            id: a.id,
            name: a.name,
            city: (Array.isArray(a.cities) ? a.cities[0]?.name : a.cities?.name) || "",
          })
        )
      );
      setProviderId(provider.id);
    };

    load();
  }, [router]);

  const reload = useCallback(async () => {
    if (!providerId) return;

    setLoading(true);
    const { demand: rows, error: loadError } = await fetchDemand(providerId, {
      serviceCategoryId: serviceId,
      areaId,
      radiusKm,
    });

    if (loadError) setError(loadError);
    setDemand(rows);
    setLoading(false);
  }, [providerId, serviceId, areaId, radiusKm]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Every filter change goes through here, because a ranking is about the
   * list it was asked for: a reason written about a list you are no longer
   * looking at is worse than no reason at all.
   */
  const changeFilter = (apply: () => void) => {
    apply();
    setSuggestions([]);
    setSuggestNote("");
  };

  const suggest = async () => {
    if (!providerId) return;

    setSuggesting(true);
    setSuggestNote("");

    const { suggestions: picks, error: suggestError } = await fetchSuggestions(providerId, {
      serviceCategoryId: serviceId,
      areaId,
      radiusKm,
    });

    setSuggesting(false);

    if (suggestError) {
      setSuggestNote(suggestError);
      return;
    }
    if (picks.length === 0) {
      setSuggestNote(
        "Nothing stood out above the rest here — the list below is everything, nearest first."
      );
      return;
    }

    setSuggestions(picks);
  };

  const reasonFor = useMemo(
    () => new Map(suggestions.map((s) => [s.key, s.reason])),
    [suggestions]
  );

  const visible = useMemo(() => {
    const rows = kind === "all" ? demand : demand.filter((d) => d.kind === kind);
    if (suggestions.length === 0) return rows;

    // A ranking the coach asked for should actually reorder the page, not
    // just decorate it. Everything else keeps its own order underneath.
    const rank = new Map(suggestions.map((s, i) => [s.key, i]));
    return [...rows].sort((a, b) => {
      const ra = rank.get(demandKey(a)) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(demandKey(b)) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, [demand, kind, suggestions]);

  const counts = useMemo(
    () => ({
      all: demand.length,
      student: demand.filter((d) => d.kind === "student").length,
      group: demand.filter((d) => d.kind === "group").length,
    }),
    [demand]
  );

  const openComposer = (d: Demand) => {
    setOpenKey(demandKey(d));
    setMessage("");
    setAboutService(d.service_category_ids[0] || "");
    setError("");
  };

  const send = async (d: Demand) => {
    const body = message.trim();
    if (body.length < MIN_APPROACH) {
      setError(`Write a little more — at least ${MIN_APPROACH} characters, so they can judge you.`);
      return;
    }

    setSending(true);
    setError("");

    const { error: sendError } =
      d.kind === "group"
        ? await supabase
            .from("group_requests")
            .insert({ group_id: d.id, provider_id: providerId, message: body })
        : await supabase.from("enquiries").insert({
            seeker_id: d.id,
            provider_id: providerId,
            service_category_id: aboutService || null,
            message: body,
            initiated_by: "provider",
            status: "pending",
          });

    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }

    setOpenKey(null);
    setMessage("");
    reload();
  };

  if (loading && demand.length === 0 && !blocked) {
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-10">
        <ProviderTabs
          studentCount={demand.filter((d) => !d.contact_status).length}
          messageCount={Number(alerts?.unread_threads || 0)}
        />

        <header className="cf-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="cf-eyebrow">Find students</p>
              <h1 className="cf-display mt-3 text-3xl text-ink">Families looking for you</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted">
                Parents who&apos;ve said what they want, and groups of neighbours who&apos;ve got
                together — all of them wanting something you teach, near where you teach it. Write
                once; they decide whether to answer.
              </p>
            </div>

            {!blocked && (
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || demand.length === 0}
                className="cf-btn-primary shrink-0"
              >
                {suggesting ? "Reading them…" : "Suggest my best matches"}
              </button>
            )}
          </div>

          {suggestNote && <p className="mt-4 text-sm text-muted">{suggestNote}</p>}

          {suggestions.length > 0 && (
            <p className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              {suggestions.length} moved to the top, with a note on each saying why. Everything
              else is below, unchanged.
            </p>
          )}
        </header>

        {blocked ? (
          <div className="cf-card p-8 text-center">
            <p className="text-muted">{blocked}</p>
            <Link href="/dashboard" className="cf-btn-ghost mt-6">
              Back to my listing
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <aside className="cf-card h-fit space-y-6 p-5">
              <div>
                <h2 className="cf-eyebrow">Who</h2>
                <div className="mt-3 space-y-1">
                  {(
                    [
                      ["all", "Everyone", counts.all],
                      ["student", "Individual families", counts.student],
                      ["group", "Groups", counts.group],
                    ] as [Filter, string, number][]
                  ).map(([value, label, count]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setKind(value)}
                      className={sidebarButton(kind === value)}
                    >
                      {label}
                      <span className="ml-2 text-xs text-faint">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="cf-eyebrow">What they want</h2>
                <div className="mt-3 space-y-1">
                  <button
                    type="button"
                    onClick={() => changeFilter(() => setServiceId(null))}
                    className={sidebarButton(!serviceId)}
                  >
                    Anything I teach
                  </button>
                  {services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => changeFilter(() => setServiceId(s.id))}
                      className={sidebarButton(serviceId === s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="cf-eyebrow">Area</h2>
                <div className="mt-3 space-y-1">
                  <button
                    type="button"
                    onClick={() => changeFilter(() => setAreaId(null))}
                    className={sidebarButton(!areaId)}
                  >
                    Anywhere I serve
                  </button>
                  {areas.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => changeFilter(() => setAreaId(a.id))}
                      className={sidebarButton(areaId === a.id)}
                    >
                      {a.name}
                      {a.city && <span className="ml-1 text-xs text-faint">{a.city}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="cf-eyebrow">How far</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RADIUS_OPTIONS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      className="cf-pill px-3 py-1.5 text-xs"
                      data-selected={radiusKm === km}
                      onClick={() => changeFilter(() => setRadiusKm(km))}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-faint">
                  Measured from the nearest area you serve.
                </p>
              </div>
            </aside>

            <section className="space-y-3">
              {error && (
                <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              {visible.length === 0 ? (
                <div className="cf-card p-8 text-center">
                  <p className="text-ink">Nothing here yet.</p>
                  <p className="mt-2 text-sm text-muted">
                    {radiusKm < Math.max(...RADIUS_OPTIONS)
                      ? "Try widening the distance, or clearing the subject filter."
                      : "Families appear here as they publish what they're looking for. Covering more areas means seeing more of them."}
                  </p>
                  {radiusKm < Math.max(...RADIUS_OPTIONS) ? (
                    <button
                      type="button"
                      onClick={() => changeFilter(() => setRadiusKm(Math.max(...RADIUS_OPTIONS)))}
                      className="cf-btn-ghost mt-5 px-5 py-2 text-sm"
                    >
                      Look within {Math.max(...RADIUS_OPTIONS)} km
                    </button>
                  ) : (
                    <Link href="/account/profile" className="cf-btn-ghost mt-5">
                      Edit my areas
                    </Link>
                  )}
                </div>
              ) : (
                visible.map((d) => {
                  const key = demandKey(d);
                  const reason = reasonFor.get(key);
                  const status = contactLabel(d);
                  const composing = openKey === key;

                  const facts = [
                    formatDistance(d.distance_km),
                    learnerLabel(d.learner_age),
                    levelLabel(d.level),
                    timeLabel(d.preferred_time),
                    daysLabel(d.preferred_days),
                    budgetLabel(d.budget_min, d.budget_max, d.budget_period),
                    d.kind === "group" && d.expires_at ? expiryLabel(d.expires_at) : null,
                  ].filter(Boolean) as string[];

                  return (
                    <article key={key} className="cf-card p-6">
                      {reason && (
                        <p className="mb-4 rounded-2xl border border-gold/30 bg-surface-2 px-4 py-3 text-sm text-accent-ink">
                          {reason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="cf-display text-lg text-ink">{demandTitle(d)}</h2>
                          <p className="mt-1 text-sm text-muted">{demandSubtitle(d)}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="cf-badge cf-badge-neutral">
                            {d.kind === "group" ? "Group" : "Family"}
                          </span>
                          {status && (
                            <span className={`cf-badge ${contactTone(d)}`}>{status}</span>
                          )}
                        </div>
                      </div>

                      {facts.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {facts.map((f) => (
                            <span key={f} className="cf-badge cf-badge-neutral">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}

                      {d.notes && <p className="mt-4 leading-relaxed text-muted">{d.notes}</p>}

                      {status ? (
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <p className="text-sm text-muted">
                            {d.contact_status === "declined"
                              ? "This one wasn't taken up."
                              : "You've already written to them."}
                          </p>
                          {d.thread_id && d.contact_status !== "declined" && (
                            <Link
                              href={`/dashboard/messages?thread=${d.thread_id}`}
                              className="cf-btn-ghost px-5 py-2 text-sm"
                            >
                              Open conversation
                            </Link>
                          )}
                        </div>
                      ) : composing ? (
                        <div className="mt-5">
                          {d.kind === "student" && d.service_category_ids.length > 1 && (
                            <div className="mb-3">
                              <label className="mb-2 block text-sm text-muted">
                                Which one are you writing about?
                              </label>
                              <select
                                className="cf-input"
                                value={aboutService}
                                onChange={(e) => setAboutService(e.target.value)}
                              >
                                {d.service_category_ids.map((id, i) => (
                                  <option key={id} value={id}>
                                    {d.service_names[i] || "This"}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <label className="mb-2 block text-sm text-muted">
                            What would you say to them?
                          </label>
                          <textarea
                            autoFocus
                            className="cf-input min-h-28"
                            placeholder="What you'd run for them, where, when, and roughly what it costs. They'll read this before deciding whether to reply."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                          />
                          <p className="mt-2 text-xs text-faint">
                            You get one message{d.kind === "group" ? " per group" : ""}, so make it
                            count. They see your listing alongside it.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => send(d)}
                              disabled={sending}
                              className="cf-btn-primary px-5 py-2 text-sm"
                            >
                              {sending ? "Sending…" : "Send"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenKey(null);
                                setMessage("");
                                setError("");
                              }}
                              className="cf-btn-ghost px-5 py-2 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openComposer(d)}
                          className="cf-btn-primary mt-5 px-5 py-2 text-sm"
                        >
                          Get in touch
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
