import Link from "next/link";
import { unstable_cache } from "next/cache";
import { fetchCitiesOrThrow, type City } from "@/lib/api/client";
import { fetchCityEventsOrThrow, type Event } from "@/lib/api/events";
import { fetchReference } from "@/lib/api/reference";
import EventCard from "@/components/events/EventCard";

/**
 * What is on, city by city.
 *
 * `?city=` is a URL parameter rather than component state for the same reason
 * the homepage feed is: every live city gets its own crawlable page, and a
 * tournament in Pune is exactly the sort of thing a parent searches for by
 * name. Component state would make all of it one address with nothing in it.
 */

const getCityEvents = unstable_cache(
  async (cityId: string) => fetchCityEventsOrThrow(cityId),
  ["public-city-events", "v1"],
  // Short, because an organiser publishing an event expects to see it, and
  // because entries closing is time-sensitive in a way a feed post is not.
  { revalidate: 120, tags: ["city-events"] },
);

const getLiveCities = unstable_cache(async () => fetchCitiesOrThrow(), ["live-cities", "v2"], {
  revalidate: 3600,
  tags: ["city-feed"],
});

type Props = { searchParams: Promise<{ city?: string }> };

export const metadata = {
  title: "Events, tournaments and workshops",
  description:
    "Competitions, tournaments, showcases and workshops for children, by city.",
};

export default async function EventsPage({ searchParams }: Props) {
  const { city: requested } = await searchParams;

  // Caught out here, never inside the cached function: a rejected promise is
  // not cached, and an empty array is. One unreachable moment must not become
  // an hour of "no events in Pune".
  const cities = await getLiveCities().catch(() => [] as City[]);
  const selected = cities.find((c) => c.id === requested) ?? cities[0] ?? null;

  const [events, reference] = await Promise.all([
    selected ? getCityEvents(selected.id).catch(() => null) : Promise.resolve([] as Event[]),
    fetchReference(),
  ]);

  const service = (id: string | null) =>
    id ? reference.serviceCategories.find((s) => s.id === id) : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Events</p>
        <h1 className="cf-display mt-3 text-3xl text-ink">Tournaments, trials and showcases</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Competitions and workshops run by coaches and event companies near you. Anyone can look;
          you only need an account to enter one.
        </p>

        {/* Always, not only when the city is empty. This used to live in the
            no-events branch, so the single route into the organiser signup
            disappeared the moment somebody published one. */}
        <p className="mt-4 text-sm text-faint">
          Run events?{" "}
          <Link href="/signup/organiser" className="text-gold underline">
            List your company
          </Link>{" "}
          and publish your own.
        </p>

        {cities.length > 1 && (
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="City">
            {cities.map((c) => (
              <Link
                key={c.id}
                href={`/events?city=${c.id}`}
                className="cf-pill"
                data-selected={selected?.id === c.id}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <section className="mt-6">
        {!selected ? (
          <p className="cf-card p-7 text-sm text-muted">
            No cities are open yet. Once one is, what is on in it shows up here.
          </p>
        ) : events === null ? (
          // The reference-data lesson: an empty list and a failed fetch must
          // not read the same, or a reader goes looking for a problem that is
          // ours rather than theirs.
          <p className="cf-card p-7 text-sm text-muted">
            We couldn&apos;t load events just now. Refresh in a moment.
          </p>
        ) : events.length === 0 ? (
          <div className="cf-card p-7">
            <p className="text-sm text-muted">
              Nothing is on in {selected.name} yet.
            </p>
            <p className="mt-2 text-sm text-faint">
              Be the first to put something on.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => {
              const s = service(e.serviceCategoryId);
              return (
                <EventCard
                  key={e.id}
                  event={e}
                  serviceName={s?.name}
                  serviceGroup={s?.group}
                  cityName={selected.name}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
