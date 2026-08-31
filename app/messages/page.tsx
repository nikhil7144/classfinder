"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type MessageRow = {
  id: string;
  association_id: string;
  sender_id: string | null;
  message: string;
  created_at: string;
  pending?: boolean;
};

type AssociationSummary = {
  id: string;
  startups?: {
    startup_name?: string | null;
    logo_url?: string | null;
  } | null;
  veterans?: {
    name?: string | null;
    photo_url?: string | null;
  } | null;
  messages?: {
    message?: string | null;
    created_at?: string | null;
  }[] | null;
  lastMessage?: {
    message?: string | null;
    created_at?: string | null;
  } | null;
};

function normalizeTimestamp(value: string) {
  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(value);
  return hasTimezone ? value : `${value}Z`;
}

function formatTime(value?: string | null) {
  if (!value) return "";

  return new Date(normalizeTimestamp(value)).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default function MessagesPage() {
  const [associations, setAssociations] = useState<AssociationSummary[]>([]);
  const [selected, setSelected] = useState<AssociationSummary | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedName =
    selected?.startups?.startup_name || selected?.veterans?.name || "Conversation";
  const selectedAvatar =
    selected?.startups?.logo_url || selected?.veterans?.photo_url || "/placeholder-logo.png";

  const pendingCount = useMemo(
    () => messages.filter((message) => message.pending).length,
    [messages]
  );

  const scrollBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      setLoadingAssociations(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        setLoadingAssociations(false);
        return;
      }

      if (isActive) {
        setProfileId(user.id);
      }

      const [{ data: veteran }, { data: startup }] = await Promise.all([
        supabase.from("veterans").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("startups").select("id").eq("user_id", user.id).maybeSingle(),
      ]);

      let data: AssociationSummary[] = [];

      if (veteran?.id) {
        const res = await supabase
          .from("associations")
          .select(
            `
              id,
              startups(startup_name,logo_url),
              messages(message,created_at)
            `
          )
          .eq("veteran_id", veteran.id);

        data = (res.data as AssociationSummary[] | null) || [];
      }

      if (startup?.id) {
        const res = await supabase
          .from("associations")
          .select(
            `
              id,
              veterans(name,photo_url),
              messages(message,created_at)
            `
          )
          .eq("startup_id", startup.id);

        data = (res.data as AssociationSummary[] | null) || [];
      }

      const enriched = data.map((association) => {
        const lastMessage = association.messages?.length
          ? association.messages[association.messages.length - 1]
          : null;

        return {
          ...association,
          lastMessage,
        };
      });

      if (!isActive) return;

      setAssociations(enriched);
      if (enriched.length > 0) {
        setSelected(enriched[0]);
      }
      setLoadingAssociations(false);
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected?.id) return;

    let isActive = true;

    const loadMessages = async () => {
      setLoadingMessages(true);

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("association_id", selected.id)
        .order("created_at", { ascending: true });

      if (!isActive) return;

      setMessages((data as MessageRow[] | null) || []);
      setLoadingMessages(false);
      requestAnimationFrame(() => scrollBottom("auto"));
    };

    loadMessages();

    const channel = supabase
      .channel(`messages:${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `association_id=eq.${selected.id}`,
        },
        (payload) => {
          const incoming = payload.new as MessageRow;

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

          setAssociations((prev) =>
            prev.map((association) =>
              association.id === selected.id
                ? {
                    ...association,
                    lastMessage: {
                      message: incoming.message,
                      created_at: incoming.created_at,
                    },
                  }
                : association
            )
          );

          requestAnimationFrame(() => scrollBottom());
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [selected?.id]);

  const sendMessage = async () => {
    const trimmedText = text.trim();

    if (!trimmedText || !selected?.id || !profileId || sending) return;

    const optimisticMessage: MessageRow = {
      id: `pending-${Date.now()}`,
      association_id: selected.id,
      sender_id: profileId,
      message: trimmedText,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setSending(true);
    setMessages((prev) => [...prev, optimisticMessage]);
    setAssociations((prev) =>
      prev.map((association) =>
        association.id === selected.id
          ? {
              ...association,
              lastMessage: {
                message: trimmedText,
                created_at: optimisticMessage.created_at,
              },
            }
          : association
      )
    );
    setText("");
    requestAnimationFrame(() => scrollBottom());

    const { data, error } = await supabase
      .from("messages")
      .insert({
        association_id: selected.id,
        sender_id: profileId,
        message: trimmedText,
      })
      .select("*")
      .single<MessageRow>();

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

    setAssociations((prev) =>
      prev.map((association) =>
        association.id === selected.id
          ? {
              ...association,
              lastMessage: {
                message: data.message,
                created_at: data.created_at,
              },
            }
          : association
      )
    );

    setSending(false);
    requestAnimationFrame(() => scrollBottom());
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_18px_45px_rgba(79,70,229,0.12)] backdrop-blur-xl sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.12),_transparent_28%)]" />
            <div className="relative z-10">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                Conversation Hub
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Messages
              </h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600">
                Manage active association conversations with a faster, cleaner inbox and instant
                message updates.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid lg:h-[78vh] lg:grid-cols-[320px_1fr]">
            <div className="border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-base font-semibold text-slate-900">Chats</div>
                <div className="text-xs font-medium text-slate-500">
                  {associations.length} active
                </div>
              </div>

              {loadingAssociations ? (
                <div className="text-sm text-slate-500">Loading conversations...</div>
              ) : associations.length === 0 ? (
                <div className="text-sm text-slate-500">No conversations found.</div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                  {associations.map((association) => {
                    const name =
                      association.startups?.startup_name || association.veterans?.name || "Chat";
                    const avatar =
                      association.startups?.logo_url ||
                      association.veterans?.photo_url ||
                      "/placeholder-logo.png";

                    return (
                      <button
                        key={association.id}
                        type="button"
                        onClick={() => setSelected(association)}
                        className="flex w-20 shrink-0 flex-col items-center gap-2 text-center"
                      >
                        <div
                          className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-white transition ${
                            selected?.id === association.id
                              ? "border-indigo-500 ring-4 ring-indigo-100"
                              : "border-slate-200"
                          }`}
                        >
                          <img
                            src={avatar}
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <span
                          className={`line-clamp-2 text-xs font-medium leading-4 ${
                            selected?.id === association.id
                              ? "text-indigo-700"
                              : "text-slate-600"
                          }`}
                        >
                          {name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden border-b border-slate-200 bg-white lg:block lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <div className="text-lg font-semibold text-slate-900">Chats</div>
                <div className="mt-1 text-sm text-slate-500">
                  {associations.length} active conversation{associations.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto lg:max-h-none lg:h-[calc(78vh-89px)]">
                {loadingAssociations ? (
                  <div className="p-6 text-sm text-slate-500">Loading conversations...</div>
                ) : associations.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">No conversations found.</div>
                ) : (
                  associations.map((association) => {
                    const name =
                      association.startups?.startup_name || association.veterans?.name || "Chat";
                    const avatar =
                      association.startups?.logo_url ||
                      association.veterans?.photo_url ||
                      "/placeholder-logo.png";

                    return (
                      <button
                        key={association.id}
                        type="button"
                        onClick={() => setSelected(association)}
                        className={`mx-3 my-2 flex w-[calc(100%-24px)] items-center gap-3 rounded-2xl px-4 py-4 text-left transition ${
                          selected?.id === association.id
                            ? "bg-indigo-50 ring-1 ring-indigo-100"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <img
                          src={avatar}
                          alt={name}
                          className="h-11 w-11 rounded-2xl border border-slate-200 object-cover bg-white"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-800">{name}</div>
                          <div className="truncate text-sm text-slate-500">
                            {association.lastMessage?.message || "Start conversation"}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex h-[calc(100dvh-18rem)] min-h-[420px] flex-col bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] sm:h-[calc(100dvh-19rem)] lg:min-h-[480px] lg:h-auto">
              {!selected ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-slate-500">
                  Select a conversation to start chatting
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 sm:px-6">
                    <img
                      src={selectedAvatar}
                      alt={selectedName}
                      className="h-11 w-11 rounded-2xl border border-slate-200 object-cover bg-white"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold text-slate-900">
                        {selectedName}
                      </div>
                      <div className="text-sm text-slate-500">Active association conversation</div>
                    </div>

                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                      {pendingCount > 0 ? `${pendingCount} sending` : "Live"}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                    {loadingMessages ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        Loading messages...
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
                        placeholder="Write your message and press Enter..."
                        className="min-w-0 flex-1 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
                        disabled={sending || !profileId}
                      />

                      <button
                        type="submit"
                        disabled={sending || !text.trim() || !selected || !profileId}
                        className="inline-flex items-center justify-center rounded-[1.4rem] bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
