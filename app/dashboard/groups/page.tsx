"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ProviderTabs from "@/components/provider/ProviderTabs";
import { ProviderGroup, expiryLabel } from "@/lib/groups";

type SentPitch = { id: string; group_id: string; status: string; message: string };

const MIN_PITCH = 20;

export default function ProviderGroupsPage() {
  const router = useRouter();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [sent, setSent] = useState<SentPitch[]>([]);
  const [loading, setLoading] = useState(true);

  const [pitchingId, setPitchingId] = useState<string | null>(null);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/login");
      return;
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("id, approved, is_suspended, provider_type")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!provider) {
      setBlocked("Finish your listing and we'll start showing you groups looking for what you teach.");
      setLoading(false);
      return;
    }
    if (provider.provider_type === "event_planner") {
      setBlocked("Groups are for coaches and tutors — event planners don't appear in this search.");
      setLoading(false);
      return;
    }
    if (provider.is_suspended) {
      setBlocked("Your listing is suspended, so groups aren't shown.");
      setLoading(false);
      return;
    }
    if (!provider.approved) {
      // Same rule the database enforces on pitching — said here rather than
      // letting them write a message that would be refused.
      setBlocked(
        "Your listing is still being reviewed. As soon as it's approved you'll see groups near you looking for what you teach."
      );
      setLoading(false);
      return;
    }

    setProviderId(provider.id);

    const [{ data: matched }, { data: mine }] = await Promise.all([
      supabase.rpc("groups_for_provider", { p_provider_id: provider.id }),
      supabase.from("group_requests").select("id, group_id, status, message").eq("provider_id", provider.id),
    ]);

    setGroups((matched as ProviderGroup[]) || []);
    setSent((mine as SentPitch[]) || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (groupId: string) => {
    const body = pitch.trim();
    if (body.length < MIN_PITCH) {
      setError(`Write a little more — at least ${MIN_PITCH} characters, so they can judge you.`);
      return;
    }

    setBusy(true);
    setError("");

    const { error: sendError } = await supabase
      .from("group_requests")
      .insert({ group_id: groupId, provider_id: providerId, message: body });

    setBusy(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }

    setPitchingId(null);
    setPitch("");
    load();
  };

  const pitchFor = (groupId: string) => sent.find((s) => s.group_id === groupId);

  if (loading) return <div className="min-h-screen bg-bg" />;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-10">
        <ProviderTabs groupCount={groups.filter((g) => !g.already_requested).length} />

        <header className="cf-card p-7">
          <p className="cf-eyebrow">Groups</p>
          <h1 className="cf-display mt-2 text-2xl text-ink">Parents looking for you</h1>
          <p className="mt-2 leading-relaxed text-muted">
            Neighbours who&apos;ve got together to find a coach. You see groups that want what you
            teach, in areas you serve.
          </p>
        </header>

        {blocked ? (
          <div className="cf-card p-8 text-center">
            <p className="text-muted">{blocked}</p>
            <Link href="/dashboard" className="cf-btn-ghost mt-6">
              Back to my listing
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm font-medium text-danger">
                {error}
              </div>
            )}

            {groups.length === 0 ? (
              <div className="cf-card p-8 text-center">
                <p className="text-ink">No groups right now.</p>
                <p className="mt-2 text-sm text-muted">
                  Groups appear here once three neighbours join one, wanting something you teach in
                  an area you serve. Covering more areas means seeing more of them.
                </p>
                <Link href="/account/profile" className="cf-btn-ghost mt-6">
                  Edit my areas
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => {
                  const existing = pitchFor(g.id);
                  const open = pitchingId === g.id;

                  return (
                    <section key={g.id} className="cf-card p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="cf-display text-lg text-ink">{g.service_name}</h2>
                          <p className="mt-1 text-sm text-muted">
                            {g.area_name}, {g.city_name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="cf-badge cf-badge-neutral">
                            {g.student_count} students
                          </span>
                          <span className="cf-badge cf-badge-neutral">
                            {g.member_count} families
                          </span>
                          <span className="cf-badge cf-badge-neutral">
                            {expiryLabel(g.expires_at)}
                          </span>
                        </div>
                      </div>

                      {g.notes && <p className="mt-4 leading-relaxed text-muted">{g.notes}</p>}

                      {existing ? (
                        <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`cf-badge ${
                                existing.status === "accepted"
                                  ? "cf-badge-ok"
                                  : existing.status === "declined"
                                    ? "cf-badge-neutral"
                                    : "cf-badge-warn"
                              }`}
                            >
                              {existing.status === "pending"
                                ? "Waiting for a reply"
                                : existing.status === "accepted"
                                  ? "They replied"
                                  : "Not taken up"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-muted">{existing.message}</p>
                          {existing.status === "accepted" && (
                            <Link
                              href={`/groups/${g.id}/chat/${existing.id}`}
                              className="cf-btn-primary mt-4 px-5 py-2 text-sm"
                            >
                              Open conversation
                            </Link>
                          )}
                        </div>
                      ) : open ? (
                        <div className="mt-5">
                          <label className="mb-2 block text-sm text-muted">
                            What would you say to them?
                          </label>
                          <textarea
                            autoFocus
                            className="cf-input min-h-28"
                            placeholder="What you'd run for them, where, and roughly what it costs. They'll read this before deciding whether to reply."
                            value={pitch}
                            onChange={(e) => setPitch(e.target.value)}
                          />
                          <p className="mt-2 text-xs text-faint">
                            You get one message per group, so make it count.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => send(g.id)}
                              disabled={busy}
                              className="cf-btn-primary px-5 py-2 text-sm"
                            >
                              {busy ? "Sending…" : "Send"}
                            </button>
                            <button
                              onClick={() => {
                                setPitchingId(null);
                                setPitch("");
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
                          onClick={() => {
                            setPitchingId(g.id);
                            setPitch("");
                            setError("");
                          }}
                          className="cf-btn-primary mt-5 px-5 py-2 text-sm"
                        >
                          Get in touch
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
