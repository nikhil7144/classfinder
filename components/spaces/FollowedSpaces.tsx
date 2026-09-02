"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Followed = {
  provider_id: string;
  display_name: string | null;
  photo_url: string | null;
  headline: string | null;
  post_count: number;
  followed_at: string;
};

/**
 * The Spaces this parent follows.
 *
 * Following has to lead somewhere or it is a button that does nothing. This
 * is deliberately a list of Spaces and not a merged feed of their posts: a
 * parent follows three coaches, not thirty, and a chronological river of
 * everyone's posts is a product that needs an algorithm the day it works.
 *
 * Renders nothing when they follow nobody — a dashboard should not carry a
 * section explaining an empty state for a feature they have not used.
 */
export default function FollowedSpaces() {
  const [spaces, setSpaces] = useState<Followed[] | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase.rpc("my_followed_spaces");
      if (active) setSpaces((data as Followed[]) || []);
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  if (!spaces?.length) return null;

  return (
    <section className="cf-card p-7">
      <h2 className="cf-display text-lg text-ink">Spaces you follow</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        What your coaches have been posting — drills, technique, how a session actually runs.
      </p>

      <div className="mt-5 space-y-2">
        {spaces.map((s) => (
          <Link
            key={s.provider_id}
            href={`/provider/${s.provider_id}/space`}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 transition hover:border-faint"
          >
            {s.photo_url ? (
              <img
                src={s.photo_url}
                alt=""
                className="h-11 w-11 shrink-0 rounded-xl border border-line object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-3 font-semibold text-faint">
                {(s.display_name || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{s.display_name || "Unnamed"}</p>
              {s.headline && <p className="truncate text-xs text-muted">{s.headline}</p>}
            </div>
            <span className="shrink-0 font-mono text-xs text-faint">
              {s.post_count} {s.post_count === 1 ? "post" : "posts"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
