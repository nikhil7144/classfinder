import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Stamps the resolved theme on <html> before the first paint.
 *
 * Rendered as the first child of <body> so the parser hits it before any
 * markup below it is painted. A server component on purpose: the HTML it
 * emits is the script itself, and shipping it as a client component would
 * mean running it after hydration, which is exactly the flash it exists to
 * prevent.
 *
 * Because it mutates <html> before React hydrates, the root <html> carries
 * suppressHydrationWarning — the server cannot know a visitor's stored choice
 * and so always renders the attribute absent.
 */
export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
