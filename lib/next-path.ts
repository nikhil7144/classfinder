/**
 * Where to send someone after they sign in or finish their profile.
 *
 * Only same-origin paths are honoured. A `next` value arrives from the URL, so
 * accepting anything else would let a crafted link bounce a freshly
 * authenticated user to another site — an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  // must be a rooted path, and "//host" is protocol-relative, not local
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

/** Append a next param to a URL, encoded. */
export function withNext(base: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${base}${base.includes("?") ? "&" : "?"}next=${encodeURIComponent(safe)}` : base;
}
