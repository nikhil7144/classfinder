"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Organiser = {
  id: string;
  name: string | null;
  about: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  venue_name: string | null;
  venue_address: string | null;
  approved: boolean;
  is_suspended: boolean;
  created_at: string;
};

const COLUMNS =
  "id, name, about, contact_email, contact_phone, website_url, venue_name, venue_address, approved, is_suspended, created_at";

/** Unapproved first: this page is the queue, not the archive. */
async function readOrganisers() {
  return supabase
    .from("organisers")
    .select(COLUMNS)
    .order("approved")
    .order("created_at", { ascending: false });
}

/**
 * The approval queue for event companies.
 *
 * Reads through the anon client on purpose, unlike /admin/providers, which
 * needs a service-role route because providers has no admin read policy —
 * its screens saw zero rows and its updates matched nothing while returning
 * 200. phase3g gives organisers that policy, so this page reads as the admin
 * it is, and the one privileged write goes through set_organiser_approval,
 * which checks the role itself.
 */
export default function AdminOrganisersPage() {
  const [organisers, setOrganisers] = useState<Organiser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: readError } = await readOrganisers();
    if (readError) {
      setError(readError.message);
      setOrganisers([]);
      return;
    }
    setOrganisers((data as Organiser[]) ?? []);
  }, []);

  // The first read runs inside the effect behind an alive flag; load() is the
  // same read triggered by an approval, which is an event and not a render.
  useEffect(() => {
    let alive = true;
    readOrganisers().then(({ data, error: readError }) => {
      if (!alive) return;
      if (readError) {
        setError(readError.message);
        setOrganisers([]);
        return;
      }
      setOrganisers((data as Organiser[]) ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const decide = async (id: string, approved: boolean, suspended: boolean | null) => {
    setBusyId(id);
    setError("");

    const { error: writeError } = await supabase.rpc("set_organiser_approval", {
      p_organiser_id: id,
      p_approved: approved,
      p_suspended: suspended,
    });

    setBusyId(null);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    await load();
  };

  if (!organisers) return <div className="cf-card h-64 animate-pulse p-8" />;

  const pending = organisers.filter((o) => !o.approved && !o.is_suspended);

  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Organisers</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">Event companies</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Companies that run events rather than teach. Read what they submitted, then approve or
          suspend. {pending.length > 0 && <strong className="text-ink">{pending.length} waiting.</strong>}
        </p>
      </header>

      {error && (
        <div className="cf-card border-danger/50 bg-danger-soft/30 p-5">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {organisers.length === 0 ? (
        <section className="cf-card p-8 text-center">
          <p className="text-sm text-muted">No event companies have signed up yet.</p>
        </section>
      ) : (
        <ul className="space-y-4">
          {organisers.map((o) => (
            <li key={o.id} className="cf-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold text-ink">{o.name || "Unnamed"}</h2>
                  <p className="mt-1 text-xs text-faint">
                    Signed up {new Date(o.created_at).toLocaleDateString()}
                  </p>
                </div>

                <span
                  className={`cf-badge ${
                    o.is_suspended
                      ? "cf-badge-warn"
                      : o.approved
                        ? "cf-badge-ok"
                        : "cf-badge-neutral"
                  }`}
                >
                  {o.is_suspended ? "Suspended" : o.approved ? "Approved" : "Awaiting review"}
                </span>
              </div>

              {o.about && <p className="mt-4 text-sm leading-relaxed text-muted">{o.about}</p>}

              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="cf-eyebrow">Contact</dt>
                  <dd className="mt-1 text-ink">
                    {o.contact_email || "—"}
                    {o.contact_phone ? ` · ${o.contact_phone}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="cf-eyebrow">Venue</dt>
                  <dd className="mt-1 text-ink">
                    {o.venue_name || "—"}
                    {o.venue_address ? ` · ${o.venue_address}` : ""}
                  </dd>
                </div>
                {o.website_url && (
                  <div className="sm:col-span-2">
                    <dt className="cf-eyebrow">Website</dt>
                    <dd className="mt-1">
                      {/* An admin checking a business will want to open it, and
                          noreferrer keeps this console out of their logs. */}
                      <a
                        href={o.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold hover:text-accent-ink"
                      >
                        {o.website_url}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 flex flex-wrap gap-3">
                {!o.approved && !o.is_suspended && (
                  <button
                    onClick={() => decide(o.id, true, false)}
                    disabled={busyId === o.id}
                    className="cf-btn-primary"
                  >
                    {busyId === o.id ? "Saving…" : "Approve"}
                  </button>
                )}

                {o.approved && !o.is_suspended && (
                  <button
                    onClick={() => decide(o.id, false, true)}
                    disabled={busyId === o.id}
                    className="cf-btn-ghost"
                  >
                    Suspend
                  </button>
                )}

                {o.is_suspended && (
                  <button
                    onClick={() => decide(o.id, true, false)}
                    disabled={busyId === o.id}
                    className="cf-btn-primary"
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
