import Link from "next/link";
import type { DiscoverGroup } from "@/lib/api/client";

/**
 * Published groups, as a stranger sees them.
 *
 * No society name, no creator, no member names — the same list the coach view
 * withholds. Publishing a group showcases the class, not the families in it.
 */
export default function GroupList({
  groups,
  emptyNote,
}: {
  groups: DiscoverGroup[];
  emptyNote: string;
}) {
  if (groups.length === 0) {
    return (
      <p className="mt-10 text-sm leading-6 text-faint">
        {emptyNote} Groups start privately between neighbours, and one only appears here once
        the people in it choose to show it.
      </p>
    );
  }

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <Link
          key={g.id}
          href={`/groups/public/${g.id}`}
          className="cf-card block p-6 transition hover:border-faint"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-ink">
                {g.publicHeadline || g.serviceName || "Group class"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {g.areaName}
                {g.cityName ? ` · ${g.cityName}` : ""}
              </p>
            </div>

            {/* Teal is approved/verified and nothing else, so a coach being
                on board is the one thing that earns it here. */}
            {g.hasCoach && (
              <span className="cf-badge cf-badge-ok shrink-0">Has a coach</span>
            )}
          </div>

          {g.publicAbout && (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{g.publicAbout}</p>
          )}

          <p className="mt-4 text-sm text-faint">
            {g.memberCount} {g.memberCount === 1 ? "family" : "families"}
            {g.publicPostCount > 0 && (
              <>
                {" · "}
                {g.publicPostCount} {g.publicPostCount === 1 ? "update" : "updates"}
              </>
            )}
          </p>
        </Link>
      ))}
    </div>
  );
}
