"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  GroupInvite,
  GroupThread,
  activationLabel,
  expiryLabel,
  membersStillNeeded,
} from "@/lib/groups";
import GroupTabs, { GroupTabKey } from "@/components/groups/GroupTabs";
import GroupOverview from "@/components/groups/GroupOverview";
import GroupMessages from "@/components/groups/GroupMessages";

/**
 * A group is a place you come back to, so it is one page with tabs rather than
 * a summary that hands off to a separate chat page per coach. The tab and the
 * open conversation both live in the URL, which is what makes a conversation
 * linkable and the back button honest.
 */
function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();

  const tabParam = params.get("tab");
  const tab: GroupTabKey = tabParam === "messages" ? "messages" : "overview";
  const activeThread = params.get("t");
  const justCreated = params.get("created") === "1";
  // Set when they followed "Log in to join" — the intent survives the round trip.
  const wantsToJoin = params.get("join") === "1";

  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [canJoin, setCanJoin] = useState(false);
  const [threads, setThreads] = useState<GroupThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

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
    setMe(auth.user?.id ?? null);

    if (auth.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, profile_complete")
        .eq("id", auth.user.id)
        .maybeSingle();
      setCanJoin(profile?.role === "seeker" && Boolean(profile?.profile_complete));

      // One call for the whole inbox. Returns every coach to the parent who
      // created the group, one thread to the coach on it, nothing to anyone
      // else — the same rule the RLS on group_requests enforces.
      const { data: rows } = await supabase.rpc("group_threads", { p_group_id: id });
      const list = (rows as GroupThread[]) || [];
      setThreads(list);
      setIsCreator(list.some((t) => t.is_creator));
    } else {
      setThreads([]);
      setIsCreator(false);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A group with no pitches yet cannot tell us from group_threads whether the
  // viewer created it, so ask directly. RLS returns nothing to non-members.
  useEffect(() => {
    if (!me || threads.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from("groups")
        .select("creator_id")
        .eq("id", id)
        .maybeSingle();
      setIsCreator(data?.creator_id === me);
    })();
  }, [me, threads.length, id]);

  // They clicked "Log in to join" and have now signed in and finished their
  // profile. Clicking that button was the consent; making them find and press
  // Join again is how invitations get abandoned.
  useEffect(() => {
    if (!wantsToJoin || loading || joining) return;
    if (!invite || invite.already_member || !invite.is_open || !canJoin) return;
    (async () => {
      setJoining(true);
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("group_members").insert({ group_id: id, user_id: auth.user!.id });
      setJoining(false);
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsToJoin, loading, invite, canJoin]);

  const go = useCallback(
    (next: { tab?: GroupTabKey; t?: string | null }) => {
      const q = new URLSearchParams();
      const nextTab = next.tab ?? tab;
      if (nextTab !== "overview") q.set("tab", nextTab);
      const nextThread = next.t === undefined ? activeThread : next.t;
      if (nextThread) q.set("t", nextThread);
      const qs = q.toString();
      router.replace(`/groups/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, id, tab, activeThread]
  );

  // A coach has exactly one conversation here; making them click it is friction.
  useEffect(() => {
    if (tab !== "messages" || activeThread || isCreator) return;
    if (threads.length === 1) go({ t: threads[0].request_id });
  }, [tab, activeThread, isCreator, threads, go]);

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

  const needed = membersStillNeeded(invite.member_count);
  const unread = threads.filter((t) => t.unread).length;
  const pending = threads.filter((t) => t.status === "pending" && t.is_creator).length;

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-10">
        {justCreated && (
          <div className="rounded-2xl border border-teal/30 bg-teal-soft px-5 py-4 text-sm font-medium text-teal">
            Group created — you&apos;re the first member. Share the link below;{" "}
            {needed > 0
              ? `${needed} more ${needed === 1 ? "person needs" : "people need"} to join`
              : "you have enough members"}{" "}
            before coaches can see it.
          </div>
        )}

        <header className="cf-card p-7">
          <p className="cf-eyebrow">Group</p>
          <h1 className="cf-display mt-2 text-3xl text-ink">{invite.service_name}</h1>
          <p className="mt-2 text-muted">
            {invite.society_name ? `${invite.society_name} · ` : ""}
            {invite.area_name}, {invite.city_name}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`cf-badge ${needed === 0 ? "cf-badge-ok" : "cf-badge-warn"}`}>
              {activationLabel(invite.member_count)}
            </span>
            <span className="cf-badge cf-badge-neutral">{invite.student_count} students</span>
            <span className={`cf-badge ${invite.is_open ? "cf-badge-neutral" : "cf-badge-danger"}`}>
              {invite.is_open ? expiryLabel(invite.expires_at) : "Closed"}
            </span>
          </div>
        </header>

        <GroupTabs groupId={id} active={tab} unread={unread} threadCount={threads.length} />

        {tab === "messages" ? (
          <GroupMessages
            threads={threads}
            me={me}
            activeId={activeThread}
            isCreator={isCreator}
            needed={needed}
            onSelect={(t) => go({ tab: "messages", t })}
            onChanged={load}
          />
        ) : (
          <GroupOverview
            invite={invite}
            isCreator={isCreator}
            signedIn={Boolean(me)}
            canJoin={canJoin}
            pendingCount={pending}
            onChanged={load}
            onOpenMessages={() => go({ tab: "messages", t: null })}
          />
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
