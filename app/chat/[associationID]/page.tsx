"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ChatMessage = {
  id: string;
  association_id: string;
  sender_id: string | null;
  message: string;
  created_at: string;
  pending?: boolean;
};

type RecipientCard = {
  name: string;
  avatar: string | null;
  subtitle: string;
};

type AssociationRecord = {
  startups?: {
    startup_name?: string | null;
    logo_url?: string | null;
  } | null;
  veterans?: {
    name?: string | null;
    photo_url?: string | null;
  } | null;
};

function normalizeTimestamp(value: string) {
  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(value);
  return hasTimezone ? value : `${value}Z`;
}

function formatTime(value: string) {
  return new Date(normalizeTimestamp(value)).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default function ChatPage() {
  const params = useParams();
  const associationId = params.associationID as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<RecipientCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const pendingCount = useMemo(
    () => messages.filter((message) => message.pending).length,
    [messages]
  );

  const scrollBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!associationId) return;

    let isActive = true;

    const bootstrap = async () => {
      setLoading(true);

      const [{ data: userData }, recipientResult, messageResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("associations")
          .select(
            `
              startups(startup_name,logo_url),
              veterans(name,photo_url)
            `
          )
          .eq("id", associationId)
          .maybeSingle<AssociationRecord>(),
        supabase
          .from("messages")
          .select("*")
          .eq("association_id", associationId)
          .order("created_at", { ascending: true }),
      ]);

      if (!isActive) return;

      setProfileId(userData.user?.id || null);
      setMessages(((messageResult.data as ChatMessage[] | null) || []).filter(Boolean));

      const userId = userData.user?.id || null;
      let resolvedViewerRole: "startup" | "veteran" | null = null;

      if (userId) {
        const [{ data: veteran }, { data: startup }] = await Promise.all([
          supabase.from("veterans").select("id").eq("user_id", userId).maybeSingle(),
          supabase.from("startups").select("id").eq("user_id", userId).maybeSingle(),
        ]);

        if (startup?.id) resolvedViewerRole = "startup";
        if (veteran?.id) resolvedViewerRole = "veteran";
      }

      if (resolvedViewerRole === "startup" && recipientResult.data?.veterans) {
        setRecipient({
          name: recipientResult.data.veterans.name || "Industry expert",
          avatar: recipientResult.data.veterans.photo_url || null,
          subtitle: "Industry expert conversation",
        });
      } else if (resolvedViewerRole === "veteran" && recipientResult.data?.startups) {
        setRecipient({
          name: recipientResult.data.startups.startup_name || "Startup",
          avatar: recipientResult.data.startups.logo_url || null,
          subtitle: "Startup conversation",
        });
      } else if (recipientResult.data?.veterans) {
        setRecipient({
          name: recipientResult.data.veterans.name || "Industry expert",
          avatar: recipientResult.data.veterans.photo_url || null,
          subtitle: "Industry expert conversation",
        });
      } else {
        setRecipient({
          name: "Association chat",
          avatar: null,
          subtitle: "Direct conversation",
        });
      }

      setLoading(false);
      requestAnimationFrame(() => scrollBottom("auto"));
    };

    bootstrap();

    const channel = supabase
      .channel(`chat:${associationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `association_id=eq.${associationId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;

          setMessages((prev) => {
            const withoutPendingDuplicate = prev.filter(
              (message) =>
                !(
                  message.pending &&
                  message.sender_id === incoming.sender_id &&
                  message.message === incoming.message
                )
            );

            if (withoutPendingDuplicate.some((message) => message.id === incoming.id)) {
              return withoutPendingDuplicate;
            }

            return [...withoutPendingDuplicate, incoming];
          });

          requestAnimationFrame(() => scrollBottom());
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [associationId]);

  const sendMessage = async () => {
    const trimmedText = text.trim();

    if (!trimmedText || !profileId || sending) return;

    const optimisticMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      association_id: associationId,
      sender_id: profileId,
      message: trimmedText,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setSending(true);
    setMessages((prev) => [...prev, optimisticMessage]);
    setText("");
    requestAnimationFrame(() => scrollBottom());

    const { data, error } = await supabase
      .from("messages")
      .insert({
        association_id: associationId,
        sender_id: profileId,
        message: trimmedText,
      })
      .select("*")
      .single<ChatMessage>();

    if (error || !data) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticMessage.id));
      setText(trimmedText);
      setSending(false);
      alert(error?.message || "Unable to send message.");
      return;
    }

    setMessages((prev) => {
      const withoutPending = prev.filter((message) => message.id !== optimisticMessage.id);

      if (withoutPending.some((message) => message.id === data.id)) {
        return withoutPending;
      }

      return [...withoutPending, data];
    });

    setSending(false);
    requestAnimationFrame(() => scrollBottom());
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] py-8 sm:py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_18px_45px_rgba(79,70,229,0.12)] backdrop-blur-xl sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.12),_transparent_28%)]" />
            <div className="relative z-10">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                Direct Conversation
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Association Chat
              </h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600">
                A faster conversation view with realtime updates, instant sends, and a cleaner
                message composer.
              </p>
            </div>
          </div>

          <div className="flex h-[76vh] min-h-[560px] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex items-center gap-4 border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.94),_rgba(238,242,255,0.94))] px-5 py-4 sm:px-6">
              <img
                src={recipient?.avatar || "/placeholder-logo.png"}
                alt={recipient?.name || "Recipient"}
                className="h-12 w-12 rounded-2xl border border-slate-200 object-cover bg-white"
              />

              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-slate-900">
                  {recipient?.name || "Loading..."}
                </div>
                <div className="text-sm text-slate-500">
                  {recipient?.subtitle || "Association conversation"}
                </div>
              </div>

              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {pendingCount > 0 ? `${pendingCount} sending` : "Live"}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-4 py-5 sm:px-6">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Loading conversation...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm leading-6 text-slate-500">
                    No messages yet. Start the conversation here.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const mine = message.sender_id === profileId;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 shadow-sm sm:max-w-[70%] ${
                            mine
                              ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-[0_16px_35px_rgba(79,70,229,0.22)]"
                              : "border border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                            {message.message}
                          </p>
                          <div
                            className={`mt-2 flex items-center justify-end gap-2 text-xs ${
                              mine ? "text-white/70" : "text-slate-400"
                            }`}
                          >
                            {message.pending && <span>Sending...</span>}
                            <span>{formatTime(message.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <form
              className="border-t border-slate-200 bg-white/95 p-4 sm:p-5"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
            >
              <div className="flex items-end gap-3">
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-w-0 flex-1 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="Type message and press Enter..."
                  disabled={sending || !profileId}
                />

                <button
                  type="submit"
                  disabled={sending || !text.trim() || !profileId}
                  className="inline-flex items-center justify-center rounded-[1.4rem] bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
