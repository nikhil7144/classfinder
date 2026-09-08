"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EventForm from "@/components/events/EventForm";
import { eventOwnership } from "@/lib/api/my-events";

/**
 * Creating one.
 *
 * A client page rather than a server one because everything it does needs the
 * caller's token, and the API is the only thing that decides whose event this
 * becomes — the owner is read from the caller's own coach or company row, not
 * from anything this screen could send.
 *
 * That row is also why signed-in is not enough to open the form. A provider who
 * has not finished their listing has no row for an event to belong to, and the
 * service refuses the save. Checking only for a session let them fill in the
 * whole form — dates, categories, the lot — to be told at the end that they
 * were never eligible to start. Ask first, and say so before the typing.
 */
export default function NewEventPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState("");

  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const ownership = await eventOwnership();
      if (!active) return;

      if (ownership.state === "blocked") setBlocked(ownership.reason);
      setReady(true);
    };

    check();
    return () => {
      active = false;
    };
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
        {!ready ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : blocked ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-warn">{blocked}</p>
            {/* The dashboard, not a complete-profile path picked here: a coach
                and an event company finish different forms, and it already
                knows which one this is. */}
            <Link href="/dashboard" className="cf-btn-primary inline-block">
              Finish setting up
            </Link>
          </div>
        ) : (
          <EventForm />
        )}
      </section>
    </main>
  );
}
