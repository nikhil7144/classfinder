"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { Event, EventCategory } from "@/lib/api/events";
import { enterEvent, type Entry } from "@/lib/api/my-entries";
import {
  cancelDeadline,
  entryState,
  formatAges,
  formatCapacity,
  formatDateTime,
  formatFee,
  formatWhen,
  isFull,
} from "@/lib/events";

type Props = { params: Promise<{ id: string; categoryId: string }> };

const field =
  "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block";

/**
 * Entering one category.
 *
 * Deliberately one category per screen rather than a form that also asks
 * which one: the reader has already chosen on the page before this, and
 * asking again is a chance to pick the wrong age group.
 *
 * Nothing here decides whether the entry is allowed. `enter_event` holds the
 * lock, counts the places, checks the age against the day of the event and
 * refuses in a sentence — this form's own checks exist only to save a round
 * trip on the obvious.
 */
export default function EnterEventPage({ params }: Props) {
  const { id, categoryId } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [participantName, setParticipantName] = useState("");
  const [participantDob, setParticipantDob] = useState("");
  const [members, setMembers] = useState<{ name: string; dob: string }[]>([]);
  // Unticked to start, always. An entry is the one place this product takes a
  // child's name and date of birth, and a box already ticked is not consent.
  const [consent, setConsent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Entry | null>(null);

  const category: EventCategory | undefined = event?.categories.find((c) => c.id === categoryId);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        // Back here afterwards, not to a dashboard: somebody who clicked
        // Enter came to enter.
        router.replace(`/login?next=/events/${id}/enter/${categoryId}`);
        return;
      }

      const { data, error } = await api.GET("/api/v1/events/{id}", { params: { path: { id } } });
      if (!alive) return;

      if (error || !data) {
        setLoadError("We couldn't load this event. Try again in a moment.");
      } else {
        setEvent(data);
      }
      setLoading(false);
    };

    load();
    return () => {
      alive = false;
    };
  }, [id, categoryId, router]);

  // A team category needs the rest of the team: the entrant is one of them,
  // so the form asks for team size minus one.
  useEffect(() => {
    if (!category || category.entryType !== "team" || !category.teamSize) return;
    setMembers((current) =>
      current.length === category.teamSize! - 1
        ? current
        : Array.from({ length: category.teamSize! - 1 }, (_, i) => current[i] ?? { name: "", dob: "" }),
    );
  }, [category]);

  const submit = async () => {
    if (saving || !category) return;
    setError("");

    if (participantName.trim().length < 2) {
      setError("Who is taking part?");
      return;
    }
    if (members.some((m) => m.name.trim().length < 2)) {
      setError("Every player in the team needs a name.");
      return;
    }
    if (!consent) {
      setError("Please confirm the line above before entering.");
      return;
    }

    setSaving(true);
    const result = await enterEvent({
      categoryId,
      consentGiven: true,
      participantName: participantName.trim(),
      ...(participantDob ? { participantDob } : {}),
      ...(members.length > 0
        ? {
            members: members.map((m) => ({
              name: m.name.trim(),
              ...(m.dob ? { dob: m.dob } : {}),
            })),
          }
        : {}),
    });
    setSaving(false);

    if (result.error || !result.entry) {
      setError(result.error ?? "Couldn't enter that.");
      return;
    }
    setDone(result.entry);
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (!event || !category) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-6 py-10">
        <p className="cf-card p-7 text-sm text-muted">
          {loadError || "That category is no longer on this event."}
        </p>
        <Link href={`/events/${id}`} className="cf-btn-ghost">
          Back to the event
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
        <section className="cf-card p-7">
          <span className="cf-badge cf-badge-ok">Entered</span>
          <h1 className="cf-display mt-4 text-2xl text-ink">
            {done.participantName} is in {done.categoryName}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {event.title} — {formatWhen(event.startsAt, event.endsAt)}
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="cf-eyebrow">Receipt</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{done.receiptNo}</dd>
            </div>
            <div>
              <dt className="cf-eyebrow">To pay</dt>
              <dd className="mt-1 text-sm text-ink">{formatFee(done.amountDue)}</dd>
            </div>
          </dl>

          {/* No gateway until Phase 6, so this says who takes the money and
              never implies we do. */}
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Pay the organiser directly — they mark it received against your receipt number. You can
            withdraw until {formatDateTime(cancelDeadline(event))}.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/account/entries" className="cf-btn-primary">
              Your entries
            </Link>
            <Link href={`/events/${id}`} className="cf-btn-ghost">
              Back to the event
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const state = entryState(event);
  const full = isFull(category.capacity, category.entriesCount);
  const ages = formatAges(category.minAge, category.maxAge);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <Link href={`/events/${id}`} className="cf-eyebrow text-faint hover:text-muted">
        ← {event.title}
      </Link>

      <header className="cf-card p-7">
        <p className="cf-eyebrow">Entering</p>
        <h1 className="cf-display mt-3 text-2xl text-ink">{category.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{formatFee(category.feeAmount)}</span>
          <span className="text-faint" aria-hidden>
            •
          </span>
          <span>
            {category.entryType === "team" ? `Team of ${category.teamSize}` : "Individual"}
          </span>
          {ages && (
            <>
              <span className="text-faint" aria-hidden>
                •
              </span>
              <span>{ages}</span>
            </>
          )}
          <span className="text-faint" aria-hidden>
            •
          </span>
          <span>{formatCapacity(category.capacity, category.entriesCount)}</span>
        </div>
      </header>

      {state.kind !== "open" || full ? (
        <section className="cf-card p-7">
          <p className="text-sm text-muted">
            {full ? "This category is full." : state.note}
          </p>
          <Link href={`/events/${id}`} className="cf-btn-ghost mt-5">
            Back to the event
          </Link>
        </section>
      ) : (
        <section className="cf-card space-y-5 p-7">
          <div>
            <label className={label} htmlFor="participantName">
              Name of the person taking part
            </label>
            <input
              id="participantName"
              className={`${field} mt-2`}
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="Aarav Sharma"
              maxLength={120}
            />
          </div>

          <div>
            <label className={label} htmlFor="participantDob">
              Their date of birth
            </label>
            <input
              id="participantDob"
              type="date"
              className={`${field} mt-2`}
              value={participantDob}
              onChange={(e) => setParticipantDob(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">
              {ages
                ? `Checked against ${ages.toLowerCase()} as it will be on the day of the event.`
                : "Used by the organiser to place entries in the right group."}
            </p>
          </div>

          {members.length > 0 && (
            <fieldset>
              <legend className={label}>The rest of the team</legend>
              <p className="mt-1 text-xs text-faint">
                {category.teamSize} players in total, including the name above.
              </p>

              <ul className="mt-3 space-y-3">
                {members.map((m, index) => (
                  <li key={index} className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <input
                      className={field}
                      value={m.name}
                      onChange={(e) =>
                        setMembers(
                          members.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      placeholder={`Player ${index + 2}`}
                      maxLength={120}
                    />
                    <input
                      type="date"
                      className={field}
                      value={m.dob}
                      onChange={(e) =>
                        setMembers(
                          members.map((x, i) => (i === index ? { ...x, dob: e.target.value } : x)),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="border-t border-line-soft pt-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--grad-1)]"
              />
              <span className="text-sm leading-6 text-muted">
                I am taking part myself, or I am the parent or guardian of everyone named above
                and I agree to their name and date of birth being held for this event and shared
                with its organiser.{" "}
                <Link href="/privacy" className="font-semibold text-gold hover:text-accent-ink">
                  How we handle this
                </Link>
              </span>
            </label>

            <p className="mt-4 text-sm text-muted">
              {formatFee(category.feeAmount)} payable to the organiser. Nothing is charged here.
            </p>
            <button
              type="button"
              className="cf-btn-primary mt-4"
              onClick={submit}
              disabled={saving || !consent}
            >
              {saving ? "Entering…" : "Confirm this entry"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
