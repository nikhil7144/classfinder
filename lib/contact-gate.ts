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
  | { state: "ready" }
  /** We could not work out whether they may. Never silently the same as "no". */
  | { state: "error"; reason: string };

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

      const [
        { data: profile, error: profileError },
        { data: existing, error: existingError },
      ] = await Promise.all([
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

      // A failed read is not a role. Mapping "we don't know" onto "you're a
      // coach" is what made this invisible: the form rendered nothing, and
      // nothing is indistinguishable from a coach looking at another coach.
      if (profileError) return setGate({ state: "error", reason: profileError.message });
      if (existingError) return setGate({ state: "error", reason: existingError.message });
      if (!profile) return setGate({ state: "error", reason: "No profile found for this account." });

      if (existing) return setGate({ state: "existing" });
      if (profile.role !== "seeker") return setGate({ state: "provider" });
      if (!profile.profile_complete) return setGate({ state: "incomplete" });
      setGate({ state: "ready" });
    };

    check().catch((e: unknown) => {
      // Anything thrown here used to leave the gate on "loading" for ever,
      // which renders as an absent form rather than a broken one.
      if (alive) {
        setGate({ state: "error", reason: e instanceof Error ? e.message : "Unknown error" });
      }
    });
    return () => {
      alive = false;
    };
    // closedStatuses is a literal at every call site; joining it keeps the
    // dependency a string rather than a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, table, closedStatuses.join(","), nonce]);

  return { gate, me, refresh: () => setNonce((n) => n + 1) };
}
