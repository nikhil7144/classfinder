export function slugifyNewsTitle(title?: string | null) {
  return (title || "startup-news")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "startup-news";
}

export function getStartupNewsPath(id: string, title?: string | null) {
  return `/startup/news/${id}-${slugifyNewsTitle(title)}`;
}

export function extractNewsIdFromSlug(slug: string) {
  const uuidMatch = slug.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );

  return uuidMatch?.[0] || slug;
}

export function createNewsExcerpt(content?: string | null, maxLength = 180) {
  const safeContent = (content || "").trim();

  if (!safeContent) return "";
  if (safeContent.length <= maxLength) return safeContent;

  return `${safeContent.slice(0, maxLength).trim()}...`;
}
