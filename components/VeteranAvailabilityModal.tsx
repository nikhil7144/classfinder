"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AVAILABILITY_DAYS,
  hasAnyAvailability,
  WeeklyAvailability,
} from "@/lib/veteran-availability";

type VeteranAvailabilityModalProps = {
  isOpen: boolean;
  onClose: () => void;
  veteranId: string;
  veteranName?: string | null;
  availability: WeeklyAvailability;
};

export default function VeteranAvailabilityModal({
  isOpen,
  onClose,
  veteranId,
  veteranName,
  availability,
}: VeteranAvailabilityModalProps) {
  const [requestMessage, setRequestMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const sendRequest = async () => {
    if (sending) return;

    setSending(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      alert("Please log in as a startup to send a request.");
      setSending(false);
      return;
    }

    const response = await fetch("/api/associations/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        veteranId,
        message: requestMessage,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Unable to send request.");
      setSending(false);
      return;
    }

    alert("Association request sent.");
    setRequestMessage("");
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <div className="flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
              Weekly Availability
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              {veteranName || "Industry expert"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Review available days and time ranges before sending an association request.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 md:grid-cols-2">
          {AVAILABILITY_DAYS.map((day) => {
            const slot = availability[day.key];

            return (
              <div
                key={day.key}
                className={`rounded-2xl border p-4 ${
                  slot.enabled
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-slate-900">{day.label}</span>
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

                <p className="mt-3 text-sm text-slate-600">
                  {slot.enabled ? `${slot.from} - ${slot.to}` : "Not available"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-900">
            {hasAnyAvailability(availability)
              ? "You can send a request directly from this popup."
              : "This industry expert has not marked any available time yet, but you can still send a request."}
          </p>

          <textarea
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            placeholder="Write a short message..."
            className="mt-4 min-h-28 w-full rounded-xl border border-indigo-100 bg-white p-3 text-sm outline-none focus:border-indigo-300"
            />
        </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={sendRequest}
            disabled={sending}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sending ? "Sending..." : "Send Association Request"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
