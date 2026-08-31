import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin } from "@/lib/supabase-server";

// Profile editing lives in /complete-profile/{seeker,provider} — those forms
// load existing values and double as the edit screen, so /account routes there
// by role rather than keeping a second copy of the same form.
export default async function AccountIndex() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.role) {
    redirect("/choose-role");
  }

  if (profile.role === "admin") {
    redirect("/admin");
  }

  redirect(profile.role === "provider" ? "/complete-profile/provider" : "/complete-profile/seeker");
}
