import { redirect } from "next/navigation";

// Dynamic, or Next prerenders this and the redirect never evaluates per
// request — it returned 200 with the layout but no tab content.
export const dynamic = "force-dynamic";

// The account section's landing tab. Redirecting within /account keeps the
// left menu mounted; redirecting out of it made the sidebar flash and vanish.
export default function AccountIndex() {
  redirect("/account/profile");
}
