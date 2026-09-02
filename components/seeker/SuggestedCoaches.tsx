"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SearchResult, formatDistance, formatExperience, formatFees } from "@/lib/search";

export type CoachSuggestion = {
  provider: SearchResult;
  /** Null when there were too few to be worth ranking — see the route. */
  reason: string | null;
};

type Props = {
  /**
   * Where this is rendered, which is the only thing that differs between the
   * two placements — the dashboard is introducing the idea, search is offering
   * a shortcut past a list the parent is already looking at.
   */
  variant: "dashboard" | "search";
};

/**
 * Coaches worth looking at first, for a parent who has said what they want —
 * and, on search, the invitation to say it when they have not.
 *
 * A horizontal strip in both places, deliberately: it has to be able to sit
 * above a full list of search results without competing with it, and a
 * vertical block of suggestions above a vertical block of results reads as one
 * confusing list of eleven coaches.
 *
 * Renders nothing at all on no match, on an error, or for anyone who is not a
 * signed-in parent. This is an accelerator on a product that works without it,
 * and a broken accelerator should be invisible rather than apologetic — the
 * parent still has search, which is what they had before.
 */
export default function SuggestedCoaches({ variant }: Props) {
  const [suggestions, setSuggestions] = useState<CoachSuggestion[] | null>(null);
  /** Why there are none, when there are none. See the route. */
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/coaches/suggest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const result = await response.json();
      if (!active) return;

      setSuggestions((result.suggestions as CoachSuggestion[]) || []);
      setEmptyReason((result.reason as string) ?? null);
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  /*
   * The invitation, in the one place it is worth making: a parent standing in
   * front of a list of every coach in their area, doing by hand the filtering
   * they could have described once. The dashboard has its own, fuller version
   * of this card, so it is not repeated there.
   *
   * Shown only to a signed-in parent who has not answered yet — never to a
   * guest, who cannot save one, and never to a coach.
   */
  if (variant === "search" && emptyReason === "no_requirement") {
    return (
      <section className="cf-card mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="cf-display text-lg text-ink">
            Tell us what you&apos;re looking for
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Say it once — the subject, your child&apos;s age, the days that suit you — and
            we&apos;ll put the coaches who actually fit at the top of this page. Coaches who teach
            it near you can get in touch too; they see the requirement and your area, never your
            name or number.
          </p>
        </div>
        <Link href="/account/profile" className="cf-btn-primary shrink-0">
          Say what I&apos;m looking for
        </Link>
      </section>
    );
  }

  if (!suggestions?.length) return null;

  const wantedIds = Array.from(
    new Set(suggestions.flatMap((s) => s.provider.service_category_ids || []))
  );

  return (
    <section className={variant === "dashboard" ? "cf-card p-7" : "mt-6"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="cf-display text-lg text-ink">Suggested for you</h2>
          <p className="mt-1 text-sm text-muted">
            {variant === "dashboard"
              ? "Picked out of the coaches near you who teach what you asked for."
              : "Matched against what you said you're looking for."}
          </p>
        </div>
        <Link
          href={wantedIds.length === 1 ? `/search?service=${wantedIds[0]}` : "/search"}
          className="shrink-0 text-sm font-semibold text-gold transition hover:text-accent-ink"
        >
          View all →
        </Link>
      </div>

      {/* Scrolls sideways rather than wrapping, so the strip stays one row
          tall wherever it is dropped and never pushes the page's real content
          below the fold. */}
      <div className="no-scrollbar -mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-2">
        {suggestions.map(({ provider, reason }) => {
          const fees = formatFees(provider.fee_min, provider.fee_max, provider.fee_period);
          const distance = formatDistance(provider.distance_km);
          const experience = formatExperience(provider.experience_years);

          return (
            <Link
              key={provider.id}
              href={`/provider/${provider.id}`}
              className="cf-card w-64 shrink-0 p-4 transition hover:border-faint"
            >
              <div className="flex items-center gap-3">
                {provider.photo_url ? (
                  <img
                    src={provider.photo_url}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl border border-line object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 font-semibold text-faint">
                    {(provider.display_name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="cf-display truncate text-ink">
                    {provider.display_name || "Unnamed"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {provider.nearest_area_name}
                    {distance ? ` · ${distance}` : ""}
                  </p>
                </div>
              </div>

              {reason ? (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-accent-ink">{reason}</p>
              ) : (
                provider.help_statement && (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
                    {provider.help_statement}
                  </p>
                )
              )}

              {(fees || experience) && (
                <p className="mt-3 font-mono text-xs text-faint">
                  {[fees, experience].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
