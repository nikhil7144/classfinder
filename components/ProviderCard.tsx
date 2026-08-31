"use client";

import Link from "next/link";
import {
  SearchResult,
  formatDistance,
  formatExperience,
  formatFees,
} from "@/lib/search";

type Props = {
  provider: SearchResult;
  categoryName?: string;
  serviceNames?: string[];
  teachingPlaceLabels?: Record<string, string>;
  /**
   * Distance is only meaningful when measured from the seeker's own position.
   * Searching by area measures from that area's centroid, so a provider in
   * the same area is "0 m" away — true, and useless to read.
   */
  showDistance?: boolean;
};

export default function ProviderCard({
  provider,
  categoryName,
  serviceNames = [],
  teachingPlaceLabels = {},
  showDistance = false,
}: Props) {
  const fees = formatFees(provider.fee_min, provider.fee_max, provider.fee_period);
  const distance = showDistance ? formatDistance(provider.distance_km) : null;
  const experience = formatExperience(provider.experience_years);

  // Lead with what a parent actually compares, and keep the list short enough
  // to scan — the full set is on the profile.
  const shownServices = serviceNames.slice(0, 4);
  const moreServices = serviceNames.length - shownServices.length;

  return (
    <Link
      href={`/provider/${provider.id}`}
      className="cf-card block p-5 transition hover:border-faint"
    >
      <div className="flex gap-4">
        {provider.photo_url ? (
          <img
            src={provider.photo_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl border border-line object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-lg font-semibold text-faint">
            {(provider.display_name || "?").charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="cf-display truncate text-lg text-ink">
              {provider.display_name || "Unnamed"}
            </h3>
            {provider.is_featured && <span className="cf-badge cf-badge-warn">Featured</span>}
          </div>

          <p className="mt-0.5 text-sm text-muted">
            {categoryName}
            {provider.nearest_area_name && (
              <>
                {categoryName ? " · " : ""}
                {provider.nearest_area_name}
              </>
            )}
          </p>

          {(distance || experience) && (
            <p className="mt-1 font-mono text-xs text-faint">
              {[distance, experience].filter(Boolean).join("  ·  ")}
            </p>
          )}
        </div>

        {fees && (
          <div className="shrink-0 text-right">
            <div className="font-semibold text-ink">{fees}</div>
          </div>
        )}
      </div>

      {provider.help_statement && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted">
          {provider.help_statement}
        </p>
      )}

      {(shownServices.length > 0 || (provider.teaching_places || []).length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {shownServices.map((name) => (
            <span
              key={name}
              className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-muted"
            >
              {name}
            </span>
          ))}
          {moreServices > 0 && (
            <span className="px-1 py-1 text-xs text-faint">+{moreServices} more</span>
          )}
          {(provider.teaching_places || []).map((id) => (
            <span
              key={id}
              className="rounded-full border border-line-soft bg-surface-3 px-2.5 py-1 text-xs text-faint"
            >
              {teachingPlaceLabels[id] || id}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
