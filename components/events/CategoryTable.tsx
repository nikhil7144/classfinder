import Link from "next/link";
import type { EventCategory } from "@/lib/api/events";
import { formatAges, formatCapacity, formatFee, isFull } from "@/lib/events";

/**
 * What a family actually enters, priced.
 *
 * Laid out as a stack of stubs rather than a table: on a phone a five-column
 * table of category, type, ages, places and fee becomes a horizontal scroll,
 * and the fee — the number the decision turns on — is the column that ends up
 * off-screen.
 */
export default function CategoryTable({
  categories,
  eventId,
  canEnter = false,
}: {
  categories: EventCategory[];
  eventId: string;
  /** Whether entries are open — decided once, by `entryState`, on the page. */
  canEnter?: boolean;
}) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted">
        The organiser hasn&apos;t listed entry categories yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {categories.map((c) => {
        const ages = formatAges(c.minAge, c.maxAge);
        const full = isFull(c.capacity, c.entriesCount);

        return (
          <li
            key={c.id}
            className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface-2 p-4"
          >
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-ink">{c.name}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  {c.entryType === "team" ? `Team of ${c.teamSize}` : "Individual"}
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
                <span className={full ? "text-warn" : undefined}>
                  {formatCapacity(c.capacity, c.entriesCount)}
                </span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-bold text-ink">{formatFee(c.feeAmount)}</p>
              {c.entryType === "team" && c.feeAmount !== null && c.feeAmount > 0 && (
                <p className="text-[0.7rem] text-faint">per team</p>
              )}

              {canEnter &&
                (full ? (
                  <span className="mt-2 block text-xs text-faint">No places left</span>
                ) : (
                  <Link
                    href={`/events/${eventId}/enter/${c.id}`}
                    className="cf-btn-primary mt-2 px-4 py-1.5 text-xs"
                  >
                    Enter
                  </Link>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
