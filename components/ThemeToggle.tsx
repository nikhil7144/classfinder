"use client";

import { useSyncExternalStore } from "react";
import {
  getServerMode,
  readMode,
  setMode,
  subscribeMode,
  THEME_LABEL,
  THEME_MODES,
  type ThemeMode,
} from "@/lib/theme";

function Icon({ mode }: { mode: ThemeMode }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (mode === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }

  // Auto: a dial half-filled, which reads as "neither of those, follow
  // something else" in a way a letter A or a monitor glyph does not at 15px.
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Light / Dark / Auto, as a segmented control.
 *
 * All three are offered rather than one cycling button: a two-state switch
 * cannot express "follow my system" at all, and a cycling button hides where
 * you are in the cycle until you have already pressed it.
 *
 * Every side effect of a change — persisting it, repainting <html>, following
 * the OS while on auto, catching a change made in another tab — belongs to the
 * store in lib/theme.ts. This renders it and nothing else.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useSyncExternalStore(subscribeMode, readMode, getServerMode);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5 ${className}`}
    >
      {THEME_MODES.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={active}
            title={`${THEME_LABEL[m]} theme`}
            className={`cursor-pointer rounded-full p-1.5 transition ${
              active
                ? "bg-surface-3 text-ink"
                : "text-faint hover:bg-surface-3/60 hover:text-ink"
            }`}
          >
            <Icon mode={m} />
            <span className="sr-only">{THEME_LABEL[m]} theme</span>
          </button>
        );
      })}
    </div>
  );
}
