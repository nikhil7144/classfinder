"use client";

type PageSkeletonProps = {
  variant?: "dashboard" | "detail" | "list";
};

/**
 * What a page looks like while it loads.
 *
 * This was inherited whole from MentBridge and was still light: white cards on
 * a grey ground with slate-200 blocks. Against this product's charcoal that is
 * not a subtle shimmer, it is a white screen on every navigation.
 *
 * The blocks sit one step above the card they lie on — surface-3 on surface —
 * so the pulse reads as texture rather than as content that has arrived. No
 * shadows: this design system separates with borders, and a shadow tuned for a
 * white page does nothing on a dark one.
 */

/** A card the skeleton lays its blocks on. */
const panel = "rounded-3xl border border-line bg-surface";

/** One loading block. Subtle by design — see the note above. */
const shimmer = "animate-pulse rounded-2xl bg-surface-3";

export default function PageSkeleton({ variant = "dashboard" }: PageSkeletonProps) {
  if (variant === "detail") {
    return (
      <div className="min-h-screen bg-bg py-10">
        <div className="mx-auto max-w-6xl space-y-8 px-6">
          <div className={`${panel} p-8`}>
            <div className="grid items-center gap-8 md:grid-cols-[160px_1fr]">
              <div className={`${shimmer} h-36 w-36 rounded-full`} />
              <div className="space-y-4">
                <div className={`${shimmer} h-6 w-32`} />
                <div className={`${shimmer} h-12 w-72`} />
                <div className={`${shimmer} h-5 w-full max-w-2xl`} />
                <div className="flex flex-wrap gap-3">
                  <div className={`${shimmer} h-10 w-28 rounded-full`} />
                  <div className={`${shimmer} h-10 w-40 rounded-full`} />
                  <div className={`${shimmer} h-10 w-32 rounded-full`} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-line bg-surface p-6">
                <div className={`${shimmer} h-4 w-24`} />
                <div className={`${shimmer} mt-3 h-6 w-32`} />
              </div>
            ))}
          </div>

          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`${panel} p-8`}>
              <div className={`${shimmer} h-6 w-44`} />
              <div className={`${shimmer} mt-5 h-4 w-full`} />
              <div className={`${shimmer} mt-3 h-4 w-11/12`} />
              <div className={`${shimmer} mt-3 h-4 w-9/12`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className={`${panel} p-8`}>
          <div className={`${shimmer} h-5 w-28`} />
          <div className={`${shimmer} mt-4 h-10 w-72`} />
          <div className={`${shimmer} mt-4 h-4 w-full max-w-3xl`} />
        </div>

        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`${panel} p-8`}>
            <div className="grid gap-6 lg:grid-cols-[110px_1fr]">
              <div className={`${shimmer} h-24 w-24 rounded-2xl`} />
              <div>
                <div className={`${shimmer} h-8 w-52`} />
                <div className={`${shimmer} mt-4 h-4 w-full`} />
                <div className={`${shimmer} mt-3 h-4 w-10/12`} />
                <div className="mt-5 flex flex-wrap gap-2">
                  <div className={`${shimmer} h-8 w-24 rounded-full`} />
                  <div className={`${shimmer} h-8 w-28 rounded-full`} />
                  <div className={`${shimmer} h-8 w-20 rounded-full`} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <div className={`${panel} p-8`}>
        <div className={`${shimmer} h-5 w-36`} />
        <div className={`${shimmer} mt-4 h-10 w-72`} />
        <div className={`${shimmer} mt-4 h-4 w-full max-w-3xl`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className={`${panel} p-6`}>
          <div className={`${shimmer} h-4 w-24`} />
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={`${shimmer} mt-4 h-10 w-full`} />
          ))}
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`${panel} p-8`}>
              <div className="grid gap-6 lg:grid-cols-[110px_1fr]">
                <div className={`${shimmer} h-24 w-24 rounded-full`} />
                <div>
                  <div className={`${shimmer} h-8 w-56`} />
                  <div className={`${shimmer} mt-4 h-4 w-full`} />
                  <div className={`${shimmer} mt-3 h-4 w-10/12`} />
                  <div className="mt-5 flex flex-wrap gap-2">
                    <div className={`${shimmer} h-8 w-24 rounded-full`} />
                    <div className={`${shimmer} h-8 w-32 rounded-full`} />
                    <div className={`${shimmer} h-8 w-20 rounded-full`} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
