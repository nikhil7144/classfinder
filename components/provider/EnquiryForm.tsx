"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { withNext } from "@/lib/next-path";

type Service = { id: string; name: string; group: string };

type Props = {
  providerId: string;
  providerName: string;
  services: Service[];
};

const MIN_MESSAGE = 10;

type Gate =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "incomplete" }
  | { state: "provider" }
  | { state: "existing" }
  | { state: "ready" };

/**
 * The end of the search path.
 *
 * Every provider page used to finish with "messaging and booking arrive in a
 * later release", so a parent who found exactly the right coach could do
 * nothing about it. This is the button that was missing.
 *
 * Unlike a coach pitching a group, no minimum essay is demanded here: "do you
 * teach 8-year-olds on Saturdays?" is a real enquiry, and the coach is
 * already approved.
 */
export default function EnquiryForm({ providerId, providerName, services }: Props) {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const [me, setMe] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [sharePhone, setSharePhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setGate({ state: "guest" });
        return;
      }
      setMe(auth.user.id);

      const [{ data: profile }, { data: existing }] = await Promise.all([
        supabase
          .from("profiles")
          .select("role, profile_complete")
          .eq("id", auth.user.id)
          .maybeSingle(),
        // The same rule the partial unique index enforces, said before they
        // write rather than as a constraint violation afterwards.
        supabase
          .from("enquiries")
          .select("id")
          .eq("provider_id", providerId)
          .eq("seeker_id", auth.user.id)
          .neq("status", "declined")
          .maybeSingle(),
      ]);

      if (existing) return setGate({ state: "existing" });
      if (profile?.role !== "seeker") return setGate({ state: "provider" });
      if (!profile?.profile_complete) return setGate({ state: "incomplete" });
      setGate({ state: "ready" });
    })();
  }, [providerId]);

  const send = async () => {
    const body = message.trim();
    if (body.length < MIN_MESSAGE) return;

    setBusy(true);
    setError("");
    const { error: sendError } = await supabase.from("enquiries").insert({
      seeker_id: me,
      provider_id: providerId,
      service_category_id: serviceId || null,
      message: body,
      show_phone: sharePhone,
    });
    setBusy(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setSent(true);
  };

  if (gate.state === "loading") {
    return <section className="cf-card h-40 animate-pulse p-7" />;
  }

  if (sent || gate.state === "existing") {
    return (
      <section className="cf-card p-7 text-center">
        <p className="text-ink">
          {sent ? `Sent to ${providerName}.` : `You've already written to ${providerName}.`}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Their reply lands in your messages, and you can arrange a first class there once you
          have agreed a day.
        </p>
        <Link href="/account/messages" className="cf-btn-primary mt-6">
          Go to messages
        </Link>
      </section>
    );
  }

  if (gate.state === "guest" || gate.state === "incomplete") {
    return (
      <section className="cf-card p-7 text-center">
        <p className="text-ink">Message {providerName}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {gate.state === "guest"
            ? "Sign in as a parent or student to ask about classes, fees and timings."
            : "Finish your profile first — coaches need to know who they're talking to."}
        </p>
        <Link
          href={withNext(
            gate.state === "guest" ? "/login" : "/complete-profile/seeker",
            `/provider/${providerId}`
          )}
          className="cf-btn-primary mt-6"
        >
          {gate.state === "guest" ? "Sign in" : "Complete profile"}
        </Link>
      </section>
    );
  }

  if (gate.state === "provider") {
    return (
      <section className="cf-card p-7 text-center">
        <p className="text-sm text-muted">
          You&apos;re signed in as a coach, so this is how parents will see your listing.
        </p>
      </section>
    );
  }

  return (
    <section className="cf-card p-7">
      <p className="cf-eyebrow">Get in touch</p>
      <h2 className="cf-display mt-2 text-lg text-ink">Message {providerName}</h2>
      <p className="mt-2 text-sm text-muted">
        Ask about timings, fees, or whether they take children your child&apos;s age.
      </p>

      {services.length > 0 && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm text-muted">What is this about? (optional)</span>
          <select
            className="cf-input"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            <option value="">Just a general question</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-4 block">
        <span className="mb-2 block text-sm text-muted">Your message</span>
        <textarea
          className="cf-input min-h-28"
          placeholder="My daughter is 9 and has never played before — do you take beginners on weekends?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
        />
      </label>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={sharePhone}
          onChange={(e) => setSharePhone(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-semibold text-ink">Let this coach call me</span>
          <span className="mt-1 block text-muted">
            Shares your number with {providerName} only. You can change this later, and messaging
            here works either way.
          </span>
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button
        onClick={send}
        disabled={busy || message.trim().length < MIN_MESSAGE}
        className="cf-btn-primary mt-5"
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </section>
  );
}
