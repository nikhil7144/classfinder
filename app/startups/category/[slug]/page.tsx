"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageSkeleton from "@/components/ui/PageSkeleton";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type Startup = {
  id: string;
  startup_name: string | null;
  logo_url: string | null;
  headline: string | null;
  short_headline: string | null;
  location: string | null;
  founded_year: number | string | null;
  team_size: number | string | null;
  stage: string | null;
  looking_for_advisors?: boolean | null;
  offering_equity?: boolean | null;
  is_featured?: boolean | null;
};

type VeteranReview = {
  startup_id: string;
  veteran_id: string;
};

type VeteranName = {
  id: string;
  name: string | null;
};

type MentorLink = {
  id: string;
  name: string;
};

type Industry = {
  id: string;
  name: string;
  slug: string;
};

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
  const resolvedLogoUrl = normalizeLogoUrl(logoUrl);
  const [hasError, setHasError] = useState(false);

  if (!resolvedLogoUrl || hasError) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-sm font-semibold text-slate-700">
        {getInitials(startupName)}
      </div>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={startupName || "Startup logo"}
      className="h-12 w-12 object-contain"
      onError={() => setHasError(true)}
    />
  );
}

export default function CategoryStartups() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug;

  const [startups, setStartups] = useState<Startup[]>([]);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [startupMentors, setStartupMentors] = useState<Record<string, MentorLink[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    const loadData = async () => {
      const { data: industryData } = await supabase
        .from("industry_master")
        .select("*")
        .eq("slug", slug)
        .single();

      if (!industryData) {
        setLoading(false);
        return;
      }

      setIndustry(industryData);

      const { data: startupData } = await supabase
        .from("startups")
        .select("*")
        .contains("industry_ids", [industryData.id])
        .order("created_at", { ascending: false });

      const safeStartups = (startupData as Startup[] | null) || [];
      setStartups(safeStartups);

      const startupIds = safeStartups.map((startup) => startup.id).filter(Boolean);

      if (startupIds.length > 0) {
        const { data: reviewRows } = await supabase
          .from("veteran_reviews")
          .select("startup_id, veteran_id")
          .in("startup_id", startupIds);

        const safeReviews = (reviewRows as VeteranReview[] | null) || [];
        const veteranIds = [...new Set(safeReviews.map((review) => review.veteran_id).filter(Boolean))];

        if (veteranIds.length > 0) {
          const { data: veteranRows } = await supabase
            .from("veterans")
            .select("id, name")
            .in("id", veteranIds);

          const veteranNameMap = new Map(
            ((veteranRows as VeteranName[] | null) || []).map((veteran) => [
              veteran.id,
              veteran.name || "Industry expert",
            ])
          );

          const mentorMap = safeReviews.reduce<Record<string, MentorLink[]>>((acc, review) => {
            const veteranName = veteranNameMap.get(review.veteran_id);

            if (!veteranName) return acc;

            if (!acc[review.startup_id]) {
              acc[review.startup_id] = [];
            }

            if (!acc[review.startup_id].some((mentor) => mentor.id === review.veteran_id)) {
              acc[review.startup_id].push({
                id: review.veteran_id,
                name: veteranName,
              });
            }

            return acc;
          }, {});

          setStartupMentors(mentorMap);
        } else {
          setStartupMentors({});
        }
      } else {
        setStartupMentors({});
      }

      setLoading(false);
    };

    loadData();
  }, [slug]);

  if (loading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-teal-900 to-cyan-900 py-20 text-white">
        <div className="absolute inset-0 opacity-60">
          <div className="absolute left-[-100px] top-[-60px] h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute right-[-70px] top-[30px] h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-[-110px] left-[30%] h-72 w-72 rounded-full bg-teal-300/15 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-emerald-100/80">
            Startup Categories
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            {industry?.name} Startups
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-cyan-50/85">
            Explore startups in {industry?.name} using the same featured-card layout as
            the homepage, tuned for category browsing.
          </p>
        </div>
      </section>

      <section className="bg-slate-950 px-6 py-6">
        <div className="mx-auto max-w-6xl rounded-full border border-white/10 bg-white/5 px-6 py-4 text-center text-base text-slate-200 backdrop-blur">
          {startups.length} startup{startups.length === 1 ? "" : "s"} found in{" "}
          {industry?.name}
        </div>
      </section>

      <section className="bg-slate-100 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          {startups.length === 0 ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
              No startups found in this category.
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              {startups.map((s) => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/startup/${s.id}`)}
                  className="cursor-pointer overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-700 p-[1px] shadow-[0_18px_40px_rgba(13,148,136,0.24)] transition hover:translate-y-[-2px]"
                >
                  {startupMentors[s.id]?.length ? (
                    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/10 px-6 py-3 text-sm text-emerald-50 backdrop-blur">
                      <span className="font-semibold uppercase tracking-[0.18em] text-[11px] text-emerald-100/90">
                        Mentored by
                      </span>
                      {startupMentors[s.id].map((mentor) => (
                        <button
                          key={`${s.id}-${mentor.id}`}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/veteran/${mentor.id}`);
                          }}
                          className="rounded-full bg-white/16 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/24"
                        >
                          {mentor.name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="h-full rounded-[calc(2rem-1px)] bg-gradient-to-br from-emerald-950/95 via-teal-950/92 to-slate-950 p-8 text-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-2 shadow-lg">
                          <StartupLogo startupName={s.startup_name} logoUrl={s.logo_url} />
                        </div>

                        <div>
                          <h3 className="text-2xl font-bold tracking-tight">
                            {s.startup_name}
                          </h3>
                          <p className="mt-2 max-w-xl text-sm leading-7 text-cyan-50/85">
                            {s.headline || s.short_headline || "No description available."}
                          </p>
                        </div>
                      </div>

                      {s.is_featured && (
                        <span className="rounded-full bg-white/14 px-4 py-2 text-sm font-medium text-white backdrop-blur">
                          Featured
                        </span>
                      )}
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-cyan-50/85">
                      <div>
                        <span className="font-semibold text-white">Location:</span>{" "}
                        {s.location || "Not specified"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Founded:</span>{" "}
                        {s.founded_year || "N/A"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Team:</span>{" "}
                        {s.team_size || "N/A"}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Stage:</span>{" "}
                        {s.stage || "Early"}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {s.looking_for_advisors && (
                        <span className="rounded-full bg-emerald-300/18 px-3 py-1 text-xs font-medium text-emerald-100">
                          Hiring Advisors
                        </span>
                      )}

                      {s.offering_equity === true && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-cyan-300/18 px-3 py-1 text-xs font-medium text-cyan-100">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="h-3.5 w-3.5"
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
                    </div>

                    <button className="mt-8 w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-slate-100">
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
