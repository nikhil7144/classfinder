"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageSkeleton from "@/components/ui/PageSkeleton";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type Startup = {
  id: string;
  startup_name: string;
  headline?: string | null;
  logo_url?: string | null;
  short_headline: string;
  description: string;
  industry_ids: string[] | null;
  stage_id: string | null;
  looking_for_advisors?: boolean;
  offering_equity?: boolean;
};

type IndustryMaster = {
  id: string;
  name: string;
};

type StageMaster = {
  id: string;
  name: string;
};

type EnrichedStartup = Startup & {
  industryNames: string[];
  stageName: string;
};

type AssociationRequest = {
  id: string;
  message?: string | null;
  startups?: {
    startup_name?: string | null;
  } | null;
};

const filterButtonClass = (active: boolean) =>
  `rounded-xl px-4 py-3 text-sm transition ${
    active
      ? "bg-indigo-600 text-white shadow-sm"
      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
  }`;

const sidebarFilterClass = (active: boolean) =>
  `w-full rounded-xl px-3 py-2 text-left text-sm transition ${
    active
      ? "bg-indigo-50 text-indigo-700 font-medium"
      : "text-gray-600 hover:bg-gray-50"
  }`;

const pillClass = "rounded-full px-3 py-1 text-xs font-medium";

function getInitials(name?: string | null) {
  return (name || "Startup")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function normalizeLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;

  if (logoUrl.startsWith("/storage/v1/object/public/") && supabaseUrl) {
    return `${supabaseUrl}${logoUrl}`;
  }

  const cleanedPath = logoUrl
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/startup-logos\/?/, "")
    .replace(/^startup-logos\/?/, "");

  if (!cleanedPath || !supabaseUrl) return null;

  const encodedPath = cleanedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/startup-logos/${encodedPath}`;
}

function StartupLogo({
  startupName,
  logoUrl,
}: {
  startupName?: string | null;
  logoUrl?: string | null;
}) {
  const [hasError, setHasError] = useState(false);
  const resolvedLogoUrl = normalizeLogoUrl(logoUrl);

  if (!resolvedLogoUrl || hasError) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-base font-semibold text-slate-700">
        {getInitials(startupName)}
      </div>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={startupName || "Startup logo"}
      className="h-16 w-16 object-contain rounded-2xl bg-white p-2"
      onError={() => setHasError(true)}
    />
  );
}

export default function VeteranHome({
  startups,
  profileComplete,
}: {
  startups: Startup[];
  profileComplete: boolean;
}) {
  const router = useRouter();

  const [industryList, setIndustryList] = useState<IndustryMaster[]>([]);
  const [stageList, setStageList] = useState<StageMaster[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<string | null>(null);

  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [showFollowing, setShowFollowing] = useState(false);

  const [activeTab, setActiveTab] = useState("discover");
  const [requests, setRequests] = useState<AssociationRequest[]>([]);

  const [enrichedStartups, setEnrichedStartups] = useState<EnrichedStartup[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);

      const { data: industries } = await supabase.from("industry_master").select("*");
      const { data: stages } = await supabase.from("startup_stages").select("*");

      const safeIndustries = (industries as IndustryMaster[]) || [];
      const safeStages = (stages as StageMaster[]) || [];

      setIndustryList(safeIndustries);
      setStageList(safeStages);

      const enriched = (startups || []).map((s) => {
        const industryNames = safeIndustries
          .filter((industry) => s.industry_ids?.includes(industry.id))
          .map((industry) => industry.name);

        const stageName = safeStages.find((stage) => stage.id === s.stage_id)?.name || "";

        return {
          ...s,
          industryNames,
          stageName,
        };
      });

      setEnrichedStartups(enriched);
      setLoading(false);
    };

    loadAll();
  }, [startups]);

  useEffect(() => {
    const loadFollowing = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      const { data: veteran } = await supabase
        .from("veterans")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!veteran) return;

      const { data } = await supabase
        .from("startup_followers")
        .select("startup_id")
        .eq("veteran_id", veteran.id);

      const ids = data?.map((f) => f.startup_id) || [];
      setFollowingIds(ids);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) return;

      const response = await fetch("/api/associations/requests?view=veteran", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) return;

      setRequests(result.requests || []);
    };

    loadFollowing();
  }, []);

  const acceptRequest = async (req: AssociationRequest) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      alert("You need to log in again.");
      return;
    }

    const response = await fetch(`/api/associations/requests/${req.id}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Unable to accept request.");
      return;
    }

    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  const rejectRequest = async (id: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      alert("You need to log in again.");
      return;
    }

    const response = await fetch(`/api/associations/requests/${id}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Unable to reject request.");
      return;
    }

    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const filteredStartups = enrichedStartups.filter((s) => {
    const industryMatch = filterIndustry ? s.industry_ids?.includes(filterIndustry) : true;
    const stageMatch = filterStage ? s.stage_id === filterStage : true;
    const followingMatch = showFollowing ? followingIds.includes(s.id) : true;

    return industryMatch && stageMatch && followingMatch;
  });

  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="space-y-8">
        <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
                Industry Expert Dashboard
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
                Discover Startups
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
                Build your network in the industry by connecting new startups and companies
              </p>
            </div>

            {!profileComplete && (
              <button
                onClick={() => router.push("/complete-profile/veteran")}
                className="bg-yellow-500 text-white px-5 py-3 rounded-xl shadow-sm"
              >
                Complete Profile
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowFollowing(false)}
            className={filterButtonClass(!showFollowing)}
          >
            All
          </button>

          <button
            onClick={() => setShowFollowing(true)}
            className={filterButtonClass(showFollowing)}
          >
            Following
          </button>

          <button
            onClick={() => setActiveTab("discover")}
            className={filterButtonClass(activeTab === "discover")}
          >
            Discover Startups
          </button>

          <button
            onClick={() => setActiveTab("requests")}
            className={filterButtonClass(activeTab === "requests")}
          >
            Requests
            {requests.length > 0 && (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm h-fit space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Industry
              </h3>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setFilterIndustry(null)}
                  className={sidebarFilterClass(!filterIndustry)}
                >
                  All Industries
                </button>

                {industryList.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => setFilterIndustry(ind.id)}
                    className={sidebarFilterClass(filterIndustry === ind.id)}
                  >
                    {ind.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Stage
              </h3>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setFilterStage(null)}
                  className={sidebarFilterClass(!filterStage)}
                >
                  All Stages
                </button>

                {stageList.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => setFilterStage(stage.id)}
                    className={sidebarFilterClass(filterStage === stage.id)}
                  >
                    {stage.name}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            {activeTab === "discover" && (
              <>
                {filteredStartups.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
                    No startups found.
                  </div>
                ) : (
                  filteredStartups.map((s) => (
                    <article
                      key={s.id}
                      className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm hover:shadow-lg transition duration-200"
                    >
                      <div className="grid gap-6 lg:grid-cols-[110px_1fr]">
                        <div className="flex justify-center lg:justify-start">
                          <StartupLogo startupName={s.startup_name} logoUrl={s.logo_url} />
                        </div>

                        <div>
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <h3 className="text-3xl font-bold tracking-tight text-gray-900">
                                {s.startup_name}
                              </h3>
                              <p className="mt-2 text-lg text-gray-500 line-clamp-2">
                                {s.headline ||
                                  s.short_headline ||
                                  s.description ||
                                  "No description added."}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              {s.looking_for_advisors && (
                                <span className="rounded-full bg-green-100 text-green-700 text-sm px-4 py-2">
                                  Looking for Advisors
                                </span>
                              )}

                              {s.offering_equity === true && (
                                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-700">
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    className="h-4 w-4"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.313a1 1 0 0 1-1.42-.005L3.29 9.207a1 1 0 1 1 1.42-1.407l4.04 4.078 6.543-6.595a1 1 0 0 1 1.41.006Z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  Offering Equity
                                </span>
                              )}

                              {s.stageName && (
                                <span className="rounded-full bg-indigo-50 text-indigo-700 text-sm px-4 py-2">
                                  {s.stageName}
                                </span>
                              )}
                            </div>
                          </div>

                          {s.industryNames?.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-2">
                              {s.industryNames.map((name: string, index: number) => (
                                <span
                                  key={index}
                                  className={`${pillClass} bg-blue-100 text-blue-700`}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-gray-500">
                              Open the startup profile to review details, traction, and
                              advisory context.
                            </p>

                            <button
                              onClick={() => router.push(`/startup/${s.id}`)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </>
            )}

            {activeTab === "requests" && (
              <div className="space-y-4">
                {requests.length === 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
                    No pending requests.
                  </div>
                )}

                {requests.map((req) => (
                  <article
                    key={req.id}
                    className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                          {req.startups?.startup_name}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                          {req.message}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => acceptRequest(req)}
                          className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl shadow-sm transition"
                        >
                          Accept
                        </button>

                        <button
                          onClick={() => rejectRequest(req.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl shadow-sm transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
