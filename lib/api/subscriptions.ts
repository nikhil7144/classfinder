import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Plans, and who is on what.
 *
 * The catalogue read is public and could live server-side; everything else
 * needs the caller's token. They sit together because a screen that shows a
 * price list almost always also shows what the reader is currently on.
 */

export type Plan = components["schemas"]["PlanDto"];
export type MyPlan = components["schemas"]["MyPlanDto"];
export type Subscription = components["schemas"]["SubscriptionDto"];
export type NewPlan = components["schemas"]["CreatePlanDto"];
export type PlanPatch = components["schemas"]["PlanBodyDto"];
export type NewSubscription = components["schemas"]["RecordSubscriptionDto"];

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function apiMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string | string[] } | undefined)?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message[0] : message;
}

export async function fetchPlans(
  audience?: "organiser" | "provider" | "advertiser",
): Promise<{ plans: Plan[]; error: string | null }> {
  try {
    const token = await accessToken();
    const { data, error } = await api.GET("/api/v1/subscriptions/plans", {
      params: audience ? { query: { audience } } : {},
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (error || !data) return { plans: [], error: "Couldn't load the plans." };
    return { plans: data, error: null };
  } catch {
    return { plans: [], error: "Couldn't reach the server. Try again." };
  }
}

export async function fetchMyPlan(): Promise<{ plan: MyPlan | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { plan: null, error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/subscriptions/mine", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return { plan: null, error: apiMessage(error, "Couldn't load your plan.") };
    return { plan: data, error: null };
  } catch {
    return { plan: null, error: "Couldn't reach the server. Try again." };
  }
}

/** Admin: every recorded purchase, newest first. */
export async function fetchSubscriptions(): Promise<{
  subscriptions: Subscription[];
  error: string | null;
}> {
  const token = await accessToken();
  if (!token) return { subscriptions: [], error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/subscriptions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) {
      return { subscriptions: [], error: apiMessage(error, "Couldn't load the purchases.") };
    }
    return { subscriptions: data, error: null };
  } catch {
    return { subscriptions: [], error: "Couldn't reach the server. Try again." };
  }
}

export async function createPlan(body: NewPlan): Promise<{ plan: Plan | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { plan: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/subscriptions/plans", {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) return { plan: null, error: apiMessage(error, "Couldn't add that plan.") };
    return { plan: data, error: null };
  } catch {
    return { plan: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function updatePlan(
  id: string,
  body: PlanPatch,
): Promise<{ plan: Plan | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { plan: null, error: "Log in again." };

  try {
    const { data, error } = await api.PATCH("/api/v1/subscriptions/plans/{id}", {
      params: { path: { id } },
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) return { plan: null, error: apiMessage(error, "Couldn't save that.") };
    return { plan: data, error: null };
  } catch {
    return { plan: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function recordSubscription(
  body: NewSubscription,
): Promise<{ subscription: Subscription | null; error: string | null }> {
  const token = await accessToken();
  if (!token) return { subscription: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/subscriptions", {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (error || !data) {
      return { subscription: null, error: apiMessage(error, "Couldn't record that.") };
    }
    return { subscription: data, error: null };
  } catch {
    return { subscription: null, error: "Couldn't reach the server. Try again." };
  }
}

/** "₹4,999", and "Free" rather than "₹0". */
export function formatPrice(amount: number): string {
  return amount === 0 ? "Free" : `₹${amount.toLocaleString("en-IN")}`;
}

/** "per year", "per month", "per event". */
export function formatPeriod(plan: { kind: string; periodMonths: number | null }): string {
  if (plan.kind === "per_event") return "per event";
  if (!plan.periodMonths) return "";
  if (plan.periodMonths === 1) return "per month";
  if (plan.periodMonths === 12) return "per year";
  return `per ${plan.periodMonths} months`;
}

/** What a cap means, in the words a person would use. */
export function formatAllowance(maxActiveEvents: number | null): string {
  if (maxActiveEvents === null) return "Unlimited events";
  if (maxActiveEvents === 0) return "Listing only — events bought one at a time";
  return maxActiveEvents === 1 ? "1 event at a time" : `${maxActiveEvents} events at a time`;
}
