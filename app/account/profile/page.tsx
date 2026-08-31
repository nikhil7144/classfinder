"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import VeteranProfile from "@/components/profile/VeteranProfile";
import StartupProfile from "@/components/profile/StartupProfile";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { normalizeWeeklyAvailability } from "@/lib/veteran-availability";

type ProfileData = Record<string, unknown> | null;
type RoleRecord = {
  role: string;
};

type VeteranRecord = Record<string, unknown> & {
  expertise_ids?: string[] | null;
  availability_schedule?: unknown;
};

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        const user = sessionData.session?.user;

        if (!user) {
          router.push("/login");
          return;
        }

        const uid = user.id;

        if (isActive) {
          setUserEmail(user.email || "");
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single<RoleRecord>();

        if (profileError) {
          throw profileError;
        }

        if (!profile) {
          if (isActive) {
            setLoading(false);
          }
          return;
        }

        if (isActive) {
          setRole(profile.role);
        }

        if (profile.role === "veteran") {
          const { data, error } = await supabase
            .from("veterans")
            .select("*")
            .eq("user_id", uid)
            .maybeSingle<VeteranRecord>();

          if (error) {
            throw error;
          }

          const veteranData = data
            ? {
                ...data,
                availability_schedule: normalizeWeeklyAvailability(data.availability_schedule),
              }
            : null;

          if (veteranData?.expertise_ids?.length) {
            const { data: expertise, error: expertiseError } = await supabase
              .from("expertise_master")
              .select("id,name")
              .in("id", veteranData.expertise_ids);

            if (expertiseError) {
              throw expertiseError;
            }

            const expertiseNames = expertise?.map((item) => item.name) || [];

            if (isActive) {
              setProfileData({
                ...veteranData,
                expertise_names: expertiseNames,
              });
            }
          } else if (isActive) {
            setProfileData(veteranData);
          }
        }

        if (profile.role === "startup") {
          const { data, error } = await supabase
            .from("startups")
            .select("*")
            .eq("user_id", uid)
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (isActive) {
            setProfileData(data);
          }
        }
      } catch (error) {
        console.error("Unable to load account profile:", error);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [router]);

  if (loading) return <PageSkeleton variant="detail" />;

  if (!role) return <div className="p-10">No profile found.</div>;
  if (!profileData) {
    const completionHref =
      role === "veteran" ? "/complete-profile/veteran" : "/complete-profile/startup";

    return (
      <div className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_55%,_#eff6ff_100%)] p-10 shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
          Profile Setup
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
          Profile not completed
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          Your account is active, but your {role} profile has not been completed yet. Finish it
          now so your account page can show your full details.
        </p>
        <button
          type="button"
          onClick={() => router.push(completionHref)}
          className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Complete Profile
        </button>
      </div>
    );
  }

  if (role === "veteran") {
    return (
      <VeteranProfile
        data={profileData}
        email={userEmail}
      />
    );
  }

  if (role === "startup") {
    return (
      <StartupProfile
        data={profileData}
        email={userEmail}
      />
    );
  }

  return null;
}
