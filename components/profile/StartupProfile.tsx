"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type StartupProfileData = {
  logo_url?: string | null;
  startup_name?: string | null;
  headline?: string | null;
  description?: string | null;
  industry_ids?: string[] | null;
  stage_id?: string | null;
  founded_year?: string | number | null;
  team_size?: string | number | null;
  location?: string | null;
  looking_for_advisors?: boolean | null;
  offering_equity?: boolean | null;
  website_url?: string | null;
  website?: string | null;
};

function getWebsiteHref(websiteUrl?: string | null, website?: string | null) {
  const rawValue = (websiteUrl || website || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  return `https://${rawValue}`;
}

export default function StartupProfile({
  data,
  email,
}: {
  data: StartupProfileData;
  email: string;
}) {
  const router = useRouter();
  const [industryNames, setIndustryNames] = useState<string[]>([]);
  const [stageName, setStageName] = useState("");
  const websiteHref = getWebsiteHref(data?.website_url, data?.website);

  useEffect(() => {
    const loadProfileMeta = async () => {
      if (data?.industry_ids?.length) {
        const { data: industries } = await supabase
          .from("industry_master")
          .select("id, name")
          .in("id", data.industry_ids);

        if (industries) {
          setIndustryNames(industries.map((i) => i.name));
        }
      } else {
        setIndustryNames([]);
      }

      if (data?.stage_id) {
        const { data: stage } = await supabase
          .from("startup_stages")
          .select("name")
          .eq("id", data.stage_id)
          .maybeSingle();

        setStageName(stage?.name || "");
      } else {
        setStageName("");
      }
    };

    loadProfileMeta();
  }, [data]);

  return (
  <div className="mx-auto max-w-6xl space-y-10 py-8 lg:py-16">

    {/* ===== ELITE HERO + ABOUT CONTAINER ===== */}
    <div className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)] sm:p-8 lg:p-12">

      {/* subtle background glow */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />

      <div className="relative z-10 space-y-10">

        {/* HERO SECTION */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">

            {/* LOGO */}
           
 {data?.logo_url ? (
  <img
    src={data?.logo_url || "/placeholder-logo.png"}
    alt="Startup Logo"
    className="w-28 h-28 object-contain rounded-xl border bg-white p-2"
  />
) : (
  <img
    src="/placeholder-logo.png"
    alt="Startup Logo"
    className="w-28 h-28 object-contain rounded-xl border bg-white p-2"
  />
)}
          

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {data?.startup_name || "Startup Name"}
              </h1>

              <p className="text-lg text-gray-500 mt-2">
                {data?.headline || "Add a compelling introduction"}
              </p>

              <p className="text-sm text-gray-400 mt-3">
                {email}
              </p>
            </div>
          </div>

          <button
            onClick={() =>
              router.push("/complete-profile/startup?edit=true")
            }
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-white shadow-md transition hover:bg-indigo-700 hover:shadow-lg sm:w-auto"
          >
            Edit Profile
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200" />

        {/* ABOUT */}
        {data?.description && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              About
            </h2>
            <p className="text-gray-600 leading-relaxed text-[15px] max-w-4xl">
              {data.description}
            </p>
          </div>
        )}

      </div>
    </div>

    {/* ===== METRICS GRID (UNCHANGED LOGIC) ===== */}
    <div className="grid gap-6 md:grid-cols-2 lg:gap-8">

      <InfoBlock label="Stage">
        {stageName || "Not set"}
      </InfoBlock>

      <InfoBlock label="Industry">
        {industryNames.length
          ? industryNames.join(", ")
          : "Not set"}
      </InfoBlock>

      <InfoBlock label="Founded">
        {data?.founded_year || "Not set"}
      </InfoBlock>

      <InfoBlock label="Team Size">
        {data?.team_size || "Not set"}
      </InfoBlock>

      <InfoBlock label="Location">
        {data?.location || "Not set"}
      </InfoBlock>

      <InfoBlock label="Hiring Advisors">
        {data?.looking_for_advisors ? (
          <span className="text-green-600 font-medium">
            Yes
          </span>
        ) : (
          "No"
        )}
      </InfoBlock>

      <InfoBlock label="Offering Equity">
        {data?.offering_equity ? (
          <span className="text-indigo-600 font-medium">
            Yes
          </span>
        ) : (
          "No"
        )}
      </InfoBlock>

      <InfoBlock label="Website">
        {websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Visit Website
          </a>
        ) : (
          "Not set"
        )}
      </InfoBlock>

    </div>
  </div>
);
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition duration-200">
      <p className="text-sm text-gray-500 mb-2">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-800">
        {children}
      </p>
    </div>
  );
}
