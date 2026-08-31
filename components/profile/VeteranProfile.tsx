"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  AVAILABILITY_DAYS,
  createDefaultWeeklyAvailability,
  hasAnyAvailability,
  normalizeWeeklyAvailability,
  WeeklyAvailability,
} from "@/lib/veteran-availability";

type VeteranProfileData = {
  id?: string;
  name?: string | null;
  headline?: string | null;
  bio?: string | null;
  support_details?: string | null;
  photo_url?: string | null;
  experience_years?: number | null;
  industries?: string[] | null;
  expertise_ids?: string[] | null;
  expertise_names?: string[] | null;
  past_companies?: { company: string; years: string }[] | null;
  linkedin_url?: string | null;
  approved?: boolean | null;
  availability_schedule?: WeeklyAvailability | null;
};

function AvailabilityEditor({
  initialAvailability,
  onClose,
  onSave,
  saving,
}: {
  initialAvailability: WeeklyAvailability;
  onClose: () => void;
  onSave: (value: WeeklyAvailability) => Promise<void>;
  saving: boolean;
}) {
  const [availability, setAvailability] = useState<WeeklyAvailability>(initialAvailability);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <div className="flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900">Change Availability</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Update the weekly slots startups can see before sending a request.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-500"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-4">
          {AVAILABILITY_DAYS.map((day) => (
            <div
              key={day.key}
              className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[160px_1fr_1fr]"
            >
              <label className="flex items-center gap-3 font-medium text-gray-900">
                <input
                  type="checkbox"
                  checked={availability[day.key].enabled}
                  onChange={(event) =>
                    setAvailability({
                      ...availability,
                      [day.key]: {
                        ...availability[day.key],
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
                {day.label}
              </label>

              <input
                type="time"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400 disabled:bg-gray-100"
                value={availability[day.key].from}
                onChange={(event) =>
                  setAvailability({
                    ...availability,
                    [day.key]: {
                      ...availability[day.key],
                      from: event.target.value,
                    },
                  })
                }
                disabled={!availability[day.key].enabled}
              />

              <input
                type="time"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400 disabled:bg-gray-100"
                value={availability[day.key].to}
                onChange={(event) =>
                  setAvailability({
                    ...availability,
                    [day.key]: {
                      ...availability[day.key],
                      to: event.target.value,
                    },
                  })
                }
                disabled={!availability[day.key].enabled}
              />
            </div>
          ))}
        </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(availability)}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save Availability"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function VeteranProfile({
  data,
  email,
}: {
  data: VeteranProfileData;
  email: string;
}) {
  const router = useRouter();
  const [availabilitySchedule, setAvailabilitySchedule] = useState<WeeklyAvailability>(
    normalizeWeeklyAvailability(data?.availability_schedule || createDefaultWeeklyAvailability())
  );
  const [showAvailabilityEditor, setShowAvailabilityEditor] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);

  const saveAvailability = async (value: WeeklyAvailability) => {
    if (!data?.id) return;

    setSavingAvailability(true);

    const { error } = await supabase
      .from("veterans")
      .update({ availability_schedule: value })
      .eq("id", data.id);

    if (error) {
      alert(error.message || "Unable to update availability.");
      setSavingAvailability(false);
      return;
    }

    setAvailabilitySchedule(value);
    setSavingAvailability(false);
    setShowAvailabilityEditor(false);
    alert("Availability updated.");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10 py-8 lg:py-16">
      <div className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)] sm:p-8 lg:p-12">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/40 to-transparent pointer-events-none" />

        <div className="relative z-10 space-y-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
              {data?.photo_url ? (
                <img
                  src={data.photo_url || "/avatar-placeholder.png"}
                  alt="Industry Expert Photo"
                  className="w-28 h-28 object-cover rounded-full border"
                />
              ) : (
                <img
                  src="/avatar-placeholder.png"
                  alt="Industry Expert Photo"
                  className="w-28 h-28 object-cover rounded-full border bg-white"
                />
              )}

              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                  {data?.name || "Industry Expert"}
                </h1>

                <p className="text-lg text-gray-500 mt-2">
                  {data?.headline || "Add a professional headline"}
                </p>

                <p className="text-sm text-gray-400 mt-3">{email}</p>
              </div>
            </div>

            <button
              onClick={() => router.push("/complete-profile/veteran?edit=true")}
              className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-white shadow-md transition hover:bg-indigo-700 hover:shadow-lg sm:w-auto"
            >
              Edit Profile
            </button>
          </div>

          <div className="border-t border-gray-200" />

          {data?.bio && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900">About</h2>
              <p className="text-gray-600 leading-relaxed text-[15px] max-w-4xl">{data.bio}</p>
            </div>
          )}

          {data?.support_details && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900">Support I Can Offer</h2>
              <p className="text-gray-600 leading-relaxed text-[15px] max-w-4xl">
                {data.support_details}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
        <InfoBlock label="Experience">
          {data?.experience_years ? `${data.experience_years} years` : "Not set"}
        </InfoBlock>

        <InfoBlock label="Industries">
          {data?.industries?.length ? data.industries.join(", ") : "Not set"}
        </InfoBlock>

        <InfoBlock label="Past Companies">
          {data?.past_companies?.length
            ? data.past_companies.map((c) => `${c.company} (${c.years} yrs)`).join(", ")
            : "Not specified"}
        </InfoBlock>

        <InfoBlock label="Expertise">
          {data?.expertise_ids?.length ? data.expertise_names?.join(", ") : "Not set"}
        </InfoBlock>

        <InfoBlock label="LinkedIn">
          {data?.linkedin_url ? (
            <a
              href={data.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              View LinkedIn Profile
            </a>
          ) : (
            "Not set"
          )}
        </InfoBlock>

        <InfoBlock label="Approval Status">
          {data?.approved ? (
            <span className="text-green-600 font-medium">Approved</span>
          ) : (
            <span className="text-orange-500 font-medium">Pending Approval</span>
          )}
        </InfoBlock>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Weekly Availability</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Startups see this schedule before sending association requests.
            </p>
          </div>

          <button
            onClick={() => setShowAvailabilityEditor(true)}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Change Availability
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {AVAILABILITY_DAYS.map((day) => {
            const slot = availabilitySchedule[day.key];

            return (
              <div
                key={day.key}
                className={`rounded-2xl border p-4 ${
                  slot.enabled
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-gray-900">{day.label}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      slot.enabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {slot.enabled ? "Available" : "Unavailable"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-gray-600">
                  {slot.enabled ? `${slot.from} - ${slot.to}` : "Not available"}
                </p>
              </div>
            );
          })}
        </div>

        {!hasAnyAvailability(availabilitySchedule) && (
          <p className="mt-4 text-sm text-gray-500">
            No slots marked yet. Add at least one day so startups can plan outreach better.
          </p>
        )}
      </div>

      {showAvailabilityEditor && (
        <AvailabilityEditor
          initialAvailability={availabilitySchedule}
          onClose={() => setShowAvailabilityEditor(false)}
          onSave={saveAvailability}
          saving={savingAvailability}
        />
      )}
    </div>
  );
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition duration-200">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className="text-lg font-semibold text-gray-800">{children}</p>
    </div>
  );
}
