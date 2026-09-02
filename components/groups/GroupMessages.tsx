"use client";

import {
  GroupThread as Thread,
  MEMBERS_TO_ACTIVATE,
  inboxTime,
  threadPreview,
} from "@/lib/groups";
import GroupThreadPane from "./GroupThread";

type Props = {
  threads: Thread[];
  me: string | null;
  activeId: string | null;
  isCreator: boolean;
  /** Members still needed before coaches can see the group at all. */
  needed: number;
  onSelect: (requestId: string | null) => void;
  onChanged: () => void;
};

/**
 * Every coach in one place. The old design gave each conversation its own page
 * reachable only from a button on the group, so four coaches meant four
 * buttons and no screen that showed all four at once.
 */
export default function GroupMessages({
  threads,
  me,
  activeId,
  isCreator,
  needed,
  onSelect,
  onChanged,
}: Props) {
  const active = threads.find((t) => t.request_id === activeId) ?? null;

  if (threads.length === 0) {
    return (
      <section className="cf-card p-8 text-center">
        <p className="text-ink">
          {isCreator ? "No coaches have got in touch yet." : "No conversation here yet."}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {isCreator
            ? needed > 0
              ? `Your group reaches coaches once it has ${MEMBERS_TO_ACTIVATE} members — ${needed} more to go. Share the link from the Overview tab.`
              : "Coaches in your area who teach this can see the group now. When one writes in, their message lands here."
            : "Send this group a message from your dashboard and it will appear here."}
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      {/* The list steps aside on a phone once a conversation is open. */}
      <div className={active ? "hidden lg:block" : "block"}>
        <ul className="cf-card divide-y divide-line p-0">
          {threads.map((t) => {
            const isActive = t.request_id === activeId;
            return (
              <li key={t.request_id}>
                <button
                  onClick={() => onSelect(t.request_id)}
                  className={`flex w-full gap-3 px-4 py-4 text-left transition ${
                    isActive ? "bg-surface-3" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 text-sm font-semibold text-muted">
                    {t.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.photo_url}
                        alt=""
                        className="size-full object-cover"
                      />
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

                    {t.subtitle && (
                      <span className="mt-0.5 block truncate text-[0.7rem] text-faint">
                        {t.subtitle}
                      </span>
                    )}

                    <span
                      className={`mt-1 block truncate text-xs ${
                        t.unread ? "text-ink" : "text-muted"
                      }`}
                    >
                      {threadPreview(t, me)}
                    </span>

                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {t.status === "pending" && (
                        <span className="cf-badge cf-badge-warn">
                          {t.is_creator ? "Awaiting your reply" : "Sent"}
                        </span>
                      )}
                      {t.status === "declined" && (
                        <span className="cf-badge cf-badge-neutral">Declined</span>
                      )}
                      {t.unread && <span className="size-2 rounded-full bg-coral" />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={active ? "block" : "hidden lg:block"}>
        {active ? (
          <GroupThreadPane
            key={active.request_id}
            thread={active}
            me={me}
            onChanged={onChanged}
            onBack={() => onSelect(null)}
          />
        ) : (
          <section className="cf-card flex min-h-[28rem] items-center justify-center p-8 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              {isCreator
                ? "Pick a coach on the left to read what they said and reply."
                : "Pick a conversation on the left to read it and reply."}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
