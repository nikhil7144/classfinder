"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { fetchReference, type City, type ServiceCategory } from "@/lib/api/reference";
import {
  createEvent,
  updateEvent,
  type CreateEvent,
  type UpdateEvent,
} from "@/lib/api/my-events";
import type { Event } from "@/lib/api/events";
import { fromLocalInput, toLocalInput } from "@/lib/events";
import { groupServices } from "@/lib/requirements";
import { BRAND } from "@/lib/brand";

type Props = {
  /** Absent in create mode. */
  event?: Event;
  onSaved?: (event: Event) => void;
};

const field =
  "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block";

/** The bucket's own ceiling, said here too so the refusal is a sentence
 * rather than a failed upload. */
const MAX_BANNER_BYTES = 5 * 1024 * 1024;

const BOOKING_MODES: { value: "platform" | "external" | "none"; title: string; blurb: string }[] = [
  {
    value: "platform",
    title: "Here",
    blurb: `Families enter through ${BRAND.name}, against the categories you list.`,
  },
  {
    value: "external",
    title: "My own site",
    blurb: "We show the event and send people to your booking page.",
  },
  { value: "none", title: "Nowhere", blurb: "An announcement. Nothing is sold." },
];

/**
 * The event itself — everything except its categories, which are their own
 * form because they are their own rows.
 *
 * Creating saves a draft immediately and moves to the edit screen. That is
 * not a nicety: 3J only accepts an insert whose status is draft, categories
 * cannot be attached to an event that has no id, and an organiser who fills
 * in two screens before anything is stored loses both when their phone locks.
 */
export default function EventForm({ event, onSaved }: Props) {
  const router = useRouter();
  const editing = Boolean(event);

  const [cities, setCities] = useState<City[]>([]);
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [referenceFailed, setReferenceFailed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(event?.title ?? "");
  const [about, setAbout] = useState(event?.about ?? "");
  const [serviceCategoryId, setServiceCategoryId] = useState(event?.serviceCategoryId ?? "");
  const [bannerUrl, setBannerUrl] = useState(event?.bannerUrl ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [cityId, setCityId] = useState(event?.cityId ?? "");
  const [venueName, setVenueName] = useState(event?.venueName ?? "");
  const [venueAddress, setVenueAddress] = useState(event?.venueAddress ?? "");
  const [bookingMode, setBookingMode] = useState(event?.bookingMode ?? "platform");
  const [externalBookingUrl, setExternalBookingUrl] = useState(event?.externalBookingUrl ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.endsAt ?? null));
  const [bookingOpensAt, setBookingOpensAt] = useState(toLocalInput(event?.bookingOpensAt ?? null));
  const [bookingClosesAt, setBookingClosesAt] = useState(
    toLocalInput(event?.bookingClosesAt ?? null),
  );
  const [cancellationDeadline, setCancellationDeadline] = useState(
    toLocalInput(event?.cancellationDeadline ?? null),
  );

  useEffect(() => {
    let alive = true;
    fetchReference().then((r) => {
      if (!alive) return;
      setCities(r.cities);
      setServices(r.serviceCategories);
      // Not "no cities have been set up" — that sentence once sent providers
      // to support about a taxonomy that was there all along.
      setReferenceFailed(!r.ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A local preview of a file that has not been uploaded yet. Revoked on the
  // way out, because an object URL holds the whole image in memory until it is.
  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(null);
      return;
    }
    const url = URL.createObjectURL(bannerFile);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  const save = async () => {
    if (saving) return;
    setError("");
    setSaved(false);

    if (title.trim().length < 3) {
      setError("Give the event a title of at least three characters.");
      return;
    }
    if (!cityId) {
      setError("Pick the city it happens in.");
      return;
    }
    if (!startsAt) {
      setError("When does it start?");
      return;
    }
    if (bookingMode === "external" && !externalBookingUrl.trim()) {
      setError("Add the link families should book on, or change where entries are taken.");
      return;
    }

    setSaving(true);

    /**
     * The poster goes straight to Storage, not through the API.
     *
     * Named with a fresh uuid rather than the event id: in create mode there
     * is no id yet, and a random name also means replacing a poster cannot
     * serve the old bytes from a CDN cache under the same URL. The first
     * folder segment is the uploader's own id, which is what the bucket
     * policy checks.
     */
    let poster = bannerUrl;

    if (bannerFile) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setSaving(false);
        setError("Log in again.");
        return;
      }

      const ext = bannerFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-banners")
        .upload(path, bannerFile, { upsert: false });

      if (uploadError) {
        setSaving(false);
        setError(`The poster didn't upload: ${uploadError.message}`);
        return;
      }

      poster = supabase.storage.from("event-banners").getPublicUrl(path).data.publicUrl;
    }

    /**
     * Sent as null rather than omitted, so clearing a field actually clears
     * it. `toPatch` in the API only touches keys that are present — leaving
     * an emptied venue out would silently keep the old one, which is the
     * kind of bug an organiser only finds when a family turns up at last
     * month's ground.
     */
    const optional = (v: string) => (v.trim() ? v.trim() : null);

    // Cast through unknown because the generated types say a field is absent
    // or a string, while "clear it" is a null the API accepts (@IsOptional
    // passes null through, and toPatch then writes it). Widening every
    // optional in the DTO to `string | null` is the tidier fix and is a
    // change to the contract, not to this form.
    const body = {
      title: title.trim(),
      about: optional(about),
      serviceCategoryId: serviceCategoryId || null,
      bannerUrl: optional(poster),
      cityId,
      venueName: optional(venueName),
      venueAddress: optional(venueAddress),
      bookingMode,
      // The database refuses a URL under a mode that ignores it, so the form
      // clears it rather than letting the save fail on a field the organiser
      // can no longer see.
      externalBookingUrl: bookingMode === "external" ? externalBookingUrl.trim() : null,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt) ?? null,
      bookingOpensAt: fromLocalInput(bookingOpensAt) ?? null,
      bookingClosesAt: fromLocalInput(bookingClosesAt) ?? null,
      cancellationDeadline: fromLocalInput(cancellationDeadline) ?? null,
    };

    const result = editing
      ? await updateEvent(event!.id, body as unknown as UpdateEvent)
      : await createEvent(body as unknown as CreateEvent);

    setSaving(false);

    if (result.error || !result.event) {
      setError(result.error ?? "Couldn't save that.");
      return;
    }

    if (editing) {
      setBannerUrl(result.event.bannerUrl ?? "");
      setBannerFile(null);
      setSaved(true);
      onSaved?.(result.event);
    } else {
      // Straight to the edit screen, which is where categories and publishing
      // live. Nothing is lost if they stop here: it is already a saved draft.
      router.push(`/events/${result.event.id}/edit`);
    }
  };

  return (
    <div className="space-y-5">
      {referenceFailed && (
        <p className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-warn">
          We couldn&apos;t load cities and categories just now, so those two lists are empty.
          Refresh before saving.
        </p>
      )}

      <div>
        <label className={label} htmlFor="title">
          Event title
        </label>
        <input
          id="title"
          className={`${field} mt-2`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Winter Badminton Open 2026"
          maxLength={160}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="service">
            Sport, subject or activity
          </label>
          <select
            id="service"
            className={`${field} mt-2`}
            value={serviceCategoryId}
            onChange={(e) => setServiceCategoryId(e.target.value)}
          >
            <option value="">Not listed here</option>
            {groupServices(services).map((g) => (
              <optgroup key={g.group} label={g.label}>
                {g.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="city">
            Event city
          </label>
          <select
            id="city"
            className={`${field} mt-2`}
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            <option value="">Select the event city</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="about">
          About this event
        </label>
        <textarea
          id="about"
          className={`${field} mt-2 min-h-32`}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="Format, rules, what to bring, and who to contact on the day."
          maxLength={4000}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="venueName">
            Venue name
          </label>
          <input
            id="venueName"
            className={`${field} mt-2`}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="Nehru Stadium, Court 3"
            maxLength={160}
          />
        </div>
        <div>
          <label className={label} htmlFor="banner">
            Event poster image
          </label>
          <input
            id="banner"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className={`${field} mt-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-xs file:text-ink`}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > MAX_BANNER_BYTES) {
                setError("That image is over 5 MB. Try a smaller one.");
                return;
              }
              setError("");
              setBannerFile(file);
            }}
          />
          <p className="mt-1 text-xs text-faint">
            Wide works best — it is cropped to a banner. Up to 5 MB.
          </p>

          {(bannerPreview || bannerUrl) && (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerPreview || bannerUrl}
                alt="Poster preview"
                className="aspect-[21/9] w-full rounded-2xl border border-line object-cover"
              />
              <button
                type="button"
                className="cf-btn-ghost mt-2 px-3 py-1 text-xs"
                onClick={() => {
                  setBannerFile(null);
                  setBannerUrl("");
                }}
              >
                {bannerPreview ? "Choose a different one" : "Remove the poster"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="venueAddress">
          Full venue address
        </label>
        <textarea
          id="venueAddress"
          className={`${field} mt-2 min-h-20`}
          placeholder="Street, landmark and area — enough for a family to find the right gate."
          value={venueAddress}
          onChange={(e) => setVenueAddress(e.target.value)}
          maxLength={500}
        />
      </div>

      <fieldset>
        <legend className={label}>Where families enter this event</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {BOOKING_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setBookingMode(m.value)}
              className="rounded-2xl border p-4 text-left transition"
              style={{
                borderColor: bookingMode === m.value ? "var(--grad-2)" : "var(--border)",
                background: bookingMode === m.value ? "var(--surface-3)" : "var(--surface-2)",
              }}
              aria-pressed={bookingMode === m.value}
            >
              <span className="block text-sm font-semibold text-ink">{m.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{m.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {bookingMode === "external" && (
        <div>
          <label className={label} htmlFor="externalUrl">
            Your booking page link
          </label>
          <input
            id="externalUrl"
            className={`${field} mt-2`}
            value={externalBookingUrl}
            onChange={(e) => setExternalBookingUrl(e.target.value)}
            placeholder="https://your-site.com/tournament-entry"
          />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="startsAt">
            Event start date and time
          </label>
          <input
            id="startsAt"
            type="datetime-local"
            className={`${field} mt-2`}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="endsAt">
            Event end date and time
          </label>
          <input
            id="endsAt"
            type="datetime-local"
            className={`${field} mt-2`}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>

      {bookingMode !== "none" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="bookingOpensAt">
              Entries open on
            </label>
            <input
              id="bookingOpensAt"
              type="datetime-local"
              className={`${field} mt-2`}
              value={bookingOpensAt}
              onChange={(e) => setBookingOpensAt(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="bookingClosesAt">
              Entries close on
            </label>
            <input
              id="bookingClosesAt"
              type="datetime-local"
              className={`${field} mt-2`}
              value={bookingClosesAt}
              onChange={(e) => setBookingClosesAt(e.target.value)}
            />
          </div>
        </div>
      )}

      {bookingMode === "platform" && (
        <div>
          <label className={label} htmlFor="cancellationDeadline">
            Last date and time a family can withdraw
          </label>
          <input
            id="cancellationDeadline"
            type="datetime-local"
            className={`${field} mt-2`}
            value={cancellationDeadline}
            onChange={(e) => setCancellationDeadline(e.target.value)}
          />
          <p className="mt-1 text-xs text-faint">
            Leave this blank and a family may withdraw right up to the moment entries close. After
            it, only you can cancel an entry — which is what a no-refunds-in-the-last-week rule
            actually is.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-teal">Saved.</p>}

      <div className="flex items-center gap-3">
        <button type="button" className="cf-btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save as draft"}
        </button>
        {!editing && (
          <span className="text-xs text-faint">
            Saved as a draft — nothing is public until you publish it.
          </span>
        )}
      </div>
    </div>
  );
}
