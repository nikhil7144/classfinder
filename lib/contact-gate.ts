"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Whether this visitor may contact this coach, and why not when they may not.
 *
 * Extracted when queries arrived, because both ways of reaching a coach ask
 * exactly the same four questions — signed in, a seeker, profile finished, and
 * not already holding a live one of these. Two copies would have drifted the
 * first time one of those rules changed, and one of them is a rule the
 * database enforces as a unique index.
 */
export type ContactGate =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "incomplete" }
  | { state: "provider" }
  | { state: "existing" }
  | { state: "ready" };

type Options = {
  providerId: string;
  /**
   * Which live row would block a new one — `enquiries` for a message,
   * `queries` for a call request. Each has its own partial unique index, so a
   * parent may hold one of each with the same coach.
   */
  table: "enquiries" | "queries";
  /** Statuses that mean the row is finished and no longer blocks. */
  closedStatuses: string[];
};

export function useContactGate({ providerId, table, closedStatuses }: Options): {
  gate: ContactGate;
  me: string | null;
  refresh: () => void;
} {
  const [gate, setGate] = useState<ContactGate>({ state: "loading" });
  const [me, setMe] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!alive) return;

      if (!auth.user) {
        setGate({ state: "guest" });
        return;
      }
      setMe(auth.user.id);

      const [{ data: profile }, { data: existing }] = await Promise.all([
        supabase.from("profiles").select("role, profile_complete").eq("id", auth.user.id).maybeSingle(),
        // The same rule the partial unique index enforces, said before they
        // write rather than as a constraint violation afterwards.
        supabase
          .from(table)
          .select("id")
          .eq("provider_id", providerId)
          .eq("seeker_id", auth.user.id)
          .not("status", "in", `(${closedStatuses.join(",")})`)
          .maybeSingle(),
      ]);

      if (!alive) return;
      if (existing) return setGate({ state: "existing" });
      if (profile?.role !== "seeker") return setGate({ state: "provider" });
      if (!profile?.profile_complete) return setGate({ state: "incomplete" });
      setGate({ state: "ready" });
    };

    check();
    return () => {
      alive = false;
    };
    // closedStatuses is a literal at every call site; joining it keeps the
    // dependency a string rather than a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, table, closedStatuses.join(","), nonce]);

  return { gate, me, refresh: () => setNonce((n) => n + 1) };
}
