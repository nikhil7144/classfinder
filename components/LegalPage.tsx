import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * The shared shell for /privacy and /terms.
 *
 * Legal text is read by someone looking for one specific answer, so every
 * section gets an id and the contents list at the top links straight to it.
 * Narrow measure, no cards: this is a document, not a dashboard.
 */

export type LegalSection = {
  id: string;
  heading: string;
  /** Paragraphs. Plain strings; each renders as its own <p>. */
  body: string[];
  /** Optional bullets under the paragraphs. */
  bullets?: string[];
};

type Props = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export default function LegalPage({ eyebrow, title, updated, intro, sections }: Props) {
  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <p className="cf-eyebrow">{eyebrow}</p>
        <h1 className="cf-display mt-3 text-[clamp(2rem,4.6vw,2.8rem)] leading-[1.1] text-ink">
          {title}
        </h1>
        <p className="mt-3 font-mono text-xs tracking-wider text-faint">Last updated {updated}</p>
        <p className="mt-6 leading-relaxed text-muted">{intro}</p>

        <nav aria-label="Contents" className="mt-10 rounded-2xl border border-line bg-surface p-6">
          <p className="cf-eyebrow">Contents</p>
          <ol className="mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={`#${s.id}`}
                  className="text-sm text-muted transition hover:text-ink"
                >
                  <span className="font-mono text-xs text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {s.heading}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-4">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line py-8">
              <h2 className="font-display text-lg font-bold text-ink">{s.heading}</h2>
              {s.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-3 leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-4 grid list-none gap-2 p-0">
                  {s.bullets.map((b) => (
                    <li key={b.slice(0, 40)} className="flex gap-3 leading-relaxed text-muted">
                      <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="border-t border-line pt-8 text-sm text-faint">
          {BRAND.name} is run by {BRAND.legalName}.
        </p>
      </div>
    </main>
  );
}
