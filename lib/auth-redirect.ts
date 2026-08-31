import type { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
  intendedRole?: "seeker" | "provider"
): Promise<{ error?: string }> {
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
      router.push("/choose-role");
      return {};
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return { error: "Something went wrong — try again." };
    }

    const { error: insertError } = await supabase.from("profiles").insert({
      id: userData.user.id,
      role: intendedRole,
      profile_complete: false,
    });

    if (insertError) {
      return { error: insertError.message };
    }

    router.push(intendedRole === "seeker" ? "/complete-profile/seeker" : "/complete-profile/provider");
    return {};
  }

  if (result.role === "admin") {
    router.push("/admin");
  } else if (result.role === "seeker" || result.role === "provider") {
    router.push("/dashboard");
  } else {
    router.push("/home");
  }

  router.refresh();
  return {};
}
