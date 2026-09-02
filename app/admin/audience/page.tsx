"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * What the demand side looks like in aggregate, and how it is moving.
 *
 * Built now, before the event-organiser and advertiser accounts exist, so
 * that when they arrive the question "what can we show them?" already has an
 * answer with a shape: audience_segments(), which returns counts, suppresses
 * anything under five families, and has no column that could identify a
 * household even if someone asked it to.
 *
 * The interest log below it is the other half — admin-only, and identifying,
 * which is why it is on this page and not in that function. It exists because
 * "families here keep dropping cricket for football in September" is the kind
 * of thing that is obvious in a list of changes and invisible in a snapshot.
 */

type Segment = {
  city_name: string;
  area_name: string;
  service_name: string;
  service_group: string;
  age_band: string;
  audience: string;
  families: number;
  opted_in_families: number;
  last_interest_at: string;
};

type InterestEvent = {
  id: string;
  change_kind: string;
  recorded_at: string;
  relation_to_learner: string | null;
  learner_age: number | null;
  service_names: string[] | null;
  added_service_names: string[] | null;
  removed_service_names: string[] | null;
};

const KIND_LABEL: Record<string, string> = {
  created: "started looking",
  updated: "changed",
  cleared: "stopped looking",
};

export default function AudienceAdmin() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [events, setEvents] = useState<InterestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const [{ data: seg, error: segError }, { data: ev }] = await Promise.all([
        supabase.rpc("audience_segments"),
        supabase
          .from("requirement_events")
          .select(
            "id, change_kind, recorded_at, relation_to_learner, learner_age, service_names, added_service_names, removed_service_names"
          )
          .order("recorded_at", { ascending: false })
          .limit(100),
      ]);

      if (segError) setError(segError.message);
      setSegments((seg as Segment[]) || []);
      setEvents((ev as InterestEvent[]) || []);
      setLoading(false);
    };

    load();
  }, []);

  const totals = useMemo(() => {
    const families = segments.reduce((sum, s) => sum + Number(s.families), 0);
    const optedIn = segments.reduce((sum, s) => sum + Number(s.opted_in_families), 0);
    const switches = events.filter(
      (e) => (e.added_service_names?.length || 0) > 0 && (e.removed_service_names?.length || 0) > 0
    ).length;
    return { families, optedIn, switches };
  }, [segments, events]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Audience</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Demand grouped by area, activity, age band and who is asking. Counts only — no names, no
          contact details, no exact ages, and any group of fewer than five families is left out
          entirely. This is the read an event organiser or advertiser would be given; the tables
          underneath it are not.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Families in reportable segments
              </h2>
              <p className="mt-3 text-3xl font-bold text-gray-900">{totals.families}</p>
              <p className="mt-1 text-sm text-gray-500">
                counted once per activity they want
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Contactable
              </h2>
              <p className="mt-3 text-3xl font-bold text-gray-900">{totals.optedIn}</p>
              <p className="mt-1 text-sm text-gray-500">
                have opted in to hearing about camps and events
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Switched activity
              </h2>
              <p className="mt-3 text-3xl font-bold text-gray-900">{totals.switches}</p>
              <p className="mt-1 text-sm text-gray-500">in the last 100 changes</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200">
            {segments.length === 0 ? (
              <div className="p-8 text-sm text-gray-500">
                Nothing reportable yet. A segment appears once five families in the same area want
                the same thing in the same age band — until then there is no aggregate to show,
                only households.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Where</th>
                    <th className="px-6 py-3">Activity</th>
                    <th className="px-6 py-3">Age</th>
                    <th className="px-6 py-3">Asking</th>
                    <th className="px-6 py-3">Families</th>
                    <th className="px-6 py-3">Contactable</th>
                    <th className="px-6 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-6 py-3 text-gray-900">
                        {s.area_name}
                        <span className="text-gray-400"> · {s.city_name}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-900">{s.service_name}</td>
                      <td className="px-6 py-3 text-gray-500">{s.age_band}</td>
                      <td className="px-6 py-3 text-gray-500">{s.audience}</td>
                      <td className="px-6 py-3 font-semibold text-gray-900">{s.families}</td>
                      <td className="px-6 py-3 text-gray-500">{s.opted_in_families}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {new Date(s.last_interest_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900">
              How interests are moving
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              Every version of every requirement, kept rather than overwritten. The last 100
              changes.
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
              {events.length === 0 ? (
                <div className="p-8 text-sm text-gray-500">
                  No changes recorded yet. The first is written the moment a parent saves what
                  they&apos;re looking for.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-6 py-3">When</th>
                      <th className="px-6 py-3">What happened</th>
                      <th className="px-6 py-3">Who</th>
                      <th className="px-6 py-3">Wants now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500">
                          {new Date(e.recorded_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">
                          {KIND_LABEL[e.change_kind] || e.change_kind}
                          {(e.added_service_names?.length ||
                            e.removed_service_names?.length) && (
                            <span className="ml-2 text-xs">
                              {e.removed_service_names?.length ? (
                                <span className="text-red-600">
                                  −{e.removed_service_names.join(", ")}
                                </span>
                              ) : null}
                              {e.removed_service_names?.length && e.added_service_names?.length
                                ? " "
                                : null}
                              {e.added_service_names?.length ? (
                                <span className="text-green-700">
                                  +{e.added_service_names.join(", ")}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {e.relation_to_learner || "not stated"}
                          {e.learner_age !== null && (
                            <span className="text-gray-400"> · age {e.learner_age}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {e.service_names?.join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
