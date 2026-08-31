"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import VeteranAvailabilityModal from "@/components/VeteranAvailabilityModal";
import {
  createDefaultWeeklyAvailability,
  normalizeWeeklyAvailability,
  WeeklyAvailability,
} from "@/lib/veteran-availability";
import PageSkeleton from "@/components/ui/PageSkeleton";

type PastCompany = {
  company: string;
  years: string;
};

type Veteran = {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  support_details: string | null;
  experience_years: number | null;
  photo_url: string | null;
  industries: string[] | null;
  expertise_ids: string[] | null;
  association_type: "consulting" | "equity" | "hybrid" | null;
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
  past_companies: PastCompany[] | null;
  approved?: boolean | null;
  rating?: number | null;
  rating_count?: number | null;
  veteran_reviews?: {
    rating: number;
  }[] | null;
};

type ExpertiseMaster = {
  id: string;
  name: string;
};

type IndustryMaster = {
  id: string;
  name: string;
};

type NormalizedVeteran = Veteran & {
  expertise_names: string[];
  industry_names: string[];
};

const experienceOptions = [
  { value: "", label: "Experience" },
  { value: "0-10", label: "0-10 years" },
  { value: "10-20", label: "10-20 years" },
  { value: "20+", label: "20+ years" },
];

function matchesExperienceRange(value: string, years: number) {
  if (!value) return true;
  if (value === "0-10") return years < 10;
  if (value === "10-20") return years >= 10 && years < 20;
  if (value === "20+") return years >= 20;
  return true;
}

function truncateWithEllipsis(text: string | null, maxLength: number) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getAssociationLabel(type: Veteran["association_type"]) {
  if (type === "consulting") return "Consulting";
  if (type === "equity") return "Equity";
  if (type === "hybrid") return "Hybrid";
  return "Open to Associate";
}

function getFeePreview(veteran: Veteran) {
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

function getEquityPreview(veteran: Veteran) {
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

function getPricingPreview(veteran: Veteran) {
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

export default function VeteransPage() {
  const [veterans, setVeterans] = useState<Veteran[]>([]);
  const [expertiseMaster, setExpertiseMaster] = useState<ExpertiseMaster[]>([]);
  const [industryMaster, setIndustryMaster] = useState<IndustryMaster[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [expertise, setExpertise] = useState("");
  const [experience, setExperience] = useState("");
  const [consulting, setConsulting] = useState("");
  const [selectedVeteran, setSelectedVeteran] = useState<Veteran | null>(null);

  useEffect(() => {
    async function loadData() {
      const [{ data: veteransData }, { data: expertiseData }, { data: industryData }] =
        await Promise.all([
          supabase
            .from("veterans")
            .select(`
              *,
              veteran_reviews ( rating )
            `)
            .eq("approved", true),
          supabase.from("expertise_master").select("id,name").order("name"),
          supabase.from("industry_master").select("id,name").order("name"),
        ]);

      const enrichedVeterans = ((veteransData as Veteran[] | null) || []).map((veteran) => {
        const ratings = veteran.veteran_reviews?.map((review) => review.rating) || [];
        const ratingCount = ratings.length;
        const rating =
          ratingCount > 0
            ? ratings.reduce((total, value) => total + value, 0) / ratingCount
            : 0;

        return {
          ...veteran,
          rating,
          rating_count: ratingCount,
        };
      });

      setVeterans(enrichedVeterans);
      setExpertiseMaster((expertiseData as ExpertiseMaster[]) || []);
      setIndustryMaster((industryData as IndustryMaster[]) || []);
      setLoading(false);
    }

    loadData();
  }, []);

  const expertiseMap = useMemo(() => {
    const map: Record<string, string> = {};

    expertiseMaster.forEach((item) => {
      map[item.id] = item.name;
    });

    return map;
  }, [expertiseMaster]);

  const normalizedVeterans = useMemo<NormalizedVeteran[]>(() => {
    return veterans.map((veteran) => ({
      ...veteran,
      expertise_names:
        veteran.expertise_ids
          ?.map((id) => expertiseMap[id])
          .filter((value): value is string => Boolean(value)) || [],
      industry_names: veteran.industries || [],
    }));
  }, [expertiseMap, veterans]);

  const filteredVeterans = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return normalizedVeterans.filter((veteran) => {
      const years = veteran.experience_years || 0;
      const searchableText = [
        veteran.name,
        veteran.headline,
        veteran.bio,
        veteran.support_details,
        ...veteran.industry_names,
        ...veteran.expertise_names,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (searchTerm && !searchableText.includes(searchTerm)) {
        return false;
      }

      if (industry && !veteran.industry_names.includes(industry)) {
        return false;
      }

      if (expertise && !veteran.expertise_names.includes(expertise)) {
        return false;
      }

      if (consulting && veteran.association_type !== consulting) {
        return false;
      }

      return matchesExperienceRange(experience, years);
    });
  }, [consulting, experience, expertise, industry, normalizedVeterans, search]);

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-6 space-y-8">
        <div className="relative bg-white border border-gray-200 rounded-3xl p-10 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
            Industry Expert Network
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
            Search Industry Leaders
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
            Browse approved industry experts by expertise, industry, experience, and consulting
            model. Each profile highlights the support they bring and the companies they
            have helped build.
          </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-5">
            <input
              type="text"
              placeholder="Search industry leaders"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
            >
              <option value="">All Industries</option>
              {industryMaster.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
              value={expertise}
              onChange={(event) => setExpertise(event.target.value)}
            >
              <option value="">All Expertise</option>
              {expertiseMaster.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
            >
              {experienceOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400"
              value={consulting}
              onChange={(event) => setConsulting(event.target.value)}
            >
              <option value="">Consulting</option>
              <option value="consulting">Consulting</option>
              <option value="equity">Equity</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        {loading ? (
          <PageSkeleton variant="list" />
        ) : filteredVeterans.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500 shadow-sm">
            No industry experts matched the selected filters.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredVeterans.map((veteran) => (
              <article
                key={veteran.id}
                className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm hover:shadow-lg transition duration-200"
              >
                <div className="grid gap-6 lg:grid-cols-[140px_1fr]">
                  <div className="flex justify-center lg:justify-start">
                    {veteran.photo_url ? (
                        <img
                          src={veteran.photo_url}
                          alt={veteran.name}
                          className="w-28 h-28 object-cover rounded-full border"
                        />
                      ) : (
                      <div className="flex w-28 h-28 items-center justify-center rounded-full border bg-white text-4xl font-semibold text-gray-500">
                        {veteran.name?.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                          {veteran.name}
                        </h2>
                        <p className="mt-2 text-lg text-gray-500">
                          {veteran.headline || "Industry expert"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-yellow-100 text-yellow-800 text-sm px-4 py-2">
                          {veteran.rating_count
                            ? `${(veteran.rating || 0).toFixed(1)} rating`
                            : "No ratings yet"}
                        </span>
                        <span className="rounded-full bg-indigo-50 text-indigo-700 text-sm px-4 py-2">
                          {veteran.experience_years || 0}+ years
                        </span>
                        <span className="rounded-full bg-gray-100 text-gray-700 text-sm px-4 py-2">
                          {getAssociationLabel(veteran.association_type)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <p className="text-sm text-gray-500">Industry Experience </p>
                      {veteran.industry_names.slice(0, 3).map((item) => (
                        <span
                          key={`${veteran.id}-industry-${item}`}
                          className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full"
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className="text-sm text-gray-500">Expertise</p>
                      {veteran.expertise_names.slice(0, 4).map((item, index) => (
                        <span
                          key={`${veteran.id}-expertise-${item}-${index}`}
                          className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full"
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    {!!veteran.past_companies?.length && (
                      <div className="mt-6">
                        <p className="text-sm text-gray-500 mb-3">
                          Past Companies
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {veteran.past_companies.slice(0, 3).map((company, index) => (
                            <span
                              key={`${veteran.id}-company-${company.company}-${index}`}
                              className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full"
                            >
                              {company.company}
                              {company.years ? ` - ${company.years} yrs` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                        <p className="text-lg font-semibold text-gray-900">Bio</p>
                        <p className="mt-2 text-[15px] leading-relaxed text-gray-600 line-clamp-2">
                          {truncateWithEllipsis(veteran.bio, 180) || "No bio added yet."}
                        </p>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                        <p className="text-lg font-semibold text-gray-900">
                          How can I support
                        </p>
                        <p className="mt-2 text-[15px] leading-relaxed text-gray-600 line-clamp-2">
                          {truncateWithEllipsis(veteran.support_details, 180) ||
                            "Support details not added yet."}
                        </p>
                      </div>
                    </div>

                    {getPricingPreview(veteran) && (
                      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                          Pricing
                        </p>
                        <p className="mt-2 text-sm font-medium text-indigo-900">
                          {getPricingPreview(veteran)}
                        </p>
                      </div>
                    )}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-gray-500">
                        Explore the full profile for detailed support, pricing, and past
                        experience.
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedVeteran(veteran)}
                          className="rounded-xl border border-indigo-200 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                        >
                          See Availability
                        </button>

                        <Link
                          href={`/veteran/${veteran.id}`}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition inline-flex items-center justify-center"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
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
