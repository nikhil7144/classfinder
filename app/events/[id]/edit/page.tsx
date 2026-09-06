"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchMyEvent } from "@/lib/api/my-events";
import type { Event } from "@/lib/api/events";
import EventForm from "@/components/events/EventForm";
import CategoryEditor from "@/components/events/CategoryEditor";
import PublishPanel from "@/components/events/PublishPanel";

type Props = { params: Promise<{ id: string }> };

/**
 * The owner's screen for one event: its details, its categories, and whether
 * it is live.
 *
 * The three panels share one `event` in state and each hands back what the
 * API returned, so publishing after editing the title does not publish the
 * title the screen was showing before the save. The server's copy is always
 * the one on screen.
 */
export default function EditEventPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const result = await fetchMyEvent(id);
      if (!alive) return;

      if (result.error || !result.event) {
        // A draft that is not yours is a 404 from the API, deliberately, so
        // this cannot tell the two apart either — and should not.
        setError(result.error ?? "No such event.");
      } else {
        setEvent(result.event);
      }
      setLoading(false);
    };

    load();
    return () => {
      alive = false;
    };
  }, [id, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
        <p className="cf-card p-7 text-sm text-muted">{error}</p>
        <Link href="/dashboard" className="cf-btn-ghost">
          Back to your dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-10">
      <Link href="/dashboard" className="cf-eyebrow text-faint hover:text-muted">
        ← Dashboard
      </Link>

      <header className="cf-card p-7">
        <p className="cf-eyebrow">Editing</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">{event.title}</h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="cf-card p-7">
            <h2 className="cf-eyebrow">Details</h2>
            <div className="mt-5">
              <EventForm event={event} onSaved={setEvent} />
            </div>
          </section>

          <section className="cf-card p-7">
            <h2 className="cf-eyebrow">Categories</h2>
            <div className="mt-5">
              <CategoryEditor event={event} onSaved={setEvent} />
            </div>
          </section>
        </div>

        <PublishPanel event={event} onChanged={setEvent} />
      </div>
    </main>
  );
}
