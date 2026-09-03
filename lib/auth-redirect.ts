import type { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNextPath, withNext } from "@/lib/next-path";

type Router = ReturnType<typeof useRouter>;

// Shared by the email-OTP flow (components/AuthForm.tsx) and the Google
// OAuth callback (app/auth/callback/page.tsx) — both need the exact same
// "is this a first-time sign-up or a returning login" resolution and
// role-based redirect, since Supabase's auth events don't tell them apart.
//
// `intendedRole` comes from which entry point the user started on
// (/signup/seeker or /signup/provider vs. the generic /login). It only
// ever applies to a genuinely new account — a returning user always lands
// on their own real dashboard, never re-routed by whichever link they
// happened to click this time.
export async function resolveProfileAndRedirect(
  router: Router,
  intendedRole?: "seeker" | "provider" | "organiser",
  /**
   * Where the user was headed before they were asked to sign in — a group
   * invite, usually. Carried through role choice and profile completion, so
   * following an invite link doesn't dump them on the dashboard with the
   * invitation lost.
   */
  next?: string | null
): Promise<{ error?: string }> {
  const target = safeNextPath(next);

  // Read straight from the table. "read own profile" (auth.uid() = id) covers
  // this exactly, so the /api/auth/resolve-profile route this replaced was
  // spending the service role — and a network hop — on a query the caller was
  // always allowed to make. It also meant the mobile app could not resolve a
  // profile at all, since it has no way to reach that key and should not.
  //
  // Deliberately NOT routed through api/ either: there is no shaping, no
  // validation and no secret here, so a service in the middle would add a
  // hop that does nothing — and put the login path behind a second process's
  // uptime, which is a bad trade for nothing gained.
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { error: "Unable to sign in." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, profile_complete")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return { error: profileError.message };
  }

  const result = profile
    ? { isNew: false, role: profile.role, profileComplete: profile.profile_complete }
    : { isNew: true, role: null as string | null, profileComplete: false };

  if (result.isNew) {
    if (!intendedRole) {
      router.push(withNext("/choose-role", target));
      return {};
    }

    // upsert so a retry, a double-submit, or a magic link opened twice can't
    // fail on the profiles primary key.
    const { error: saveError } = await supabase
      .from("profiles")
      .upsert(
        { id: userData.user.id, role: intendedRole, profile_complete: false },
        { onConflict: "id" }
      );

    if (saveError) {
      return { error: saveError.message };
    }

    router.push(withNext(`/complete-profile/${intendedRole}`, target));
    return {};
  }

  if (result.role === "admin") {
    router.push("/admin");
  } else if (target && result.profileComplete) {
    // Only once they can actually act there; an incomplete profile still has
    // to be finished first, and that flow carries `next` onward itself.
    router.push(target);
  } else if (
    result.role === "seeker" ||
    result.role === "provider" ||
    result.role === "organiser"
  ) {
    router.push(
      target && !result.profileComplete
        ? withNext(`/complete-profile/${result.role}`, target)
        : "/dashboard"
    );
  } else {
    router.push("/home");
  }

  router.refresh();
  return {};
}
