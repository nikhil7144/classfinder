import { redirect } from "next/navigation";
import ProviderProfileForm from "@/components/provider/ProviderProfileForm";
import SeekerProfileForm from "@/components/seeker/SeekerProfileForm";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin } from "@/lib/supabase-server";

// Editing lives inside the account section so the left menu stays put.
// Saving keeps the user here rather than throwing them to the dashboard.
export default async function AccountProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.role) redirect("/choose-role");
  if (profile.role === "admin") redirect("/admin");

  return (
    <div>
      <header className="cf-card mb-5 p-7">
        <p className="cf-eyebrow">Profile</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">
          {profile.role === "provider" ? "Your listing" : "Your details"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {profile.role === "provider"
            ? "What parents see when they find you. Changes save when you press Save at the bottom."
            : "Used when you get in touch with a coach or tutor."}
        </p>
      </header>

      {profile.role === "provider" ? (
        <ProviderProfileForm redirectTo={null} variant="account" />
      ) : (
        <SeekerProfileForm redirectTo={null} variant="account" />
      )}
    </div>
  );
}
