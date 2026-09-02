"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MyGroup, activationLabel, expiryLabel } from "@/lib/groups";

export default function MyGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // A group is parent demand, so this screen has nothing for a coach — it
      // would show them an empty list and offer to start one. The account nav
      // already hides it from them; this catches the direct link, which is how
      // a coach following "all my groups" from a pitch used to arrive here.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user.id)
          .maybeSingle();

        if (profile?.role === "provider") {
          router.replace("/students");
          return;
        }
      }

      // my_groups() counts members itself: RLS limits what a member can read
      // from group_members, so counting client-side would under-report.
      const { data } = await supabase.rpc("my_groups");
      setGroups((data as MyGroup[]) || []);
      setLoading(false);
    };
    load();
  }, [router]);

  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="cf-eyebrow">Groups</p>
            <h1 className="cf-display mt-2 text-2xl text-ink">Your groups</h1>
            <p className="mt-2 text-sm text-muted">
              Get neighbours together and let coaches come to you.
            </p>
          </div>
          <Link href="/groups/new" className="cf-btn-primary shrink-0">
            Start a group
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="cf-card p-8 text-sm text-muted">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="cf-card p-8 text-center">
          <p className="text-ink">You&apos;re not in any groups yet.</p>
          <p className="mt-2 text-sm text-muted">
            Looking for the same class as neighbours? Start a group and share the link — coaches
            reach out to you instead.
          </p>
          <Link href="/groups/new" className="cf-btn-primary mt-6">
            Start a group
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const closed = Boolean(g.closed_at) || new Date(g.expires_at) < new Date();
            return (
              <Link
                key={g.id}
                // Coaches waiting is the reason they opened this list — land on
                // the conversations rather than making them find the tab.
                href={
                  g.is_creator && Number(g.pending_requests) > 0
                    ? `/groups/${g.id}?tab=messages`
                    : `/groups/${g.id}`
                }
                className="cf-card block p-5 transition hover:border-faint"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="cf-display text-lg text-ink">{g.service_name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {g.society_name} · {g.area_name}
                    </p>
                  </div>
                  {g.is_creator && Number(g.pending_requests) > 0 && (
                    <span className="cf-badge cf-badge-warn shrink-0">
                      {g.pending_requests} new {Number(g.pending_requests) === 1 ? "coach" : "coaches"}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`cf-badge ${g.is_active ? "cf-badge-ok" : "cf-badge-warn"}`}>
                    {closed ? "Closed" : activationLabel(Number(g.member_count))}
                  </span>
                  <span className="cf-badge cf-badge-neutral">
                    {g.member_count} member{Number(g.member_count) === 1 ? "" : "s"}
                  </span>
                  {!closed && (
                    <span className="cf-badge cf-badge-neutral">{expiryLabel(g.expires_at)}</span>
                  )}
                  {g.is_creator && (
                    <span className="cf-badge cf-badge-neutral">You started this</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
