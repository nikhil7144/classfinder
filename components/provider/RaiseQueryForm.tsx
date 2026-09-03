"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useContactGate } from "@/lib/contact-gate";
import { raiseQuery } from "@/lib/api/queries";

type Service = { id: string; name: string };

type Props = {
  providerId: string;
  providerName: string;
  services: Service[];
};

const field =
  "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-gold";

/**
 * "Call me" rather than "let's chat".
 *
 * The enquiry form below this one opens a conversation, which is the right
 * thing when a parent has a question. It is the wrong thing when they simply
 * want the coach to ring them — that parent had to start a chat to ask for a
 * call, and the coach then had twenty chats and no way to track which they had
 * actually rung.
 *
 * The number is required here and prefilled from the profile, because being
 * called is the entire point; a query without one is a request nobody can act
 * on. It is editable, so a parent can give a different number without
 * changing their account.
 */
export default function RaiseQueryForm({ providerId, providerName, services }: Props) {
  const { gate, refresh } = useContactGate({
    providerId,
    table: "queries",
    closedStatuses: ["completed", "closed"],
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Prefill from the profile once we know who they are. Functional updates so
  // a value the parent has already started editing is never clobbered.
  useEffect(() => {
    if (gate.state !== "ready") return;
    let alive = true;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const [{ data: profile }, { data: seeker }] = await Promise.all([
        supabase.from("profiles").select("phone").eq("id", auth.user.id).maybeSingle(),
        supabase.from("seekers").select("name").eq("user_id", auth.user.id).maybeSingle(),
      ]);
      if (!alive) return;

      setName((current) => current || seeker?.name || "");
      setPhone((current) => current || profile?.phone || "");
    })();

    return () => {
      alive = false;
    };
  }, [gate.state]);

  const submit = async () => {
    if (busy) return;
    setError("");

    if (name.trim().length < 2) return setError("Tell them what to call you.");
    if (phone.trim().length < 6) return setError("A number they can reach you on.");

    setBusy(true);
    const { error: sendError } = await raiseQuery({
      providerId,
      contactName: name.trim(),
      contactPhone: phone.trim(),
      ...(serviceId ? { serviceCategoryId: serviceId } : {}),
      ...(details.trim() ? { details: details.trim() } : {}),
    });
    setBusy(false);

    if (sendError) {
      setError(sendError);
      return;
    }
    setSent(true);
    refresh();
  };

  // A coach looking at another coach gets nothing, which is right. Everything
  // else says something — an absent form is the one outcome nobody can debug,
  // and it is how this shipped broken.
  if (gate.state === "provider") return null;

  if (gate.state === "loading") {
    return <section className="cf-card h-40 animate-pulse p-7" />;
  }

  if (gate.state === "error") {
    return (
      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">Ask {providerName} to call you</h2>
        <p className="mt-2 text-sm text-muted">
          Couldn&apos;t check whether you can right now. Refresh and try again.
        </p>
        <p className="mt-2 text-xs text-faint">{gate.reason}</p>
      </section>
    );
  }

  if (sent || gate.state === "existing") {
    return (
      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">
          {sent ? "Asked" : "You've already asked"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {providerName} has your number and has been told you&apos;d like a call. You&apos;ll see
          it in your account, and if they write instead it lands in your messages.
        </p>
        <Link href="/account/queries" className="cf-btn-ghost mt-5">
          See your requests
        </Link>
      </section>
    );
  }

  if (gate.state === "guest" || gate.state === "incomplete") {
    return (
      <section className="cf-card p-7">
        <h2 className="cf-display text-lg text-ink">Ask {providerName} to call you</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {gate.state === "guest"
            ? "Sign in and we'll pass on your number."
            : "Finish your profile first — a coach is being given your name and number."}
        </p>
        <Link
          href={gate.state === "guest" ? "/login" : "/complete-profile/seeker"}
          className="cf-btn-primary mt-5"
        >
          {gate.state === "guest" ? "Sign in" : "Complete profile"}
        </Link>
      </section>
    );
  }

  return (
    <section className="cf-card p-7">
      <h2 className="cf-display text-lg text-ink">Ask {providerName} to call you</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        No conversation to keep up with — they get your number and ring you. Use the message box
        below instead if you&apos;d rather ask something in writing first.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Your name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-muted">Phone number</span>
          <input
            className={field}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </label>
      </div>

      {services.length > 0 && (
        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-muted">What about? (optional)</span>
          <select className={field} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">Not sure yet</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-4 block">
        <span className="mb-2 block text-sm text-muted">Anything they should know? (optional)</span>
        <textarea
          className={`${field} min-h-24`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="My son is 9 and has never played before. Weekends work best."
        />
      </label>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button onClick={submit} disabled={busy} className="cf-btn-primary mt-5">
        {busy ? "Sending…" : "Ask them to call"}
      </button>

      <p className="mt-3 text-xs text-faint">
        Only {providerName} sees this. Your number is not shown on your public profile.
      </p>
    </section>
  );
}
