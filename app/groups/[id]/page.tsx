"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import {
  EXTEND_DAYS,
  GroupInvite,
  MEMBERS_TO_ACTIVATE,
  activationLabel,
  expiryLabel,
  groupShareUrl,
} from "@/lib/groups";

type Pitch = {
  id: string;
  message: string;
  status: string;
  created_at: string;
  provider_id: string;
  providerName?: string;
};

function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const justCreated = useSearchParams().get("created") === "1";

  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [canJoin, setCanJoin] = useState(false);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    // get_group_invite is readable by anyone holding the link — RLS hides the
    // group itself from non-members, so there would otherwise be nothing to
    // look at before deciding to join.
    const { data: inviteData } = await supabase.rpc("get_group_invite", { p_id: id });
    const g = inviteData as GroupInvite | null;

    if (!g?.id) {
      setInvite(null);
      setLoading(false);
      return;
    }
    setInvite(g);

    const { data: auth } = await supabase.auth.getUser();
    setSignedIn(Boolean(auth.user));

    if (auth.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, profile_complete")
        .eq("id", auth.user.id)
        .maybeSingle();
      setCanJoin(profile?.role === "seeker" && Boolean(profile?.profile_complete));

      const { data: own } = await supabase
        .from("groups")
        .select("creator_id")
        .eq("id", id)
        .maybeSingle();
      const mine = own?.creator_id === auth.user.id;
      setIsCreator(mine);

      if (mine) {
        const { data: reqs } = await supabase
          .from("group_requests")
          .select("id, message, status, created_at, provider_id")
          .eq("group_id", id)
          .order("created_at", { ascending: false });

        const rows = (reqs as Pitch[]) || [];
        // Provider names come from the public profile RPC, which only returns
        // approved, visible providers — the same rule as search.
        const named = await Promise.all(
          rows.map(async (r) => {
            const { data } = await supabase.rpc("get_provider_profile", { p_id: r.provider_id });
            return { ...r, providerName: (data as { display_name?: string } | null)?.display_name };
          })
        );
        setPitches(named);
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    setBusy(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: joinError } = await supabase
      .from("group_members")
      .insert({ group_id: id, user_id: auth.user!.id });
    setBusy(false);

    if (joinError) {
      setError(joinError.message);
      return;
    }
    load();
  };

  const extend = async () => {
    setBusy(true);
    const next = new Date(Date.now() + EXTEND_DAYS * 86_400_000).toISOString();
    await supabase.from("groups").update({ expires_at: next }).eq("id", id);
    setBusy(false);
    load();
  };

  const close = async () => {
    setBusy(true);
    await supabase.from("groups").update({ closed_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    load();
  };

  const answer = async (pitchId: string, status: "accepted" | "declined") => {
    setBusy(true);
    await supabase
      .from("group_requests")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", pitchId);
    setBusy(false);
    load();
  };

  const share = async () => {
    await navigator.clipboard.writeText(groupShareUrl(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) return <div className="min-h-screen bg-bg" />;

  if (!invite) {
    return (
      <main className="min-h-screen bg-bg">
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <div className="cf-card p-8">
            <p className="text-ink">This group doesn&apos;t exist.</p>
            <p className="mt-2 text-sm text-muted">The link may be wrong, or it was removed.</p>
          </div>
        </div>
      </main>
    );
  }

  const needed = Math.max(0, MEMBERS_TO_ACTIVATE - invite.member_count);
  const isMember = invite.already_member;
  const pending = pitches.filter((p) => p.status === "pending");
  const answered = pitches.filter((p) => p.status !== "pending");

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-10">
        {justCreated && (
          <div className="rounded-2xl border border-teal/30 bg-teal-soft px-5 py-4 text-sm font-medium text-teal">
            Group created. Share the link below — {needed > 0 ? `${needed} more` : "you have enough"}{" "}
            {needed === 1 ? "member" : "members"} and coaches can see it.
          </div>
        )}

        <header className="cf-card p-7">
          <p className="cf-eyebrow">Group</p>
          <h1 className="cf-display mt-2 text-3xl text-ink">{invite.service_name}</h1>
          <p className="mt-2 text-muted">
            {invite.society_name} · {invite.area_name}, {invite.city_name}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`cf-badge ${needed === 0 ? "cf-badge-ok" : "cf-badge-warn"}`}>
              {activationLabel(invite.member_count)}
            </span>
            <span className="cf-badge cf-badge-neutral">
              {invite.member_count} member{invite.member_count === 1 ? "" : "s"}
            </span>
            <span className="cf-badge cf-badge-neutral">{invite.student_count} students</span>
            <span className={`cf-badge ${invite.is_open ? "cf-badge-neutral" : "cf-badge-danger"}`}>
              {invite.is_open ? expiryLabel(invite.expires_at) : "Closed"}
            </span>
          </div>

          {invite.notes && <p className="mt-4 leading-relaxed text-muted">{invite.notes}</p>}
        </header>

        {error && (
          <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        {/* Joining */}
        {!isMember && invite.is_open && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Join this group</h2>
            <p className="mt-2 text-sm text-muted">
              The more of you there are, the better the rate — and coaches only see a group once it
              has {MEMBERS_TO_ACTIVATE} members.
            </p>
            {!signedIn ? (
              <Link href={`/login?next=/groups/${id}`} className="cf-btn-primary mt-5">
                Log in to join
              </Link>
            ) : canJoin ? (
              <button onClick={join} disabled={busy} className="cf-btn-primary mt-5">
                {busy ? "Joining…" : "Join group"}
              </button>
            ) : (
              <div className="mt-5">
                <p className="text-sm text-muted">
                  Finish your profile to join — groups only count members who can be contacted.
                </p>
                <Link href="/complete-profile/seeker" className="cf-btn-primary mt-4">
                  Complete my profile
                </Link>
              </div>
            )}
          </section>
        )}

        {/* Sharing */}
        {isMember && invite.is_open && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Invite neighbours</h2>
            <p className="mt-2 text-sm text-muted">
              {needed > 0
                ? `${needed} more ${needed === 1 ? "person" : "people"} and coaches can start reaching out.`
                : "Coaches can see this group now."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono text-xs text-muted">
                {groupShareUrl(id)}
              </code>
              <button onClick={share} className="cf-btn-ghost shrink-0">
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </section>
        )}

        {/* Pitches — creator only */}
        {isCreator && (
          <section className="cf-card p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="cf-display text-lg text-ink">Coaches who got in touch</h2>
              {pending.length > 0 && (
                <span className="cf-badge cf-badge-warn">{pending.length} new</span>
              )}
            </div>

            {pitches.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                {needed > 0
                  ? `No coaches yet — this group reaches them at ${MEMBERS_TO_ACTIVATE} members.`
                  : "No coaches have got in touch yet. They can see your group now."}
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {[...pending, ...answered].map((p) => (
                  <div key={p.id} className="rounded-2xl border border-line bg-surface-2 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/provider/${p.provider_id}`}
                        className="font-semibold text-ink hover:text-gold"
                      >
                        {p.providerName || "A coach"}
                      </Link>
                      <span
                        className={`cf-badge ${
                          p.status === "accepted"
                            ? "cf-badge-ok"
                            : p.status === "declined"
                              ? "cf-badge-neutral"
                              : "cf-badge-warn"
                        }`}
                      >
                        {p.status === "pending" ? "New" : p.status}
                      </span>
                    </div>

                    <p className="mt-3 leading-relaxed text-muted">{p.message}</p>

                    {p.status === "pending" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => answer(p.id, "accepted")}
                          disabled={busy}
                          className="cf-btn-primary px-5 py-2 text-sm"
                        >
                          Accept &amp; message
                        </button>
                        <button
                          onClick={() => answer(p.id, "declined")}
                          disabled={busy}
                          className="cf-btn-ghost px-5 py-2 text-sm"
                        >
                          Not interested
                        </button>
                      </div>
                    ) : p.status === "accepted" ? (
                      <Link
                        href={`/groups/${id}/chat/${p.id}`}
                        className="cf-btn-ghost mt-4 px-5 py-2 text-sm"
                      >
                        Open conversation
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Creator controls */}
        {isCreator && (
          <section className="cf-card p-7">
            <h2 className="cf-display text-lg text-ink">Manage</h2>
            <p className="mt-2 text-sm text-muted">
              {invite.is_open
                ? `Groups run out after a while so coaches aren't shown stale requests. ${expiryLabel(invite.expires_at)}.`
                : "This group is closed. Coaches can no longer see it."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={extend} disabled={busy} className="cf-btn-ghost">
                Extend {EXTEND_DAYS} more days
              </button>
              {invite.is_open && (
                <button
                  onClick={close}
                  disabled={busy}
                  className="cf-btn-ghost text-danger hover:border-danger"
                >
                  Close group
                </button>
              )}
            </div>
          </section>
        )}

        <div className="text-center">
          <button
            onClick={() => router.push("/account/groups")}
            className="text-sm text-muted transition hover:text-ink"
          >
            All my groups
          </button>
        </div>
      </div>
    </main>
  );
}

export default function GroupPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <GroupPage />
    </Suspense>
  );
}
