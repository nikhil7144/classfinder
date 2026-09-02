"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Thread, inboxTime, threadPreview } from "@/lib/threads";
import ThreadPane from "./ThreadPane";

type Props = {
  /** What to say when there is nothing here yet — it differs by role. */
  emptyTitle: string;
  emptyBody: string;
};

/**
 * Every conversation this person is in, group and direct together.
 *
 * Groups gave each group its own inbox, which was right while a group was the
 * only way to talk to anyone. Once a parent can also write to a coach
 * directly, per-object inboxes mean checking three places for one answer.
 */
export default function ThreadInbox({ emptyTitle, emptyBody }: Props) {
  const params = useSearchParams();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  // Read once, as the opening selection. Notification mail links straight at a
  // conversation, and landing someone on an inbox to hunt for the message they
  // were just told about is most of the way to not having sent it.
  const [activeId, setActiveId] = useState<string | null>(params.get("thread"));

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_threads");
    setThreads((data as Thread[]) || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      await load();
    })();
  }, [load]);

  if (threads === null) {
    return <div className="cf-card h-96 animate-pulse p-8" />;
  }

  if (threads.length === 0) {
    return (
      <section className="cf-card p-8 text-center">
        <p className="text-ink">{emptyTitle}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{emptyBody}</p>
      </section>
    );
  }

  const active = threads.find((t) => t.thread_id === activeId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      {/* The list steps aside on a phone once a conversation is open. */}
      <div className={active ? "hidden lg:block" : "block"}>
        <ul className="cf-card divide-y divide-line p-0">
          {threads.map((t) => (
            <li key={t.thread_id}>
              <button
                onClick={() => setActiveId(t.thread_id)}
                className={`flex w-full gap-3 px-4 py-4 text-left transition ${
                  t.thread_id === activeId ? "bg-surface-3" : "hover:bg-surface-2"
                }`}
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 text-sm font-semibold text-muted">
                  {t.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photo_url} alt="" className="size-full object-cover" />
                  ) : (
                    (t.title || "?").charAt(0).toUpperCase()
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        t.unread ? "font-semibold text-ink" : "text-ink"
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                      {inboxTime(t.last_message_at ?? t.created_at)}
                    </span>
                  </span>

                  <span className="mt-0.5 block truncate text-[0.7rem] text-faint">
                    {t.subtitle}
                  </span>

                  <span
                    className={`mt-1 block truncate text-xs ${
                      t.unread ? "text-ink" : "text-muted"
                    }`}
                  >
                    {threadPreview(t, me)}
                  </span>

                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    {/* Where it came from. A coach in particular needs to know
                        whether they are talking to one family or a society. */}
                    <span className="cf-badge cf-badge-neutral">
                      {t.kind === "group" ? "Group" : "Direct"}
                    </span>
                    {t.kind === "group" && t.status === "pending" && (
                      <span className="cf-badge cf-badge-warn">
                        {t.i_am_seeker ? "Awaiting your reply" : "Sent"}
                      </span>
                    )}
                    {t.status === "declined" && (
                      <span className="cf-badge cf-badge-neutral">Closed</span>
                    )}
                    {t.unread && <span className="size-2 rounded-full bg-coral" />}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={active ? "block" : "hidden lg:block"}>
        {active ? (
          <ThreadPane
            key={active.thread_id}
            thread={active}
            me={me}
            onChanged={load}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <section className="cf-card flex min-h-[28rem] items-center justify-center p-8 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Pick a conversation on the left to read it and reply.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
