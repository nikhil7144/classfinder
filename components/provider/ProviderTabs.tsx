"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; badge?: number; soon?: boolean };

/**
 * The provider dashboard is more than a listing status — Groups is where
 * demand arrives, and Spaces and Events land here as those phases ship.
 * Unbuilt tabs are shown greyed rather than hidden, so a coach can see what
 * the account will do rather than wondering if they've missed it.
 */
export default function ProviderTabs({ groupCount = 0 }: { groupCount?: number }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/groups", label: "Groups", badge: groupCount },
    { href: "/dashboard/space", label: "My Space", soon: true },
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
