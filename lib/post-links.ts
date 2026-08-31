export function slugifyStartupName(name?: string | null) {
  return (name || "startup")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "startup";
}

export function getStartupPostPath(startupName: string | null | undefined, postId: string) {
  return `/${slugifyStartupName(startupName)}/post/${postId}`;
}

export function isLongPost(description?: string | null, limit = 160) {
  return Boolean(description && description.trim().length > limit);
}
