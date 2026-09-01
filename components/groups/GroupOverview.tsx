"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  EXTEND_DAYS,
  GroupInvite,
  MEMBERS_TO_ACTIVATE,
  expiryLabel,
  groupShareUrl,
  membersStillNeeded,
} from "@/lib/groups";
import { withNext } from "@/lib/next-path";

type Props = {
  invite: GroupInvite;
  isCreator: boolean;
  signedIn: boolean;
  /** A completed seeker profile — groups only count members who can be reached. */
  canJoin: boolean;
  pendingCount: number;
  onChanged: () => void;
  onOpenMessages: () => void;
};

export default function GroupOverview({
  invite,
  isCreator,
  signedIn,
  canJoin,
  pendingCount,
  onChanged,
  onOpenMessages,
}: Props) {
  const id = invite.id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const needed = membersStillNeeded(invite.member_count);
  const isMember = invite.already_member;

  // PostgREST builders are thenable rather than real Promises.
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
  };

  const join = async () => {
    const { data: auth } = await supabase.auth.getUser();
    await run(() =>
      supabase.from("group_members").insert({ group_id: id, user_id: auth.user!.id })
    );
  };

  const extend = () =>
    run(() =>
      supabase
        .from("groups")
        .update({ expires_at: new Date(Date.now() + EXTEND_DAYS * 86_400_000).toISOString() })
        .eq("id", id)
    );

  const close = async () => {
    await run(() =>
      supabase.from("groups").update({ closed_at: new Date().toISOString() }).eq("id", id)
    );
    setConfirmingClose(false);
  };

  // Closing used to be a dead end: Extend only moved expires_at and never
  // cleared closed_at, so the button was still offered and did nothing.
  const reopen = () => {
    const stillFuture = new Date(invite.expires_at).getTime() > Date.now();
    return run(() =>
      supabase
        .from("groups")
        .update({
          closed_at: null,
          ...(stillFuture
            ? {}
            : { expires_at: new Date(Date.now() + EXTEND_DAYS * 86_400_000).toISOString() }),
        })
        .eq("id", id)
    );
  };

  const share = async () => {
    await navigator.clipboard.writeText(groupShareUrl(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {invite.notes && (
        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">What this group wants</h2>
          <p className="mt-3 leading-relaxed text-muted">{invite.notes}</p>
        </section>
      )}

      {/* Coaches waiting — the detail lives in Messages, this is the nudge. */}
      {isCreator && pendingCount > 0 && (
        <button
          onClick={onOpenMessages}
          className="cf-card flex w-full flex-wrap items-center gap-3 p-5 text-left transition hover:border-faint"
        >
          <span className="cf-badge cf-badge-warn">{pendingCount}</span>
          <span className="text-sm text-ink">
            {pendingCount === 1 ? "A coach has" : "Coaches have"} written in — read what they said
            and decide.
          </span>
          <span className="ml-auto text-sm text-gold">Open messages →</span>
        </button>
      )}

      {!isMember && invite.is_open && (
        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Join this group</h2>
          <p className="mt-2 text-sm text-muted">
            The more of you there are, the better the rate — and coaches only see a group once it
            has {MEMBERS_TO_ACTIVATE} members.
          </p>
          {!signedIn ? (
            <Link href={withNext("/login", `/groups/${id}?join=1`)} className="cf-btn-primary mt-5">
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

      {isMember && invite.is_open && (
        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Invite neighbours</h2>
          <p className="mt-2 text-sm text-muted">
            {needed > 0
              ? `You count as the first member. ${needed} more ${needed === 1 ? "person" : "people"} and coaches can start reaching out.`
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

      {isCreator && (
        <section className="cf-card p-7">
          <h2 className="cf-display text-lg text-ink">Manage</h2>
          <p className="mt-2 text-sm text-muted">
            {invite.is_open
              ? `Groups run out after a while so coaches aren't shown stale requests. ${expiryLabel(invite.expires_at)}.`
              : "This group is closed — coaches can't see it. Reopening keeps your members and conversations."}
          </p>
          {invite.is_open ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={extend} disabled={busy} className="cf-btn-ghost">
                Extend {EXTEND_DAYS} more days
              </button>
              {!confirmingClose ? (
                <button
                  onClick={() => setConfirmingClose(true)}
                  disabled={busy}
                  className="cf-btn-ghost text-danger hover:border-danger"
                >
                  Close group
                </button>
              ) : (
                <div className="w-full rounded-2xl border border-danger/40 bg-danger-soft p-4">
                  <p className="text-sm font-semibold text-ink">Close this group?</p>
                  <p className="mt-1 text-sm text-muted">
                    Coaches stop seeing it and can no longer get in touch. Your members and any
                    conversations you&apos;ve already accepted are kept, and you can reopen it
                    whenever you like.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={close}
                      disabled={busy}
                      className="cf-btn-ghost text-danger hover:border-danger"
                    >
                      Yes, close it
                    </button>
                    <button onClick={() => setConfirmingClose(false)} className="cf-btn-ghost">
                      Keep it open
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <button onClick={reopen} disabled={busy} className="cf-btn-primary">
                Reopen group
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
