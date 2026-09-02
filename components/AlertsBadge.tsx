"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Alerts = {
  pending_pitches: number;
  groups_needing_members: number;
  accepted_pitches: number;
  /** Coaches who have asked to teach this parent's child — see phase2r. */
  pending_approaches: number;
  /** Conversations with something new in them, group and direct together. */
  unread_threads: number;
  /** Enquiries a coach has never answered — see phase2l. */
  unanswered_enquiries: number;
  /** One de-duplicated total of everything actually waiting on this person. */
  needs_you: number;
};

/**
 * A pitch arriving is the moment Groups exists for, and it used to be
 * invisible unless the parent happened to open the group. One cheap call
 * gives every surface that needs a count the same numbers.
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !active) return;

      const { data } = await supabase.rpc("my_alerts");
      if (active) setAlerts(data as Alerts | null);
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  return alerts;
}

/**
 * Total things actually waiting on this person to act.
 *
 * Counted in the database over threads, not added up here: an unread pitch
 * that also needs a decision is one thing waiting, and summing the individual
 * counts told people they had twice as much to do as they did.
 */
export function waitingCount(alerts: Alerts | null): number {
  return Number(alerts?.needs_you || 0);
}
