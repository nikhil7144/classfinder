import { redirect } from "next/navigation";
import GuestHome from "@/components/GuestHome";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin } from "@/lib/supabase-server";

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A magic link (or any auth that skips the in-app OTP step) lands here
  // already signed in but with no profile row yet. Without this the page
  // shows signup buttons to someone who is already signed in, and they end
  // up stuck. Send them to pick a role instead.
  if (user) {
    const { data: profile } = await supabaseServerAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.role) {
      redirect("/choose-role");
    }
  }

  return <GuestHome />;
}
