"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VeteranAvailabilityModal from "@/components/VeteranAvailabilityModal";
import {
  createDefaultWeeklyAvailability,
  normalizeWeeklyAvailability,
  WeeklyAvailability,
} from "@/lib/veteran-availability";

const sidebarButtonClass = (active: boolean) =>
  `w-full rounded-xl px-3 py-2 text-left text-sm transition ${
    active
      ? "bg-indigo-50 text-indigo-700 font-medium"
      : "text-gray-600 hover:bg-gray-50"
  }`;

const tabButtonClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition ${
    active
      ? "bg-indigo-600 text-white shadow-sm"
      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

const chipClass = "rounded-full px-3 py-1 text-xs font-medium";
const initialVisibleFilterCount = 5;

type PastCompany = {
  company: string;
  years: string;
};

type VeteranCard = {
  id: string;
  name?: string | null;
  headline?: string | null;
  bio?: string | null;
  support_details?: string | null;
  rating?: number | null;
  rating_count?: number | null;
  experience_years?: number | null;
  photo_url?: string | null;
  association_type?: "consulting" | "equity" | "hybrid" | null;
  expertise?: string[] | null;
  expertise_names?: string[] | null;
  industries?: string[] | null;
  past_companies?: PastCompany[] | null;
  pricing_model?: {
    consulting?: {
      one_hour?: string | null;
      roadmap?: string | null;
      market_fit?: string | null;
      product_dev?: string | null;
    } | null;
    equity?: {
      minimum_percent?: string | null;
      duration_months?: string | null;
    } | null;
    hybrid?: {
      details?: string | null;
    } | null;
  } | null;
  availability_schedule?: WeeklyAvailability | null;
  matchScore?: number;
  matchedFunctionName?: string | null;
  matchedFunctionProof?: string | null;
};

type AssociationRequest = {
  id: string;
  message?: string | null;
  veterans?: {
    name?: string | null;
    headline?: string | null;
    photo_url?: string | null;
  } | null;
  founder_problems?: {
    problem_text?: string | null;
  } | null;
};

type FilterOptionsResponse = {
  expertise: string[];
  industries: string[];
};

function getFeePreview(veteran: VeteranCard) {
  const consulting = veteran.pricing_model?.consulting;
  if (!consulting) return null;

  const fee = [
    consulting.one_hour,
    consulting.roadmap,
    consulting.market_fit,
    consulting.product_dev,
  ].find((value) => value && value.toString().trim());

  return fee ? `From Rs ${fee}` : null;
}

function getEquityPreview(veteran: VeteranCard) {
  const equity = veteran.pricing_model?.equity;
  if (!equity) return null;

  const parts = [];

  if (equity.minimum_percent) {
    parts.push(`${equity.minimum_percent}% equity`);
  }

  if (equity.duration_months) {
    parts.push(`${equity.duration_months} months`);
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}

function getPricingPreview(veteran: VeteranCard) {
  const feePreview = getFeePreview(veteran);
  const equityPreview = getEquityPreview(veteran);

  if (veteran.association_type === "consulting") {
    return feePreview || "Fee shared on profile";
  }

  if (veteran.association_type === "equity") {
    return equityPreview || "Equity terms shared on profile";
  }

  if (veteran.association_type === "hybrid") {
    if (feePreview && equityPreview) return `${feePreview} • ${equityPreview}`;
    return feePreview || equityPreview || "Hybrid terms shared on profile";
  }

  return feePreview || equityPreview || null;
}

export default function StartupHome({
  profileComplete,
}: {
  profileComplete: boolean;
}) {
  const router = useRouter();
  const [veterans, setVeterans] = useState<VeteranCard[]>([]);
  const [search, setSearch] = useState("");
  const [filterExpertise, setFilterExpertise] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [filterExperience, setFilterExperience] = useState<number | null>(null);
  const [filterAssociation, setFilterAssociation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("discover");
  const [requests, setRequests] = useState<AssociationRequest[]>([]);
  const [selectedVeteran, setSelectedVeteran] = useState<VeteranCard | null>(null);
  const [showAllExpertise, setShowAllExpertise] = useState(false);
  const [showAllIndustries, setShowAllIndustries] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsResponse>({
    expertise: [],
    industries: [],
  });
  const [loadingVeterans, setLoadingVeterans] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [problem, setProblem] = useState("");
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchInfo, setMatchInfo] = useState<{ functionName: string } | null>(null);

  useEffect(() => {
    const loadRequests = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) return;

      const response = await fetch("/api/associations/requests?view=startup", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        return;
      }

      setRequests(result.requests || []);
    };

    loadRequests();
  }, [activeTab]);

  useEffect(() => {
    let isActive = true;

    const loadFilterOptions = async () => {
      setLoadingFilters(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        if (isActive) {
          setFilterOptions({ expertise: [], industries: [] });
          setLoadingFilters(false);
        }
        return;
      }

      const response = await fetch("/api/dashboard/startup/filters", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!isActive) return;

      if (!response.ok) {
        setFilterOptions({ expertise: [], industries: [] });
        setLoadingFilters(false);
        return;
      }

      setFilterOptions({
        expertise: result.expertise || [],
        industries: result.industries || [],
      });
      setLoadingFilters(false);
    };

    loadFilterOptions();

    return () => {
      isActive = false;
    };
  }, []);

  const loadVeterans = useCallback(async () => {
    setLoadingVeterans(true);
    setMatchInfo(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setVeterans([]);
      setLoadingVeterans(false);
      return;
    }

    const searchParams = new URLSearchParams();

    if (filterExpertise) {
      searchParams.set("expertise", filterExpertise);
    }

    if (filterIndustry) {
      searchParams.set("industry", filterIndustry);
    }

    if (filterExperience) {
      searchParams.set("experience", String(filterExperience));
    }

    if (filterAssociation) {
      searchParams.set("association", filterAssociation);
    }

    const queryString = searchParams.toString();
    const response = await fetch(
      `/api/dashboard/startup/veterans${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      setVeterans([]);
      setLoadingVeterans(false);
      return;
    }

    setVeterans(result.veterans || []);
    setLoadingVeterans(false);
  }, [filterAssociation, filterExperience, filterExpertise, filterIndustry]);

  useEffect(() => {
    loadVeterans();
  }, [loadVeterans]);

  const runMatch = async () => {
    if (!problem.trim() || matching) return;

    setMatching(true);
    setMatchError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setMatchError("Your session expired — refresh and try again.");
      setMatching(false);
      return;
    }

    const response = await fetch("/api/dashboard/startup/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ problem }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMatchError(result.error || "Unable to match experts.");
      setMatching(false);
      return;
    }

    setVeterans(result.veterans || []);
    setMatchInfo({ functionName: result.classification?.functionName || "" });
    setActiveTab("discover");
    setSearch("");
    setMatching(false);
  };

  const renderStars = (rating: number) => {
    const rounded = Math.round(rating);
    return "★".repeat(rounded) + "☆".repeat(5 - rounded);
  };

  const expertiseOptions = useMemo(() => {
    return filterOptions.expertise;
  }, [filterOptions.expertise]);

  const industryOptions = useMemo(() => {
    return filterOptions.industries;
  }, [filterOptions.industries]);

  const visibleExpertiseOptions = showAllExpertise
    ? expertiseOptions
    : expertiseOptions.slice(0, initialVisibleFilterCount);

  const visibleIndustryOptions = showAllIndustries
    ? industryOptions
    : industryOptions.slice(0, initialVisibleFilterCount);

  const experienceOptions = [
    { label: "All", value: null },
    { label: "5+ Years", value: 5 },
    { label: "10+ Years", value: 10 },
    { label: "15+ Years", value: 15 },
    { label: "20+ Years", value: 20 },
  ];

  const associationOptions = [
    { label: "Consulting", value: "consulting" },
    { label: "Equity", value: "equity" },
    { label: "Hybrid", value: "hybrid" },
  ];

  const filteredVeterans = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    if (!searchTerm) {
      return veterans;
    }

    return veterans.filter((veteran) => {
      const searchableText = [
        veteran.name,
        veteran.headline,
        veteran.bio,
        veteran.support_details,
        ...(veteran.industries || []),
        ...(veteran.expertise_names || veteran.expertise || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }, [search, veterans]);

  const acceptRequest = async (requestId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      alert("You need to log in again.");
      return;
    }

    const response = await fetch(`/api/associations/requests/${requestId}/accept`, {
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

    setRequests((prev) => prev.filter((request) => request.id !== requestId));
  };

  const rejectRequest = async (requestId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      alert("You need to log in again.");
      return;
    }

    const response = await fetch(`/api/associations/requests/${requestId}/reject`, {
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

    setRequests((prev) => prev.filter((request) => request.id !== requestId));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="space-y-8">
        <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
                Startup Dashboard
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
                Discover Industry Experts
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
                Explore industry expert profiles, check their availability, send association request, chat and grow your brand
  
              </p>
            </div>

            {!profileComplete && (
              <button
                onClick={() => router.push("/complete-profile/startup")}
                className="bg-yellow-500 text-white px-5 py-3 rounded-xl shadow-sm"
              >
                Complete Profile
              </button>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Describe your challenge
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Tell us what you&apos;re stuck on and we&apos;ll rank industry experts by fit instead
            of flat filters.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="e.g. We can't figure out CAC payback on paid channels"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
            />
            <button
              onClick={runMatch}
              disabled={matching}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {matching ? "Matching..." : "Find Matches"}
            </button>
          </div>
          {matchError && <p className="mt-3 text-sm font-medium text-rose-600">{matchError}</p>}
          {matchInfo && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm">
              <span className="text-gray-600">
                Matched on: <span className="font-semibold text-indigo-700">{matchInfo.functionName}</span>
                {" — "}this is now shown as your current challenge on your public profile.
              </span>
              <button
                onClick={() => loadVeterans()}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Clear match
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm h-fit space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Search
              </h3>
              <div className="mt-3">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search industry experts"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Expertise
              </h3>
              {loadingFilters && (
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500" />
                  Loading options...
                </p>
              )}
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setFilterExpertise(null)}
                  className={sidebarButtonClass(filterExpertise === null)}
                >
                  All
                </button>
                {visibleExpertiseOptions.map((expertise) => (
                  <button
                    key={expertise}
                    onClick={() => setFilterExpertise(expertise)}
                    className={sidebarButtonClass(filterExpertise === expertise)}
                  >
                    {expertise}
                  </button>
                ))}
                {expertiseOptions.length > initialVisibleFilterCount && (
                  <button
                    type="button"
                    onClick={() => setShowAllExpertise((prev) => !prev)}
                    className="px-3 py-1 text-left text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
                  >
                    {showAllExpertise
                      ? "See less"
                      : `See more (${expertiseOptions.length - initialVisibleFilterCount})`}
                  </button>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Industry
              </h3>
              {loadingFilters && (
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500" />
                  Loading options...
                </p>
              )}
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setFilterIndustry(null)}
                  className={sidebarButtonClass(filterIndustry === null)}
                >
                  All
                </button>
                {visibleIndustryOptions.map((industry) => (
                  <button
                    key={industry}
                    onClick={() => setFilterIndustry(industry)}
                    className={sidebarButtonClass(filterIndustry === industry)}
                  >
                    {industry}
                  </button>
                ))}
                {industryOptions.length > initialVisibleFilterCount && (
                  <button
                    type="button"
                    onClick={() => setShowAllIndustries((prev) => !prev)}
                    className="px-3 py-1 text-left text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
                  >
                    {showAllIndustries
                      ? "See less"
                      : `See more (${industryOptions.length - initialVisibleFilterCount})`}
                  </button>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Experience
              </h3>
              <div className="mt-3 space-y-2">
                {experienceOptions.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => setFilterExperience(option.value)}
                    className={sidebarButtonClass(filterExperience === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Association Type
              </h3>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setFilterAssociation(null)}
                  className={sidebarButtonClass(filterAssociation === null)}
                >
                  All
                </button>
                {associationOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterAssociation(option.value)}
                    className={sidebarButtonClass(filterAssociation === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab("discover")}
                className={tabButtonClass(activeTab === "discover")}
              >
                Discover Industry Experts
              </button>
              <button
                onClick={() => setActiveTab("requests")}
                className={tabButtonClass(activeTab === "requests")}
              >
                Requests
                {requests.length > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      activeTab === "requests"
                        ? "bg-white/20 text-white"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {requests.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "discover" && (
              <>
                {loadingVeterans ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
                    Loading industry experts...
                  </div>
                ) : filteredVeterans.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
                    No industry experts found for the selected filters.
                  </div>
                ) : (
                  filteredVeterans.map((v) => (
                    <article
                      key={v.id}
                      className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm hover:shadow-lg transition duration-200"
                    >
                      <div className="grid gap-6 lg:grid-cols-[110px_1fr]">
                        <div className="flex justify-center lg:justify-start">
                          {v.photo_url ? (
                            <img
                              src={v.photo_url}
                              alt={v.name || "Industry expert"}
                              className="h-24 w-24 rounded-full border object-cover"
                            />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-white text-3xl font-semibold text-gray-500">
                              {v.name?.charAt(0)?.toUpperCase() || "V"}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <h3 className="text-3xl font-bold tracking-tight text-gray-900">
                                {v.name || "Industry Expert"}
                              </h3>
                              <p className="mt-2 text-lg text-gray-500">
                                {v.headline || "No headline added yet."}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-sm px-4 py-2">
                                {renderStars(v.rating ?? 0)}
                                <span className="ml-2 text-amber-900/70">
                                  ({v.rating_count ?? 0})
                                </span>
                              </span>
                              <span className="rounded-full bg-indigo-50 text-indigo-700 text-sm px-4 py-2">
                                {v.experience_years ?? 0} years
                              </span>
                              {v.association_type && (
                                <span className="rounded-full bg-green-100 text-green-700 text-sm px-4 py-2 capitalize">
                                  {v.association_type}
                                </span>
                              )}
                            </div>
                          </div>

                          {v.industries && v.industries.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-2">
                              <p className="text-sm text-gray-500">Industry Experience</p>
                              {v.industries.map((ind: string, i: number) => (
                                <span
                                  key={i}
                                  className={`${chipClass} bg-green-100 text-green-700`}
                                >
                                  {ind}
                                </span>
                              ))}
                            </div>
                          )}

                          {(v.expertise || v.expertise_names) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <p className="text-sm text-gray-500">Expertise</p>
                              {(v.expertise_names || v.expertise || []).map(
                                (exp: string, i: number) => (
                                  <span
                                    key={i}
                                    className={`${chipClass} bg-blue-100 text-blue-700`}
                                  >
                                    {exp}
                                  </span>
                                )
                              )}
                            </div>
                          )}

                          {!!v.past_companies?.length && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <p className="text-sm text-gray-500">Experience</p>
                              {v.past_companies.map((company, index) => (
                                <span
                                  key={`${company.company}-${index}`}
                                  className={`${chipClass} bg-slate-100 text-slate-700`}
                                >
                                  {company.company}
                                  {company.years ? ` - ${company.years} yrs` : ""}
                                </span>
                              ))}
                            </div>
                          )}

                          {getPricingPreview(v) && (
                            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                                Pricing
                              </p>
                              <p className="mt-2 text-sm font-medium text-indigo-900">
                                {getPricingPreview(v)}
                              </p>
                            </div>
                          )}

                          {v.matchedFunctionName && (
                            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                                Matched on: {v.matchedFunctionName}
                              </p>
                              {v.matchedFunctionProof && (
                                <p className="mt-2 text-sm text-emerald-900">
                                  &ldquo;{v.matchedFunctionProof}&rdquo;
                                </p>
                              )}
                            </div>
                          )}

                          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-gray-500">
                              Open the full profile to review experience, support details, and
                              association options.
                            </p>

                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => setSelectedVeteran(v)}
                                className="rounded-xl border border-indigo-200 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                              >
                                See Availability
                              </button>
                              <button
                                onClick={() => router.push(`/veteran/${v.id}`)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition"
                              >
                                View Profile
                              </button>
                            </div>
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

                {requests.map((request) => (
                  <article
                    key={request.id}
                    className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <img
                          src={request.veterans?.photo_url || "/placeholder-avatar.png"}
                          alt={request.veterans?.name || "Industry expert"}
                          className="h-14 w-14 rounded-full object-cover border"
                        />
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">
                            {request.veterans?.name || "Industry expert"}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {request.veterans?.headline || "No headline available."}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-gray-600">
                            {request.message || "No message provided."}
                          </p>
                          {request.founder_problems?.problem_text && (
                            <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                              Responding to: &ldquo;{request.founder_problems.problem_text}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => acceptRequest(request.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl shadow-sm transition"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => rejectRequest(request.id)}
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

      <VeteranAvailabilityModal
        isOpen={Boolean(selectedVeteran)}
        onClose={() => setSelectedVeteran(null)}
        veteranId={selectedVeteran?.id || ""}
        veteranName={selectedVeteran?.name}
        availability={normalizeWeeklyAvailability(
          selectedVeteran?.availability_schedule || createDefaultWeeklyAvailability()
        )}
      />
    </div>
  );
}
