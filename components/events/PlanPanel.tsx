"use client";

import { useEffect, useState } from "react";
import { fetchMyPlan, formatAllowance, type MyPlan } from "@/lib/api/subscriptions";

/**
 * What this business is on, and how much of it is left.
 *
 * The number comes from the API rather than from counting the events already
 * on screen: the cap counts events that are published and still to come, and
 * a dashboard that counted the rows in front of it would include the drafts
 * and the finished ones and quietly disagree with the refusal an organiser
 * gets when they press Publish.
 *
 * Renders nothing at all on an uncapped plan. Everybody is uncapped today,
 * and a panel that says "unlimited of unlimited used" is furniture.
 */
export default function PlanPanel() {
  const [plan, setPlan] = useState<MyPlan | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyPlan().then((r) => {
      if (alive && r.plan) setPlan(r.plan);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!plan || !plan.plan || plan.remaining === null) return null;

  const full = !plan.canPublishAnother;

  return (
    <section className="cf-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="cf-eyebrow">Your plan</p>
          <p className="mt-2 font-display text-lg text-ink">{plan.plan.name}</p>
        </div>

        <div className="text-right">
          <p className="font-display text-2xl text-ink">
            {plan.liveEvents}
            <span className="text-muted"> / {plan.plan.maxActiveEvents}</span>
          </p>
          <p className="text-xs text-faint">events live</p>
        </div>
      </div>

      <p className={`mt-3 text-sm ${full ? "text-warn" : "text-muted"}`}>
        {full
          ? plan.plan.maxActiveEvents === 0
            ? "This plan is a listing — running an event is bought separately. Get in touch and we'll set it up."
            : "You've used every slot on this plan. Finish or cancel one, or move up a tier, to publish another."
          : `${formatAllowance(plan.plan.maxActiveEvents)}. ${plan.remaining} left.`}
      </p>

      {plan.endsOn && (
        <p className="mt-2 text-xs text-faint">
          Runs until {new Date(plan.endsOn).toLocaleDateString("en-IN")}.
        </p>
      )}
    </section>
  );
}
