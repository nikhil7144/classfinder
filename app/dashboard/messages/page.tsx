"use client";

import { Suspense } from "react";
import ProviderTabs from "@/components/provider/ProviderTabs";
import ThreadInbox from "@/components/threads/ThreadInbox";

export default function ProviderMessagesPage() {
  return (
    <div className="min-h-screen bg-bg py-10">
      <div className="mx-auto max-w-5xl space-y-5 px-6">
        <ProviderTabs />

        <header className="cf-card p-7">
          <p className="cf-eyebrow">Messages</p>
          <h1 className="cf-display mt-2 text-2xl text-ink">Your conversations</h1>
          <p className="mt-2 text-sm text-muted">
            Groups you pitched, and parents who found you and wrote directly.
          </p>
        </header>

        {/* Suspense because the inbox reads ?thread= from the URL, which a
            notification link sets. */}
        <Suspense fallback={<div className="cf-card h-96 animate-pulse p-8" />}>
          <ThreadInbox
            emptyTitle="Nobody has written to you yet."
            emptyBody="Parents can message you from your profile once your listing is approved, and you can pitch groups looking for what you teach from the Groups tab."
          />
        </Suspense>
      </div>
    </div>
  );
}
