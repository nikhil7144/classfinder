"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EventForm from "@/components/events/EventForm";

/**
 * Creating one.
 *
 * A client page rather than a server one because everything it does needs the
 * caller's token, and the API is the only thing that decides whose event this
 * becomes — the owner is read from the caller's own coach or company row, not
 * from anything this screen could send.
 */
export default function NewEventPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <Link href="/dashboard" className="cf-eyebrow text-faint hover:text-muted">
        ← Dashboard
      </Link>

      <header className="cf-card p-7">
        <p className="cf-eyebrow">New event</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">What are you running?</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This saves as a draft. You add the categories families enter, and publish it, on the next
          screen.
        </p>
      </header>

      <section className="cf-card p-7">
        {ready ? <EventForm /> : <p className="text-sm text-muted">Loading…</p>}
      </section>
    </main>
  );
}
