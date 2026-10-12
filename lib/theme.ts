/**
 * Theme selection — the one place that knows how a visitor's choice becomes a
 * ground colour.
 *
 * Three modes are stored, not two. "auto" is a real, persisted choice meaning
 * "follow the operating system", and it is distinct from having picked light
 * or dark outright: someone on auto should track their laptop when it swings
 * at sunset, and someone who picked dark should not. Collapsing them into a
 * boolean loses that, which is why the stored value is a mode and the painted
 * value is resolved from it.
 *
 * The clock is deliberately not consulted. The OS already runs a day/night
 * schedule on every platform a parent is likely to hold, it is tied to their
 * actual sunset rather than a hour we guessed, and it is the setting they
 * already changed once when they wanted dark evenings. A second, separate
 * sunset baked into the site would only disagree with it.
 */

export type ThemeMode = "light" | "dark" | "auto";
/** What actually gets stamped on <html>. "auto" never reaches the DOM. */
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "cf-theme";

/** Order is the order the segmented control renders in. */
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"];

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

function isMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "auto";
}

/**
 * The OS preference.
 *
 * Queried as prefers-color-scheme: light rather than : dark so that a browser
 * reporting no preference at all falls through to dark, which is the brand
 * default and what globals.css paints with no attribute present. Asking for
 * dark instead would hand those visitors light and disagree with the CSS.
 */
export function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "auto" ? systemTheme() : mode;
}

export function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isMode(stored) ? stored : "auto";
  } catch {
    // Private windows and blocked site data both throw on access rather than
    // returning null. Auto is the right answer when we cannot know.
    return "auto";
  }
}

export function writeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Not fatal: the theme still applies for this page view, it just will not
    // survive a reload. Better than refusing to switch.
  }
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ---------------------------------------------------------------------
   The mode, as an external store.

   localStorage, the OS preference and the data-theme attribute are all state
   that lives outside React, so this is a store React subscribes to rather
   than state React owns. That keeps every side effect of a theme change in
   one place — the write, the repaint, the other tabs — and leaves the toggle
   presentational, with no effect of its own to read the stored value back on
   mount.
   --------------------------------------------------------------------- */

const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function handleStorage(e: StorageEvent): void {
  // A null key means the whole store was cleared, which includes ours.
  if (e.key !== null && e.key !== THEME_KEY) return;
  applyTheme(resolveTheme(readMode()));
  notify();
}

function handleSystemChange(): void {
  // Only auto tracks the OS. Someone who explicitly chose dark has said they
  // want dark at noon too, so their choice survives the system flipping.
  if (readMode() === "auto") applyTheme(systemTheme());
}

export function subscribeMode(onChange: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorage);
    mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", handleSystemChange);
  }
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
      mediaQuery?.removeEventListener("change", handleSystemChange);
      mediaQuery = null;
    }
  };
}

/** The whole of a theme change: persist it, paint it, tell every subscriber. */
export function setMode(mode: ThemeMode): void {
  writeMode(mode);
  applyTheme(resolveTheme(mode));
  notify();
}

/**
 * Null, deliberately, and only on the server.
 *
 * The server cannot know a stored choice, so there is no honest mode to
 * report. Null renders the control with no segment pressed for exactly one
 * frame; React then re-renders with the real snapshot after hydration. The
 * alternative — guessing a mode server-side — is either a hydration mismatch
 * or a highlight that visibly jumps to a different segment. The ground itself
 * is already right regardless: ThemeScript set it before first paint.
 */
export function getServerMode(): ThemeMode | null {
  return null;
}

/**
 * The blocking inline script, built from the constants above so the key and
 * the fallback cannot drift from the module that reads them later.
 *
 * It has to be inline and synchronous. Anything deferred — an effect, a
 * module script, next/script — runs after first paint, and the visitor sees
 * the default ground flash to their real one. This runs while the parser is
 * still blocked and the body has not been painted, so there is nothing to
 * flash.
 */
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});var m=(s==="light"||s==="dark"||s==="auto")?s:"auto";var t=m==="auto"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
