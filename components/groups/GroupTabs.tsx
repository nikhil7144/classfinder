"use client";

import Link from "next/link";

export type GroupTabKey = "overview" | "messages" | "posts";

type Props = {
  groupId: string;
  active: GroupTabKey;
  /** Conversations with something new in them. Hidden when zero. */
  unread?: number;
  /** Total conversations, so an empty inbox still reads as empty rather than absent. */
  threadCount?: number;
};

/**
 * A group is a place, not a form — it has members, coaches writing in, and
 * later the photos those classes produce. The tabs live in the URL so a
 * conversation stays linkable and the back button behaves.
 */
export default function GroupTabs({ groupId, active, unread = 0, threadCount = 0 }: Props) {
  const tabs: { key: GroupTabKey; label: string; href: string; badge?: number; soon?: boolean }[] = [
    { key: "overview", label: "Overview", href: `/groups/${groupId}` },
    {
      key: "messages",
      label: "Messages",
      href: `/groups/${groupId}?tab=messages`,
      badge: unread || undefined,
    },
    { key: "posts", label: "Posts", href: `/groups/${groupId}?tab=posts`, soon: true },
  ];

  return (
    <nav className="flex flex-wrap gap-2 border-b border-line pb-3">
      {tabs.map((tab) => {
        if (tab.soon) {
          return (
            <span
              key={tab.key}
              className="cursor-not-allowed rounded-full px-4 py-2 text-sm text-faint"
              title="Coming in a later release"
            >
              {tab.label}
              <span className="ml-1.5 text-[0.7rem] opacity-70">soon</span>
            </span>
          );
        }

        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`rounded-full px-4 py-2 text-sm transition ${
              isActive
                ? "bg-surface-3 font-semibold text-ink"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.badge ? (
              <span className="ml-2 rounded-full bg-accent-ink px-1.5 py-0.5 text-[0.7rem] font-bold text-[#1a0d06]">
                {tab.badge}
              </span>
            ) : tab.key === "messages" && threadCount > 0 ? (
              <span className="ml-2 text-[0.7rem] text-faint">{threadCount}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
