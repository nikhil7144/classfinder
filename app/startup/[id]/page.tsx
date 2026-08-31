"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageSkeleton from "@/components/ui/PageSkeleton";
import Link from "next/link";
import { getStartupPostPath, isLongPost } from "@/lib/post-links";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type Startup = {
  id: string;
  user_id: string;
  startup_name: string | null;
  headline: string | null;
  description: string | null;
  logo_url: string | null;
  industry_ids: string[] | null;
  stage_id: string | null;
  location: string | null;
  founded_year: number | string | null;
  team_size: number | string | null;
  website_url: string | null;
  website?: string | null;
  looking_for_advisors?: boolean | null;
  offering_equity?: boolean | null;
  open_roles?: string | null;
};

type Industry = {
  id: string;
  name: string;
};

type Stage = {
  id: string;
  name: string;
};

type Post = {
  id: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
};

type CurrentProblem = {
  id: string;
  problem_text: string;
  function_id: string | null;
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
      <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-gray-200 bg-slate-100 text-2xl font-semibold text-slate-700">
        {getInitials(startupName)}
      </div>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={startupName || "Startup logo"}
      className="h-28 w-28 rounded-2xl border border-gray-200 bg-white p-2 object-contain"
      onError={() => setHasError(true)}
    />
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-2 text-lg font-semibold text-gray-900">{children}</div>
    </div>
  );
}

export default function StartupDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [startup, setStartup] = useState<Startup | null>(null);
  const [industryNames, setIndustryNames] = useState<string[]>([]);
  const [stageName, setStageName] = useState("");
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [veteranId, setVeteranId] = useState<string | null>(null);
  const [veteranProfileComplete, setVeteranProfileComplete] = useState(false);
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [currentProblem, setCurrentProblem] = useState<CurrentProblem | null>(null);
  const [currentProblemFunctionName, setCurrentProblemFunctionName] = useState("");
  const [respondProblemId, setRespondProblemId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const loadStartup = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id || null);

      const { data: startupData } = await supabase
        .from("startups")
        .select("*")
        .eq("id", id)
        .single();

      if (!startupData) {
        setStartup(null);
        setLoading(false);
        return;
      }

      const [{ data: industries }, { data: stages }, { count }, { data: postsData }, { data: problemData }] =
        await Promise.all([
          supabase.from("industry_master").select("id, name"),
          supabase.from("startup_stages").select("id, name"),
          supabase
            .from("startup_followers")
            .select("*", { count: "exact", head: true })
            .eq("startup_id", startupData.id),
          supabase
            .from("posts")
            .select("*")
            .eq("startup_id", startupData.user_id)
            .order("created_at", { ascending: false }),
          supabase
            .from("founder_problems")
            .select("id, problem_text, function_id")
            .eq("startup_id", startupData.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const mappedIndustries =
        (industries as Industry[] | null)
          ?.filter((industry) => startupData.industry_ids?.includes(industry.id))
          .map((industry) => industry.name) || [];

      const mappedStage =
        (stages as Stage[] | null)?.find((stage) => stage.id === startupData.stage_id)?.name ||
        "";

      setStartup(startupData as Startup);
      setIndustryNames(mappedIndustries);
      setStageName(mappedStage);
      setFollowersCount(count || 0);
      setPosts((postsData as Post[]) || []);

      const problem = problemData as CurrentProblem | null;
      setCurrentProblem(problem);

      if (problem?.function_id) {
        const { data: functionRow } = await supabase
          .from("function_master")
          .select("name")
          .eq("id", problem.function_id)
          .maybeSingle();

        setCurrentProblemFunctionName(functionRow?.name || "");
      }

      if (user) {
        const [{ data: veteran }, { data: profileRow }] = await Promise.all([
          supabase.from("veterans").select("id").eq("user_id", user.id).single(),
          supabase.from("profiles").select("profile_complete").eq("id", user.id).maybeSingle(),
        ]);

        setVeteranProfileComplete(Boolean(profileRow?.profile_complete));

        if (veteran) {
          setVeteranId(veteran.id);

          const { data: follow } = await supabase
            .from("startup_followers")
            .select("id")
            .eq("startup_id", startupData.id)
            .eq("veteran_id", veteran.id)
            .single();

          setIsFollowing(Boolean(follow));
        }
      }

      setLoading(false);
    };

    loadStartup();
  }, [id]);

  const toggleFollow = async () => {
    if (!userId || !startup) return;

    if (!veteranId || !veteranProfileComplete) {
      setShowCompleteProfileModal(true);
      return;
    }

    if (isFollowing) {
      await supabase
        .from("startup_followers")
        .delete()
        .eq("startup_id", startup.id)
        .eq("veteran_id", veteranId);

      setIsFollowing(false);
      setFollowersCount((prev) => Math.max(0, prev - 1));
      return;
    }

    await supabase.from("startup_followers").insert({
      startup_id: startup.id,
      veteran_id: veteranId,
    });

    setIsFollowing(true);
    setFollowersCount((prev) => prev + 1);
  };

  const openRequestModal = (problemId?: string, prefillMessage?: string) => {
    if (!veteranId || !veteranProfileComplete) {
      setShowCompleteProfileModal(true);
      return;
    }

    setRespondProblemId(problemId || null);
    setRequestMessage(prefillMessage || "");
    setShowRequestModal(true);
  };

  const sendRequest = async () => {
    if (!startup || sendingRequest) return;

    setSendingRequest(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setSendingRequest(false);
      return;
    }

    const response = await fetch("/api/associations/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        startupId: startup.id,
        message: requestMessage,
        problemId: respondProblemId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Unable to send request.");
      setSendingRequest(false);
      return;
    }

    alert("Request sent");
    setShowRequestModal(false);
    setRequestMessage("");
    setRespondProblemId(null);
    setSendingRequest(false);
  };

  if (loading) return <PageSkeleton variant="detail" />;
  if (!startup) return <div className="p-8">Startup not found.</div>;

  const website = startup.website_url || startup.website || "";

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="mx-auto max-w-6xl space-y-8 px-6">
          <div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <StartupLogo startupName={startup.startup_name} logoUrl={startup.logo_url} />

                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
                    Startup Profile
                  </p>
                  <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
                    {startup.startup_name || "Startup"}
                  </h1>
                  <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
                    {startup.headline || "No headline available."}
                  </p>

                  {startup.description && (
                    <div className="mt-2 max-w-2xl">
                      <p className="line-clamp-2 text-sm leading-6 text-gray-500">
                        {startup.description}
                      </p>
                      <a
                        href="#overview"
                        className="mt-1 inline-block text-sm font-semibold text-indigo-600 hover:underline"
                      >
                        Read more
                      </a>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">
                      {followersCount} followers
                    </span>
                    {stageName && (
                      <span className="rounded-full bg-indigo-50 px-4 py-2 text-sm text-indigo-700">
                        {stageName}
                      </span>
                    )}
                    {startup.looking_for_advisors && (
                      <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-700">
                        Looking for Advisors
                      </span>
                    )}
                    {startup.offering_equity === true && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-4 py-2 text-sm text-cyan-700">
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
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {industryNames.length > 0 ? (
                      industryNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                        General
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={toggleFollow}
                  className={`rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition ${
                    isFollowing
                      ? "bg-slate-700 hover:bg-slate-800"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <button
                  onClick={() => openRequestModal()}
                  className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100 transition hover:bg-indigo-50"
                >
                  Request Association
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Founded">{startup.founded_year || "Not specified"}</InfoCard>
            <InfoCard label="Location">{startup.location || "Not specified"}</InfoCard>
            <InfoCard label="Team Size">{startup.team_size || "Not specified"}</InfoCard>
            <InfoCard label="Website">
              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  Visit Website
                </a>
              ) : (
                "Not specified"
              )}
            </InfoCard>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-8">
              {currentProblem && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-8 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Current Challenge
                  </p>
                  <p className="mt-4 text-[15px] leading-7 text-gray-800">
                    &ldquo;{currentProblem.problem_text}&rdquo;
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                    {currentProblemFunctionName && (
                      <span className="rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-800">
                        Looking for help with {currentProblemFunctionName}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        openRequestModal(
                          currentProblem.id,
                          `Responding to your challenge: "${currentProblem.problem_text}"\n\n`
                        )
                      }
                      className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                    >
                      Respond
                    </button>
                  </div>
                </div>
              )}

              <div id="overview" className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm scroll-mt-6">
                <h2 className="text-xl font-semibold text-gray-900">Overview</h2>
                <p className="mt-4 text-[15px] leading-7 text-gray-600">
                  {startup.description || "No detailed description provided yet."}
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">Startup Updates</h2>

                {posts.length === 0 ? (
                  <p className="mt-4 text-gray-500">No updates yet.</p>
                ) : (
                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    {posts.map((post) => (
                      <article
                        key={post.id}
                        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                      >
                        {post.image_url && (
                          <img
                            src={post.image_url}
                            alt={startup.startup_name || "Startup update"}
                            className="h-56 w-full object-cover"
                          />
                        )}

                        <div className="p-6">
                          <p className="line-clamp-4 text-[15px] leading-7 text-gray-700">
                            {post.description || "No update text provided."}
                          </p>
                          {isLongPost(post.description, 150) && (
                            <Link
                              href={getStartupPostPath(startup.startup_name, post.id)}
                              className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:underline"
                            >
                              See more
                            </Link>
                          )}
                          <p className="mt-4 text-xs text-gray-400">
                            {new Date(post.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-8">
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">
                  Hiring & Advisory Needs
                </h2>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-sm text-gray-600">Looking for Advisors</span>
                    <span
                      className={`text-sm font-semibold ${
                        startup.looking_for_advisors ? "text-emerald-600" : "text-gray-500"
                      }`}
                    >
                      {startup.looking_for_advisors ? "Yes" : "No"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-sm text-gray-600">Offering Equity</span>
                    <span
                      className={`text-sm font-semibold ${
                        startup.offering_equity === true ? "text-cyan-600" : "text-gray-500"
                      }`}
                    >
                      {startup.offering_equity === true ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">Open Roles</h2>
                <p className="mt-4 text-[15px] leading-7 text-gray-600">
                  {startup.open_roles || "Not specified."}
                </p>
              </div>

              <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-blue-700 p-8 text-white shadow-[0_18px_40px_rgba(79,70,229,0.22)]">
                <h3 className="text-xl font-semibold">Interested in collaborating?</h3>
                <p className="mt-3 text-sm leading-6 text-indigo-50/90">
                  Connect directly with the startup founder and send a short message
                  before requesting an association.
                </p>
                <button
                  onClick={() => openRequestModal()}
                  className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-slate-100"
                >
                  Request Introduction
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCompleteProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Complete your profile first</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need a complete industry expert profile before you can follow startups.
            </p>

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowCompleteProfileModal(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <Link
                href="/complete-profile/veteran"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Complete Profile
              </Link>
            </div>
          </div>
        </div>
      )}

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {respondProblemId ? "Respond to Current Challenge" : "Request Association"}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Send a short message to the startup team before requesting an association.
            </p>

            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder="Write a short message..."
              className="mt-4 min-h-32 w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-indigo-400"
            />

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={sendRequest}
                disabled={sendingRequest}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {sendingRequest ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
