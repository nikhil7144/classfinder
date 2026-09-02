"use client";

import { Suspense } from "react";
import ThreadInbox from "@/components/threads/ThreadInbox";

export default function SeekerMessagesPage() {
  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Messages</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">Your conversations</h1>
        <p className="mt-2 text-sm text-muted">
          Coaches who wrote to your groups, and coaches you wrote to yourself.
        </p>
      </header>

      {/* Suspense because the inbox reads ?thread= from the URL, which a
          notification link sets. */}
      <Suspense fallback={<div className="cf-card h-96 animate-pulse p-8" />}>
        <ThreadInbox
          emptyTitle="No conversations yet."
          emptyBody="Find a coach and ask them a question, or start a group and let coaches come to you."
        />
      </Suspense>
    </div>
  );
}
