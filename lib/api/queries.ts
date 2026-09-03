import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Queries — leads, not conversations.
 *
 * Browser-only: every call carries the caller's token. Nothing here fails
 * soft. A parent pressing "ask them to call" and getting silence is worse than
 * an error, and a coach whose worklist quietly renders empty would assume
 * nobody had asked.
 */

export type Query = components["schemas"]["QueryDto"];
export type QueryStatus = Query["status"];

export const QUERY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  callback_scheduled: "Call booked",
  completed: "Completed",
  closed: "Closed",
};

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** The API's own message where there is one — it names the field. */
function messageFrom(error: unknown, fallback: string): string {
  const m = (error as { message?: string | string[] } | undefined)?.message;
  if (Array.isArray(m)) return m[0];
  return m ?? fallback;
}

export async function fetchQueries(
  status?: QueryStatus,
): Promise<{ queries: Query[]; error: string | null }> {
  const t = await token();
  if (!t) return { queries: [], error: "Log in again." };

  try {
    const { data, error } = await api.GET("/api/v1/queries", {
      headers: { Authorization: `Bearer ${t}` },
      params: { query: status ? { status } : {} },
    });
    if (error || !data) return { queries: [], error: "Couldn't load these." };
    return { queries: data, error: null };
  } catch {
    return { queries: [], error: "Couldn't reach the server. Try again." };
  }
}

export async function raiseQuery(body: {
  providerId: string;
  contactName: string;
  contactPhone: string;
  serviceCategoryId?: string;
  details?: string;
}): Promise<{ query: Query | null; error: string | null }> {
  const t = await token();
  if (!t) return { query: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/queries", {
      headers: { Authorization: `Bearer ${t}` },
      body,
    });
    if (error || !data) return { query: null, error: messageFrom(error, "Couldn't send that.") };
    return { query: data, error: null };
  } catch {
    return { query: null, error: "Couldn't reach the server. Try again." };
  }
}

export async function setQueryStatus(
  id: string,
  status: QueryStatus,
  callbackAt?: string,
): Promise<{ query: Query | null; error: string | null }> {
  const t = await token();
  if (!t) return { query: null, error: "Log in again." };

  try {
    const { data, error } = await api.PATCH("/api/v1/queries/{id}/status", {
      headers: { Authorization: `Bearer ${t}` },
      params: { path: { id } },
      body: { status, ...(callbackAt ? { callbackAt } : {}) },
    });
    if (error || !data) return { query: null, error: messageFrom(error, "Couldn't update that.") };
    return { query: data, error: null };
  } catch {
    return { query: null, error: "Couldn't reach the server. Try again." };
  }
}

/**
 * Reply in writing. Returns the conversation to open — an existing thread
 * with this family if there was one, so nobody ends up with two.
 */
export async function answerQuery(
  id: string,
  message: string,
): Promise<{ enquiryId: string | null; error: string | null }> {
  const t = await token();
  if (!t) return { enquiryId: null, error: "Log in again." };

  try {
    const { data, error } = await api.POST("/api/v1/queries/{id}/answer", {
      headers: { Authorization: `Bearer ${t}` },
      params: { path: { id } },
      body: { message },
    });
    if (error || !data) return { enquiryId: null, error: messageFrom(error, "Couldn't send that.") };
    return { enquiryId: data.enquiryId, error: null };
  } catch {
    return { enquiryId: null, error: "Couldn't reach the server. Try again." };
  }
}
