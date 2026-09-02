import { redirect } from "next/navigation";

/**
 * Groups were half of the demand a coach could act on, and lived on their own
 * screen. Phase 2R put them next to the families who post alone, because a
 * coach deciding where to spend an evening is asking one question, not two —
 * and a Groups tab that reads "no groups right now" while three families down
 * the road are looking is the worst version of that.
 *
 * Kept as a redirect rather than deleted: the link is in sent notification
 * emails and in coaches' browser history.
 */
export default function ProviderGroupsPage() {
  redirect("/students");
}
