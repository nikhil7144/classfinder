"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

type Props = {
  providerId: string;
  displayName: string | null;
};

/**
 * The coach's own link, and the two ways they will actually send it.
 *
 * On day one a coach has contacts and a search engine has never heard of this
 * site. The listing that gets seen is the one pasted into a school parents'
 * group, so the fastest thing this product can do for a new coach is make that
 * paste easy and make the card it produces look like them — which is what the
 * generateMetadata block on the profile page is for.
 *
 * Deliberately rendered only for a listing that is actually live. An
 * unapproved or suspended coach's page is hidden by get_provider_profile and
 * answers notFound(), so offering a share button before then would hand a
 * coach a link to a 404 and let them send it to thirty parents.
 */
export default function ShareListing({ providerId, displayName }: Props) {
  const [copied, setCopied] = useState(false);

  // The host they are actually on, the way groupShareUrl does it — not
  // BRAND.siteUrl. A link a coach copies and sends is the one thing here that
  // must never depend on an environment variable being set correctly, and
  // window.location cannot be wrong about where they are.
  const url =
    typeof window === "undefined"
      ? `${BRAND.siteUrl}/provider/${providerId}`
      : `${window.location.origin}/provider/${providerId}`;
  const name = displayName?.trim() || "my classes";
  const message = `${name} on ${BRAND.name} — classes, fees and timings: ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is refused in a few mobile browsers and over plain
      // http. The link is on screen either way, so there is something to fall
      // back to without an error message that helps nobody.
      setCopied(false);
    }
  };

  // The OS share sheet where there is one — it reaches WhatsApp, SMS and every
  // parents' group in one tap. The explicit WhatsApp link below stays for
  // desktop, where no such sheet exists.
  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, text: message, url });
        return;
      } catch {
        // Dismissing the sheet throws. Not an error, and not worth reporting.
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <section className="cf-card p-7">
      <h2 className="cf-display text-lg text-ink">Share your page</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Send this to parents you already know, or post it in a school or society group. It
        shows your photo, what you teach, your fees and your timings.
      </p>

      <p className="mt-5 truncate rounded-2xl border border-line bg-surface-2 px-4 py-3 font-mono text-sm text-ink">
        {url}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={share} className="cf-btn-primary">
          Share
        </button>
        <button type="button" onClick={copy} className="cf-btn-ghost">
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={`/provider/${providerId}`}
          target="_blank"
          rel="noreferrer"
          className="cf-btn-ghost"
        >
          See what parents see
        </a>
      </div>
    </section>
  );
}
