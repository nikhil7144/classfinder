"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageSkeleton from "@/components/ui/PageSkeleton";

type Veteran = {
  id: string;
  name: string | null;
  headline: string | null;
  photo_url: string | null;
  industries?: string[] | null;
  expertise_ids?: string[] | null;
  expertise_names?: string[];
  past_companies?: { company: string; years: string }[] | null;
  experience_years?: number | null;
  linkedin_url?: string | null;
  bio?: string | null;
  support_details?: string | null;
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
};

type VeteranReview = {
  id: string;
  startup_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  startup_name?: string;
};

function renderStars(rating: number) {
  const rounded = Math.round(rating);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

export default function VeteranProfilePage() {
  const { id } = useParams();
  const [veteran, setVeteran] = useState<Veteran | null>(null);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [showReview, setShowReview] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviews, setReviews] = useState<VeteranReview[]>([]);
  const [requestMessage, setRequestMessage] = useState("");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchVeteran = async () => {
      setLoading(true);

      const { data } = await supabase.from("veterans").select("*").eq("id", id).maybeSingle();

      if (!data) {
        setVeteran(null);
        setLoading(false);
        return;
      }

      let expertiseNames: string[] = [];

      if (data.expertise_ids?.length) {
        const { data: expertise } = await supabase
          .from("expertise_master")
          .select("id, name")
          .in("id", data.expertise_ids);

        expertiseNames = expertise?.map((item) => item.name) || [];
      }

      setVeteran({
        ...(data as Veteran),
        expertise_names: expertiseNames,
      });

      setLoading(false);
    };

    fetchVeteran();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const loadReviews = async () => {
      const { data } = await supabase
        .from("veteran_reviews")
        .select("id, startup_id, rating, review_text, created_at")
        .eq("veteran_id", id)
        .order("created_at", { ascending: false });

      const safeReviews = (data as VeteranReview[] | null) || [];

      const total = safeReviews.reduce((sum, review) => sum + review.rating, 0);
      setAverageRating(safeReviews.length ? total / safeReviews.length : 0);
      setRatingCount(safeReviews.length);

      if (safeReviews.length === 0) {
        setReviews([]);
        return;
      }

      const startupIds = [...new Set(safeReviews.map((review) => review.startup_id))];

      const { data: startups } = await supabase
        .from("startups")
        .select("id, startup_name")
        .in("id", startupIds);

      const startupMap = new Map(
        ((startups as { id: string; startup_name: string | null }[] | null) || []).map(
          (startup) => [startup.id, startup.startup_name || "Startup"]
        )
      );

      setReviews(
        safeReviews.map((review) => ({
          ...review,
          startup_name: startupMap.get(review.startup_id) || "Startup",
        }))
      );
    };

    loadReviews();
  }, [id]);

  const submitReview = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData?.user || !id) return;

    const { data: startup } = await supabase
      .from("startups")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();

    if (!startup) return;

    const { error } = await supabase.from("veteran_reviews").upsert(
      {
        veteran_id: id,
        startup_id: startup.id,
        rating: reviewRating,
        review_text: reviewText,
      },
      { onConflict: "veteran_id,startup_id" }
    );

    if (error) {
      alert(error.message || "Unable to submit review.");
      return;
    }

    const { data: refreshedReviews } = await supabase
      .from("veteran_reviews")
      .select("id, startup_id, rating, review_text, created_at")
      .eq("veteran_id", id)
      .order("created_at", { ascending: false });

    const safeReviews = (refreshedReviews as VeteranReview[] | null) || [];
    const total = safeReviews.reduce((sum, review) => sum + review.rating, 0);
    setAverageRating(safeReviews.length ? total / safeReviews.length : 0);
    setRatingCount(safeReviews.length);

    const startupIds = [...new Set(safeReviews.map((review) => review.startup_id))];
    const { data: startups } = await supabase
      .from("startups")
      .select("id, startup_name")
      .in("id", startupIds);

    const startupMap = new Map(
      ((startups as { id: string; startup_name: string | null }[] | null) || []).map(
        (item) => [item.id, item.startup_name || "Startup"]
      )
    );

    setReviews(
      safeReviews.map((review) => ({
        ...review,
        startup_name: startupMap.get(review.startup_id) || "Startup",
      }))
    );

    alert("Review submitted");
    setShowReview(false);
    setReviewRating(5);
    setReviewText("");
  };

  const sendRequest = async () => {
    if (sendingRequest || !id) return;

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
        veteranId: id,
        message: requestMessage,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Unable to send request");
      setSendingRequest(false);
      return;
    }

    alert("Request sent");
    setShowRequestModal(false);
    setRequestMessage("");
    setSendingRequest(false);
  };

  if (loading) return <PageSkeleton variant="detail" />;
  if (!veteran) return <div className="p-10">Industry expert not found</div>;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.10),_transparent_26%),linear-gradient(180deg,_#fffdf8_0%,_#f9fafb_38%,_#f8fafc_100%)] py-10">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-100 via-white to-sky-100 p-[1px] shadow-[0_22px_50px_rgba(148,163,184,0.18)]">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute left-[-80px] top-[-40px] h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
            <div className="absolute right-[-50px] top-[30px] h-52 w-52 rounded-full bg-amber-200/35 blur-3xl" />
            <div className="absolute bottom-[-80px] left-[28%] h-56 w-56 rounded-full bg-indigo-100/35 blur-3xl" />
          </div>
          <div className="relative rounded-[calc(2rem-1px)] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-8 text-slate-900">
          <div className="grid items-center gap-8 md:grid-cols-[160px_1fr]">
            <div className="flex justify-center md:justify-start">
              <img
                src={veteran.photo_url || "/placeholder-avatar.png"}
                alt={veteran.name || "Industry expert"}
                className="h-36 w-36 rounded-full border-4 border-white object-cover shadow-[0_18px_40px_rgba(148,163,184,0.28)]"
              />
            </div>

            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                Industry Expert Profile
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight">{veteran.name}</h1>
              <p className="mt-3 text-lg text-slate-600">{veteran.headline}</p>

              {veteran.industries && veteran.industries.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <p className="text-sm text-slate-500">Industry Experience</p>
                  {veteran.industries.map((industry, index) => (
                    <span
                      key={`${industry}-${index}`}
                      className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700"
                    >
                      {industry}
                    </span>
                  ))}
                </div>
              )}

              {veteran.expertise_names && veteran.expertise_names.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <p className="text-sm text-slate-500">Expertise</p>
                  {veteran.expertise_names.map((expertise, index) => (
                    <span
                      key={`${expertise}-${index}`}
                      className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-700"
                    >
                      {expertise}
                    </span>
                  ))}
                </div>
              )}

              {!!veteran.past_companies?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <p className="text-sm text-slate-500">Experience</p>
                  {veteran.past_companies.map((company, index) => (
                    <span
                      key={`${company.company}-${index}`}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                    >
                      {company.company}
                      {company.years ? ` - ${company.years} yrs` : ""}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                <div className="rounded-full bg-white px-4 py-2 text-slate-600 shadow-sm ring-1 ring-slate-200">
                  Experience: {veteran.experience_years || 0} yrs
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200">
                  <span className="text-amber-500">{renderStars(averageRating)}</span>
                  <span className="text-slate-500">
                    {averageRating ? averageRating.toFixed(1) : "0.0"} ({ratingCount})
                  </span>
                </div>
              </div>

              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
                >
                  Request Association
                </button>

                {veteran.linkedin_url && (
                  <a
                    href={veteran.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 bg-white px-6 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-sky-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-8 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">My Bio</h2>
          <p className="leading-relaxed text-slate-700">{veteran.bio}</p>
        </div>

        <div className="mt-8 rounded-[2rem] border border-violet-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-8 shadow-[0_18px_40px_rgba(99,102,241,0.08)]">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">Support I Can Bring</h2>
          <p className="leading-relaxed text-slate-700">{veteran.support_details}</p>
        </div>

        <div className="mt-8 rounded-[2rem] border border-stone-200 bg-gradient-to-br from-stone-50 via-white to-slate-50 p-8 text-slate-900 shadow-[0_20px_48px_rgba(148,163,184,0.12)]">
          <h2 className="mb-6 text-xl font-semibold">Pricing & Association Options</h2>

          {veteran.pricing_model?.consulting && (
            <div className="mb-6 rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 p-6 ring-1 ring-sky-100">
              <h3 className="mb-3 font-semibold text-sky-700">Consulting</h3>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>1 Hour Discussion: Rs {veteran.pricing_model.consulting.one_hour}</div>
                <div>Roadmap Preparation: Rs {veteran.pricing_model.consulting.roadmap}</div>
                <div>Market Fit Research: Rs {veteran.pricing_model.consulting.market_fit}</div>
                <div>New Product Development: Rs {veteran.pricing_model.consulting.product_dev}</div>
              </div>
            </div>
          )}

          {veteran.pricing_model?.equity && (
            <div className="mb-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-lime-50 p-6 ring-1 ring-emerald-100">
              <h3 className="mb-3 font-semibold text-emerald-700">Equity Model</h3>
              <div className="text-sm">
                <div>Minimum Equity: {veteran.pricing_model.equity.minimum_percent}%</div>
                <div>
                  Association Duration: {veteran.pricing_model.equity.duration_months} months
                </div>
              </div>
            </div>
          )}

          {veteran.pricing_model?.hybrid && (
            <div className="mb-6 rounded-2xl bg-gradient-to-br from-fuchsia-50 to-violet-50 p-6 ring-1 ring-fuchsia-100">
              <h3 className="mb-3 font-semibold text-fuchsia-700">Hybrid Model</h3>
              <div className="text-sm">{veteran.pricing_model.hybrid.details}</div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-[2rem] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-8 shadow-[0_18px_40px_rgba(251,191,36,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Reviews</h2>
              <p className="mt-2 text-sm text-slate-500">
                Rating updates apply immediately to this page and startup dashboard cards.
              </p>
            </div>

            <button
              onClick={() => setShowReview(true)}
              className="rounded-xl bg-amber-500 px-4 py-2 text-white transition hover:bg-amber-600"
            >
              Leave Review
            </button>
          </div>

          {showReview && (
            <div className="mt-6 space-y-3 rounded-2xl border border-amber-200 bg-white/90 p-4">
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
                className="rounded-xl border border-amber-200 bg-white p-2"
              >
                <option value={5}>★★★★★</option>
                <option value={4}>★★★★</option>
                <option value={3}>★★★</option>
                <option value={2}>★★</option>
                <option value={1}>★</option>
              </select>

              <textarea
                placeholder="Write your experience..."
                className="w-full rounded-xl border border-amber-200 p-3"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />

              <button
                onClick={submitReview}
                className="rounded-xl bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800"
              >
                Submit Review
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-8 shadow-[0_18px_40px_rgba(99,102,241,0.08)]">
          <h2 className="text-xl font-semibold text-slate-950">Startup Reviews</h2>
          {reviews.length === 0 ? (
            <p className="mt-4 text-slate-500">No reviews yet.</p>
          ) : (
            <div className="mt-6 flex gap-5 overflow-x-auto pb-2">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="min-w-[320px] rounded-[1.6rem] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-sky-50 p-5 text-slate-900 shadow-[0_18px_40px_rgba(148,163,184,0.14)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold">
                        {review.startup_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                      {renderStars(review.rating)}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {review.review_text || "No written review provided."}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-[1.6rem] border border-white/70 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
            <h3 className="mb-4 text-lg font-semibold text-slate-950">Request Association</h3>

            <textarea
              placeholder="Write a short message..."
              className="mb-4 w-full rounded-xl border border-slate-200 p-3"
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={sendRequest}
                disabled={sendingRequest}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
              >
                {sendingRequest ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
