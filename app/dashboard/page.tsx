import { redirect } from "next/navigation";
import SeekerHome from "@/components/SeekerHome";
import ProviderHome from "@/components/ProviderHome";
import { isSeekerProfileComplete, isProviderProfileComplete } from "@/lib/profile-rules";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { supabaseServerAdmin } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;

  const { data: profile } = await supabaseServerAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/choose-role");
  }

  const userRole = (profile.role || "").toLowerCase();

  if (userRole === "admin") {
    redirect("/admin");
  }

  if (userRole === "seeker") {
    const { data: seekerProfile } = await supabaseServerAdmin
      .from("seekers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const profileComplete = seekerProfile
      ? isSeekerProfileComplete({
          name: seekerProfile.name || "",
          phone: profile.phone || "",
          city: seekerProfile.city || "",
        })
      : false;

    if ((profile.profile_complete ?? false) !== profileComplete) {
      await supabaseServerAdmin
        .from("profiles")
        .update({ profile_complete: profileComplete })
        .eq("id", userId);
    }

    return <SeekerHome profileComplete={profileComplete} />;
  }

  if (userRole === "provider") {
    const { data: providerProfile } = await supabaseServerAdmin
      .from("providers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: branches } = providerProfile
      ? await supabaseServerAdmin
          .from("branches")
          .select("*")
          .eq("provider_id", providerProfile.id)
      : { data: [] };

    const profileComplete = providerProfile
      ? isProviderProfileComplete({
          providerType: providerProfile.provider_type || "",
          providerCategoryId: providerProfile.provider_category_id || null,
          displayName: providerProfile.display_name || "",
          bio: providerProfile.bio || "",
          phone: profile.phone || "",
          city: providerProfile.city || "",
          serviceCategoryIds: providerProfile.service_category_ids || [],
          photoUrl: providerProfile.photo_url || null,
          branches: (branches || []).map((b) => ({
            label: b.label || "",
            address: b.address || "",
            city: b.city || "",
            area: b.area || "",
            phone: b.phone || "",
          })),
        })
      : false;

    if ((profile.profile_complete ?? false) !== profileComplete) {
      await supabaseServerAdmin
        .from("profiles")
        .update({ profile_complete: profileComplete })
        .eq("id", userId);
    }

    return <ProviderHome profileComplete={profileComplete} providerType={providerProfile?.provider_type || null} />;
  }

  return (
    <div className="p-10">
      <h1>Dashboard</h1>
      <p>Role not recognized.</p>
    </div>
  );
}
