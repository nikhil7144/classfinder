"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Alerts = {
  pending_pitches: number;
  groups_needing_members: number;
  accepted_pitches: number;
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

/** Total things actually waiting on this person to act. */
export function waitingCount(alerts: Alerts | null): number {
  if (!alerts) return 0;
  return Number(alerts.pending_pitches || 0) + Number(alerts.accepted_pitches || 0);
}
