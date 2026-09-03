"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; badge?: number; soon?: boolean };

/**
 * The provider dashboard is more than a listing status — Find students is
 * where demand arrives, and Spaces and Events land here as those phases ship.
 * Unbuilt tabs are shown greyed rather than hidden, so a coach can see what
 * the account will do rather than wondering if they've missed it.
 */
export default function ProviderTabs({
  studentCount = 0,
  messageCount = 0,
}: {
  studentCount?: number;
  messageCount?: number;
}) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/dashboard", label: "Overview" },
    // Groups used to be its own tab, showing half the demand on the platform;
    // phase2r folded it into one feed with the families who post alone.
    { href: "/students", label: "Find students", badge: studentCount },
    // Parents who found the listing and wrote directly, alongside the group
    // pitches — one inbox, because a coach does not sort their replies by
    // which feature produced them.
    // Before Messages on purpose: a parent who left a number is waiting on a
    // call, not on a reply, and that is the more perishable of the two.
    { href: "/dashboard/queries", label: "Queries" },
    { href: "/dashboard/messages", label: "Messages", badge: messageCount },
    { href: "/dashboard/space", label: "My Space" },
    { href: "/dashboard/events", label: "Events", soon: true },
  ];

  return (
    <nav className="flex flex-wrap gap-2 border-b border-line pb-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href;

        if (tab.soon) {
          return (
            <span
              key={tab.href}
              className="cursor-not-allowed rounded-full px-4 py-2 text-sm text-faint"
              title="Coming in a later release"
            >
              {tab.label}
              <span className="ml-1.5 text-[0.7rem] opacity-70">soon</span>
            </span>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active ? "bg-surface-3 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {tab.label}
            {Boolean(tab.badge) && (
              <span className="ml-2 rounded-full bg-accent-ink px-1.5 py-0.5 text-[0.7rem] font-bold text-[#1a0d06]">
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
