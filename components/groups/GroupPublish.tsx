"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchPublicGroup } from "@/lib/api/client";
import { publishGroup } from "@/lib/api/my-groups";
import { GroupInvite, membersStillNeeded } from "@/lib/groups";

type Props = {
  invite: GroupInvite;
  onChanged: () => void;
};

/**
 * Show the group on Aspire91, or take it down.
 *
 * Live and public are different things. Live means the families are here and
 * coaches can see it. Public means this group is being showcased on the site,
 * and nothing makes that true except the creator pressing the button — not an
 * accepted coach, not time passing.
 *
 * Which is also why there is no publish button while a group is still
 * gathering its families: recruiting happens down the invite link among
 * neighbours, and a showcase is not a recruitment ad.
 */
export default function GroupPublish({ invite, onChanged }: Props) {
  const [published, setPublished] = useState(false);
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needed = membersStillNeeded(invite.member_count);
  const isLive = needed === 0 && invite.is_open;

  const load = useCallback(async () => {
    const group = await fetchPublicGroup(invite.id);
    if (group) {
      setPublished(true);
      setHeadline(group.publicHeadline ?? "");
      setAbout(group.publicAbout ?? "");
    } else {
      setPublished(false);
    }
    setLoading(false);
  }, [invite.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: boolean) {
    setBusy(true);
    setError("");

    const { error: failed } = await publishGroup(invite.id, {
      published: next,
      publicHeadline: headline.trim() || undefined,
      publicAbout: about.trim() || null,
    });

    setBusy(false);
    if (failed) {
      setError(failed);
      return;
    }

    await load();
    onChanged();
  }

  if (loading) return null;

  return (
    <section className="cf-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="cf-display text-lg text-ink">Show on Aspire91</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            A page anyone can find, so families nearby see what you are doing and coaches know
            the group is real. Your society name and everyone&apos;s names stay off it.
          </p>
        </div>

        {published && <span className="cf-badge cf-badge-ok shrink-0">Showing</span>}
      </div>

      {!isLive ? (
        /* Honest about why, rather than a disabled button with no reason. */
        <p className="mt-5 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm leading-6 text-muted">
          {invite.is_open
            ? `You can show this group once ${needed} more ${
                needed === 1 ? "family joins" : "families join"
              }. Until then, share the invite link with your neighbours.`
            : "This group is closed, so it cannot be shown. Reopen it first."}
        </p>
      ) : (
        <>
          <label htmlFor="pub-headline" className="mt-5 block text-sm font-medium text-muted">
            Headline
          </label>
          <input
            id="pub-headline"
            className="cf-input mt-1.5"
            placeholder={`${invite.service_name} in ${invite.area_name}`}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={140}
          />

          <label htmlFor="pub-about" className="mt-4 block text-sm font-medium text-muted">
            What this group is doing
          </label>
          <textarea
            id="pub-about"
            className="cf-input mt-1.5 min-h-28"
            placeholder="Four families in our society, Saturday and Sunday mornings at the clubhouse."
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={2000}
          />

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {published ? (
              <>
                <button onClick={() => save(true)} disabled={busy} className="cf-btn-primary">
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={() => save(false)}
                  disabled={busy}
                  className="cf-btn-ghost text-danger hover:border-danger"
                >
                  Stop showing it
                </button>
                <Link
                  href={`/groups/public/${invite.id}`}
                  className="text-sm font-semibold text-gold transition hover:text-accent-ink"
                >
                  See the page
                </Link>
              </>
            ) : (
              <button onClick={() => save(true)} disabled={busy} className="cf-btn-primary">
                {busy ? "Publishing…" : "Show it on Aspire91"}
              </button>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-faint">
            Photos stay inside the group unless whoever posted them chooses otherwise. Nobody
            else can put someone&apos;s photo on this page, including you.
          </p>
        </>
      )}
    </section>
  );
}
