"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { GroupInvite } from "@/lib/groups";

type Message = { id: string; sender_id: string; body: string; created_at: string };
type Request = { id: string; group_id: string; provider_id: string; message: string; status: string };
type Contact = { phone: string | null; name: string | null; society_name: string | null; shared: boolean };

export default function GroupChatPage() {
  const { id, requestId } = useParams<{ id: string; requestId: string }>();
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const [group, setGroup] = useState<GroupInvite | null>(null);
  const [providerName, setProviderName] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/login");
      return;
    }
    setMe(auth.user.id);

    // RLS returns this only to the two participants, so an outsider simply
    // gets nothing rather than needing a check here.
    const { data: req } = await supabase
      .from("group_requests")
      .select("id, group_id, provider_id, message, status")
      .eq("id", requestId)
      .maybeSingle();

    if (!req) {
      setLoading(false);
      return;
    }
    setRequest(req as Request);

    const [{ data: inv }, { data: prov }, { data: msgs }, { data: contactData }] = await Promise.all([
      supabase.rpc("get_group_invite", { p_id: id }),
      supabase.rpc("get_provider_profile", { p_id: (req as Request).provider_id }),
      supabase
        .from("group_messages")
        .select("id, sender_id, body, created_at")
        .eq("request_id", requestId)
        .order("created_at"),
      // Returns the parent's details only to the accepted coach, and the phone
      // only if the parent opted in. Anyone else gets nothing.
      supabase.rpc("get_request_contact", { p_request_id: requestId }),
    ]);
    setContact((contactData as Contact | null) ?? null);

    setGroup(inv as GroupInvite | null);
    setProviderName((prov as { display_name?: string } | null)?.display_name || "The coach");
    setMessages((msgs as Message[]) || []);
    setLoading(false);
  }, [id, requestId, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError("");

    const { error: sendError } = await supabase
      .from("group_messages")
      .insert({ request_id: requestId, sender_id: me, body });

    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }

    setDraft("");
    load();
  };

  if (loading) return <div className="min-h-screen bg-bg" />;

  if (!request) {
    return (
      <main className="min-h-screen bg-bg">
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <div className="cf-card p-8">
            <p className="text-ink">This conversation isn&apos;t available.</p>
            <p className="mt-2 text-sm text-muted">
              You can only open conversations you&apos;re part of.
            </p>
            <Link href="/account/groups" className="cf-btn-ghost mt-6">
              My groups
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const notYetAccepted = request.status !== "accepted";

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-10">
        <Link href={`/groups/${id}`} className="text-sm text-muted transition hover:text-ink">
          ← Back to the group
        </Link>

        <header className="cf-card p-6">
          <p className="cf-eyebrow">Conversation</p>
          <h1 className="cf-display mt-2 text-2xl text-ink">{providerName}</h1>
          {group && (
            <p className="mt-1 text-sm text-muted">
              About {group.service_name} in {group.area_name}
            </p>
          )}
        </header>

        {notYetAccepted && (
          <div className="rounded-2xl border border-line bg-surface-2 px-5 py-4 text-sm text-muted">
            {request.status === "declined"
              ? "This request wasn't taken up, so the conversation is closed."
              : "Waiting for the group to reply. You'll be able to message once they accept."}
          </div>
        )}

        {contact && (
          <section className="cf-card p-6">
            <p className="cf-eyebrow">Who you&apos;re talking to</p>
            <p className="mt-2 text-ink">
              {contact.name || "The group"}
              {contact.society_name && (
                <span className="text-muted"> · {contact.society_name}</span>
              )}
            </p>
            {contact.shared && contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="cf-btn-ghost mt-4 inline-flex font-mono"
              >
                {contact.phone}
              </a>
            ) : (
              <p className="mt-3 text-sm text-faint">
                They haven&apos;t shared a number — message them here instead.
              </p>
            )}
          </section>
        )}

        <section className="cf-card p-6">
          {/* The pitch is the first message — it is what the parent judged. */}
          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <p className="cf-eyebrow">First message</p>
            <p className="mt-2 leading-relaxed text-muted">{request.message}</p>
          </div>

          <div className="mt-5 space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      mine
                        ? "bg-accent-ink text-[#1a0d06]"
                        : "border border-line bg-surface-2 text-ink"
                    }`}
                  >
                    {m.body}
                    <div
                      className={`mt-1 font-mono text-[0.65rem] ${mine ? "opacity-60" : "text-faint"}`}
                    >
                      {new Date(m.created_at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          {!notYetAccepted && (
            <div className="mt-5 flex gap-2">
              <input
                className="cf-input"
                placeholder="Write a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="cf-btn-primary shrink-0"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
