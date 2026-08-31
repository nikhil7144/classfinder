export type AvailabilityDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type AvailabilitySlot = {
  enabled: boolean;
  from: string;
  to: string;
};

export type WeeklyAvailability = Record<AvailabilityDay, AvailabilitySlot>;

export const AVAILABILITY_DAYS: { key: AvailabilityDay; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export function createDefaultWeeklyAvailability(): WeeklyAvailability {
  return {
    monday: { enabled: false, from: "09:00", to: "17:00" },
    tuesday: { enabled: false, from: "09:00", to: "17:00" },
    wednesday: { enabled: false, from: "09:00", to: "17:00" },
    thursday: { enabled: false, from: "09:00", to: "17:00" },
    friday: { enabled: false, from: "09:00", to: "17:00" },
    saturday: { enabled: false, from: "09:00", to: "13:00" },
    sunday: { enabled: false, from: "09:00", to: "13:00" },
  };
}

export function normalizeWeeklyAvailability(
  value: unknown
): WeeklyAvailability {
  const fallback = createDefaultWeeklyAvailability();

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const result = { ...fallback };

  for (const day of AVAILABILITY_DAYS) {
    const raw = (value as Record<string, unknown>)[day.key];

    if (raw && typeof raw === "object") {
      const slot = raw as Partial<AvailabilitySlot>;
      result[day.key] = {
        enabled: Boolean(slot.enabled),
        from: typeof slot.from === "string" ? slot.from : fallback[day.key].from,
        to: typeof slot.to === "string" ? slot.to : fallback[day.key].to,
      };
    }
  }

  return result;
}

export function hasAnyAvailability(availability: WeeklyAvailability) {
  return AVAILABILITY_DAYS.some((day) => availability[day.key].enabled);
}
