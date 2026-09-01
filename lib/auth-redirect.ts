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
  accessToken: string,
  intendedRole?: "seeker" | "provider",
  /**
   * Where the user was headed before they were asked to sign in — a group
   * invite, usually. Carried through role choice and profile completion, so
   * following an invite link doesn't dump them on the dashboard with the
   * invitation lost.
   */
  next?: string | null
): Promise<{ error?: string }> {
  const target = safeNextPath(next);
  const response = await fetch("/api/auth/resolve-profile", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    return { error: result.error || "Unable to sign in." };
  }

  if (result.isNew) {
    if (!intendedRole) {
      router.push(withNext("/choose-role", target));
      return {};
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return { error: "Something went wrong — try again." };
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

    router.push(
      withNext(
        intendedRole === "seeker" ? "/complete-profile/seeker" : "/complete-profile/provider",
        target
      )
    );
    return {};
  }

  if (result.role === "admin") {
    router.push("/admin");
  } else if (target && result.profileComplete) {
    // Only once they can actually act there; an incomplete profile still has
    // to be finished first, and that flow carries `next` onward itself.
    router.push(target);
  } else if (result.role === "seeker" || result.role === "provider") {
    router.push(
      target && !result.profileComplete
        ? withNext(
            result.role === "seeker" ? "/complete-profile/seeker" : "/complete-profile/provider",
            target
          )
        : "/dashboard"
    );
  } else {
    router.push("/home");
  }

  router.refresh();
  return {};
}
