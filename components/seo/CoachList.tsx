import Link from "next/link";
import ProviderCard from "@/components/ProviderCard";
import type { SearchResult } from "@/lib/search";
import type { ProviderCategory, ServiceCategory, TeachingPlace } from "@/lib/api/reference";

type Props = {
  coaches: SearchResult[];
  categories: ProviderCategory[];
  services: ServiceCategory[];
  places: TeachingPlace[];
  /** What to say when there is nobody yet. Always specific to the page. */
  emptyMessage: string;
};

/**
 * The coaches on a landing page.
 *
 * Distance is never shown. These pages have no viewer position — they are
 * cached and served to everybody — and the area centroid would put every coach
 * in the area at "0 m away", which is the bug /search had.
 */
export default function CoachList({
  coaches,
  categories,
  services,
  places,
  emptyMessage,
}: Props) {
  if (coaches.length === 0) {
    return (
      <div className="cf-card p-8 text-center">
        <p className="text-muted">{emptyMessage}</p>
        <Link href="/search" className="cf-btn-ghost mt-5">
          Search nearby areas
        </Link>
      </div>
    );
  }

  const categoryName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const serviceName = Object.fromEntries(services.map((s) => [s.id, s.name]));
  const placeLabel = Object.fromEntries(places.map((p) => [p.id, p.label]));

  return (
    <div className="space-y-5">
      {coaches.map((coach) => (
        <ProviderCard
          key={coach.id}
          provider={coach}
          categoryName={
            coach.provider_category_id ? categoryName[coach.provider_category_id] : undefined
          }
          serviceNames={(coach.service_category_ids ?? [])
            .map((id) => serviceName[id])
            .filter(Boolean)}
          teachingPlaceLabels={placeLabel}
          showDistance={false}
        />
      ))}
    </div>
  );
}
