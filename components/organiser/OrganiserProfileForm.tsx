"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchMyOrganiser, saveMyOrganiser, type Organiser } from "@/lib/api/organisers";

type Props = {
  redirectTo?: string;
  /** "setup" is the first-time flow; "edit" is the same form in the account area. */
  variant?: "setup" | "edit";
};

const field =
  "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-gold";
const label = "cf-eyebrow block";
const errorText = "mt-1 text-xs text-danger";

/**
 * An event company's listing.
 *
 * Deliberately not a cut-down provider form. A coach is asked what they teach,
 * what they charge and which areas they travel to; none of that describes a
 * business that runs a tournament at a ground. What this asks for is who to
 * contact and where the events happen.
 *
 * It deliberately does not ask where the events are. An event company runs a
 * tournament at a ground in one city and a showcase in another; there is no
 * single area or venue to name here, and 3I moved that question to the event,
 * which has one answer. What is left is an office address — who an admin is
 * approving and where they are.
 *
 * Every field is optional except a name, and that is on purpose: an organiser
 * applying at 11pm should be able to say who they are and come back to the
 * rest. Approval is a human reading it either way.
 */
export default function OrganiserProfileForm({ redirectTo = "/dashboard", variant = "edit" }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  const [existing, setExisting] = useState<Organiser | null>(null);

  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const mine = await fetchMyOrganiser();
      if (!alive) return;

      if (mine.error) {
        setLoadError(mine.error);
        setLoading(false);
        return;
      }

      if (mine.organiser) {
        const o = mine.organiser;
        setExisting(o);
        setName(o.name ?? "");
        setAbout(o.about ?? "");
        setContactEmail(o.contactEmail ?? "");
        setContactPhone(o.contactPhone ?? "");
        setWebsiteUrl(o.websiteUrl ?? "");
        setOfficeAddress(o.officeAddress ?? "");
      }

      setLoading(false);
    };

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  const save = async () => {
    if (saving) return;
    setFormError("");

    if (name.trim().length < 2) {
      setFormError("Tell us the company name.");
      return;
    }

    setSaving(true);

    // Only what was filled in. Sending "" for an untouched optional field
    // would fail the API's own length and format rules on an empty string,
    // which is a confusing way to reject a field nobody typed in.
    const patch = {
      name: name.trim(),
      ...(about.trim() ? { about: about.trim() } : {}),
      ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
      ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
      ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
      ...(officeAddress.trim() ? { officeAddress: officeAddress.trim() } : {}),
    };

    const { organiser, error } = await saveMyOrganiser(patch);
    setSaving(false);

    if (error) {
      setFormError(error);
      return;
    }

    setExisting(organiser);

    // The profile is complete once there is a listing to review. Approval is
    // a separate gate and the dashboard reports it separately.
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      await supabase.from("profiles").update({ profile_complete: true }).eq("id", auth.user.id);
    }

    router.push(redirectTo);
    router.refresh();
  };

  if (loading) return <div className="cf-card h-96 animate-pulse p-8" />;

  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">{variant === "setup" ? "Set up" : "Your listing"}</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">
          {variant === "setup" ? "Tell us about your company" : "Your company"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You run events and take bookings. Parents find your events, not a teaching listing — so
          this asks who you are and how to reach you, and nothing about fees or subjects. Each
          event names its own city and venue when you list it.
        </p>

        {existing && (
          <div className="mt-4 flex flex-wrap gap-2">
            {existing.isSuspended ? (
              <span className="cf-badge cf-badge-warn">Suspended</span>
            ) : existing.approved ? (
              <span className="cf-badge cf-badge-ok">Approved</span>
            ) : (
              <span className="cf-badge cf-badge-neutral">Waiting for review</span>
            )}
          </div>
        )}
      </header>

      {loadError && (
        <div className="cf-card border-danger/50 bg-danger-soft/30 p-5">
          <p className="text-sm text-danger">{loadError}</p>
        </div>
      )}

      <section className="cf-card space-y-5 p-7">
        <div>
          <label className={label} htmlFor="org-name">
            Company name
          </label>
          <input
            id="org-name"
            className={`${field} mt-2`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Indore Sports Events"
          />
        </div>

        <div>
          <label className={label} htmlFor="org-about">
            What you run
          </label>
          <textarea
            id="org-about"
            className={`${field} mt-2 min-h-28`}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Tournaments, competitions, showcases — what a parent should expect."
          />
        </div>
      </section>

      <section className="cf-card space-y-5 p-7">
        <div>
          <h2 className="cf-display text-lg text-ink">How parents reach you</h2>
          <p className="mt-1 text-sm text-muted">
            Shown on your events. A business contact, not a personal number.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="org-email">
              Contact email
            </label>
            <input
              id="org-email"
              type="email"
              className={`${field} mt-2`}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>

          <div>
            <label className={label} htmlFor="org-phone">
              Contact phone
            </label>
            <input
              id="org-phone"
              className={`${field} mt-2`}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="org-website">
            Website
          </label>
          <input
            id="org-website"
            className={`${field} mt-2`}
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
          />
          <p className="mt-1 text-xs text-faint">Include https:// — otherwise it won&apos;t save.</p>
        </div>
      </section>

      <section className="cf-card space-y-5 p-7">
        <div>
          <h2 className="cf-display text-lg text-ink">Where your office is</h2>
          <p className="mt-1 text-sm text-muted">
            So an admin knows who they are approving. Not where your events are — you name a city
            and venue on each event when you list it.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="org-office">
            Office address
          </label>
          <textarea
            id="org-office"
            className={`${field} mt-2 min-h-20`}
            value={officeAddress}
            onChange={(e) => setOfficeAddress(e.target.value)}
            placeholder="Street, area, city"
          />
        </div>
      </section>

      <div className="cf-card p-7">
        {formError && <p className={`${errorText} mb-4 text-sm`}>{formError}</p>}
        <button onClick={save} disabled={saving} className="cf-btn-primary w-full sm:w-auto">
          {saving ? "Saving…" : existing ? "Save changes" : "Submit for review"}
        </button>
        {!existing && (
          <p className="mt-3 text-xs text-faint">
            An admin reviews new companies before their events go live.
          </p>
        )}
      </div>
    </div>
  );
}
