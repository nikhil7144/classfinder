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
          areaId: seekerProfile.area_id || null,
          relation: seekerProfile.relation_to_learner || "",
        })
      : false;

    if ((profile.profile_complete ?? false) !== profileComplete) {
      await supabaseServerAdmin
        .from("profiles")
        .update({ profile_complete: profileComplete })
        .eq("id", userId);
    }

    const { data: area } = seekerProfile?.area_id
      ? await supabaseServerAdmin
          .from("areas")
          .select("id, name, cities(name)")
          .eq("id", seekerProfile.area_id)
          .maybeSingle()
      : { data: null };

    // What they told us they want, read back in their own words. A
    // requirement a parent cannot see is one they will never think to change,
    // and what a nine-year-old wants this September is not what they wanted
    // last September.
    const lookingForIds: string[] = seekerProfile?.looking_for || [];
    const { data: wantedServices } = lookingForIds.length
      ? await supabaseServerAdmin
          .from("service_category_master")
          .select("name")
          .in("id", lookingForIds)
          .order("name")
      : { data: [] as { name: string }[] };

    return (
      <SeekerHome
        profileComplete={profileComplete}
        requirement={
          seekerProfile
            ? {
                wants: (wantedServices || []).map((s) => s.name),
                openToOffers: seekerProfile.open_to_offers ?? false,
                relation: seekerProfile.relation_to_learner ?? null,
                learnerAge: seekerProfile.learner_age ?? null,
                level: seekerProfile.level ?? null,
                preferredDays: seekerProfile.preferred_days ?? null,
                preferredTime: seekerProfile.preferred_time ?? null,
                budgetMin: seekerProfile.budget_min ?? null,
                budgetMax: seekerProfile.budget_max ?? null,
                budgetPeriod: seekerProfile.budget_period ?? null,
                updatedAt: seekerProfile.requirement_updated_at ?? null,
              }
            : null
        }
        areaId={area?.id ?? null}
        areaName={area?.name ?? null}
        cityName={
          (Array.isArray(area?.cities) ? area?.cities[0]?.name : (area?.cities as { name: string } | undefined)?.name) ?? null
        }
      />
    );
  }

  if (userRole === "provider") {
    const { data: providerProfile } = await supabaseServerAdmin
      .from("providers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const [{ data: branches }, { data: serviceAreas }] = providerProfile
      ? await Promise.all([
          supabaseServerAdmin.from("branches").select("*").eq("provider_id", providerProfile.id),
          supabaseServerAdmin
            .from("provider_service_areas")
            .select("area_id")
            .eq("provider_id", providerProfile.id),
        ])
      : [{ data: [] }, { data: [] }];

    const profileComplete = providerProfile
      ? isProviderProfileComplete({
          providerType: providerProfile.provider_type || "",
          providerCategoryId: providerProfile.provider_category_id || null,
          displayName: providerProfile.display_name || "",
          bio: providerProfile.bio || "",
          phone: profile.phone || "",
                    helpStatement: providerProfile.help_statement || "",
          age: providerProfile.age === null || providerProfile.age === undefined ? "" : String(providerProfile.age),
          experienceYears:
            providerProfile.experience_years === null || providerProfile.experience_years === undefined
              ? ""
              : String(providerProfile.experience_years),
          feeMin: providerProfile.fee_min === null || providerProfile.fee_min === undefined ? "" : String(providerProfile.fee_min),
          feeMax: providerProfile.fee_max === null || providerProfile.fee_max === undefined ? "" : String(providerProfile.fee_max),
          feePeriod: providerProfile.fee_period || "",
          teachingPlaces: providerProfile.teaching_places || [],
          travelsToStudents:
            providerProfile.travels_to_students === null ||
            providerProfile.travels_to_students === undefined
              ? null
              : Boolean(providerProfile.travels_to_students),
          certifications: providerProfile.certifications || [],
          availability: providerProfile.availability || [],
          serviceCategoryIds: providerProfile.service_category_ids || [],
          photoUrl: providerProfile.photo_url || null,
          serviceAreaIds: (serviceAreas || []).map((a) => a.area_id),
          branches: (branches || []).map((b) => ({
            label: b.label || "",
            address: b.address || "",
            areaId: b.area_id || null,
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

    const areaNames = providerProfile
      ? await (async () => {
          const ids = [
            ...(serviceAreas || []).map((a) => a.area_id),
            ...(branches || []).map((b) => b.area_id).filter(Boolean),
          ];
          if (!ids.length) return [] as string[];
          const { data } = await supabaseServerAdmin.from("areas").select("name").in("id", ids);
          return (data || []).map((a) => a.name as string);
        })()
      : [];

    const { data: category } = providerProfile?.provider_category_id
      ? await supabaseServerAdmin
          .from("provider_category_master")
          .select("name")
          .eq("id", providerProfile.provider_category_id)
          .maybeSingle()
      : { data: null };

    return (
      <ProviderHome
        profileComplete={profileComplete}
        provider={
          providerProfile
            ? {
                id: providerProfile.id,
                display_name: providerProfile.display_name,
                provider_type: providerProfile.provider_type,
                approved: providerProfile.approved,
                is_suspended: providerProfile.is_suspended,
                is_featured: providerProfile.is_featured,
                fee_min: providerProfile.fee_min,
                fee_max: providerProfile.fee_max,
                fee_period: providerProfile.fee_period,
                photo_url: providerProfile.photo_url,
                categoryName: category?.name ?? null,
                serviceCount: (providerProfile.service_category_ids || []).length,
                areaNames: Array.from(new Set(areaNames)),
                branchCount: (branches || []).length,
                availabilityCount: (providerProfile.availability || []).length,
              }
            : null
        }
      />
    );
  }

  return (
    <div className="p-10">
      <h1>Dashboard</h1>
      <p>Role not recognized.</p>
    </div>
  );
}
