export function slugifyBlogSegment(value?: string | null, fallback = "blog") {
  return (value || fallback)
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function getBlogPath(readerTypeSlug?: string | null, headline?: string | null) {
  return `/blog/for/${slugifyBlogSegment(readerTypeSlug, "general-readers")}/learning/${slugifyBlogSegment(
    headline,
    "blog"
  )}`;
}

export function createBlogExcerpt(content?: string | null, maxLength = 180) {
  const stripped = stripHtml(content || "").trim();

  if (!stripped) return "";
  if (stripped.length <= maxLength) return stripped;

  return `${stripped.slice(0, maxLength).trim()}...`;
}

export function stripHtml(content: string) {
  return content.replace(/<[^>]*>/g, " ");
}

export function sanitizeBlogHtml(content?: string | null) {
  const safeContent = (content || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

  return safeContent;
}

export function normalizeBlogContentHtml(content?: string | null) {
  const normalized = (content || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) return "";

  const hasBlockHtml = /<(p|div|section|article|ul|ol|li|blockquote|pre|table|h[1-6])\b/i.test(
    normalized
  );

  if (hasBlockHtml) {
    return normalized;
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function insertTagAroundSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string
) {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const replacement = `${before}${selectedText || "text"}${after}`;

  return `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
}
