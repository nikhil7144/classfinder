import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * The page for a URL that does not exist.
 *
 * Its other job is the status code. Without a not-found boundary of its own,
 * this app answered notFound() with the 404 page and a 200 — a soft 404, which
 * a search engine reads as "this page is real" and indexes. On a site whose
 * coach and area pages are generated from slugs, that is every mistyped slug
 * in the index.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="cf-card w-full max-w-md p-8 text-center">
        <p className="cf-eyebrow">404</p>
        <h1 className="cf-display mt-4 mb-2 text-3xl text-ink">This page isn&apos;t here</h1>
        <p className="text-sm leading-relaxed text-muted">
          The link may be old, or the coach may have taken their listing down.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/search" className="cf-btn-primary">
            Find classes
          </Link>
          <Link href="/" className="cf-btn-ghost">
            {BRAND.name} home
          </Link>
        </div>
      </div>
    </main>
  );
}
