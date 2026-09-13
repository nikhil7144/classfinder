"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ServiceOption, sectionServices, serviceMatches } from "@/lib/requirements";

/**
 * Pick one service, or several, out of the whole taxonomy.
 *
 * A native <select> was fine at 176 rows and is not at 360: on a phone it
 * becomes a scroll wheel with no search, and the exam group alone is 200
 * entries deep. No browser lets you filter a <select>, so the control has to
 * be ours to have a search box at all.
 *
 * The sheet is the same on both — full screen on a phone, a centred card on a
 * desktop — because a parent picking "NEET UG" on a bus and a coach picking it
 * at a laptop are doing the identical job.
 */
type Props = {
  services: ServiceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Several answers allowed. Single-select closes on choice; this does not. */
  multiple?: boolean;
  /** Trigger text when nothing is chosen. */
  placeholder?: string;
  /** Single-select only: an explicit "no filter" row at the top. */
  noneLabel?: string;
  label?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export default function ServicePicker({
  services,
  selectedIds,
  onChange,
  multiple = false,
  placeholder = "Choose…",
  noneLabel,
  label,
  invalid,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds]
  );

  const sections = useMemo(() => {
    const matching = query.trim() ? services.filter((s) => serviceMatches(s, query)) : services;
    return sectionServices(matching);
  }, [services, query]);

  const matchCount = sections.reduce((n, s) => n + s.items.length, 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // The keyboard should be up already — the reason this sheet exists is to
    // be typed into, and a parent who has to tap the box first has gained
    // nothing over the dropdown.
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  // The page behind must not scroll while a full-screen sheet is over it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (id: string) => {
    if (!multiple) {
      onChange(id ? [id] : []);
      close();
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const triggerText = multiple
    ? selected.length === 0
      ? placeholder
      : `${selected.length} selected`
    : selected[0]?.name || placeholder;

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`cf-input flex w-full items-center justify-between gap-2 text-left disabled:opacity-60 ${
          invalid ? "border-danger/60" : ""
        }`}
      >
        <span className={selected.length === 0 ? "text-faint" : "text-ink"}>{triggerText}</span>
        <span aria-hidden="true" className="text-faint">
          ▾
        </span>
      </button>

      {/* Multi-select shows its answers under the trigger, because
          "4 selected" is not an answer to "what are you looking for". */}
      {multiple && selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(s.id)}
              aria-label={`Remove ${s.name}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-ink px-3 py-1.5 text-xs font-semibold text-[#1a0d06]"
            >
              {s.name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={label || "Choose a service"}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface sm:h-[80vh] sm:max-w-lg sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h3 className="cf-display text-base text-ink">{label || "What are you after?"}</h3>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {query.trim()
                    ? `${matchCount} of ${services.length}`
                    : `${services.length} to choose from`}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full px-3 py-1 text-2xl leading-none text-faint transition hover:bg-surface-3 hover:text-ink"
              >
                ×
              </button>
            </div>

            <div className="border-b border-line px-5 py-3">
              <input
                ref={searchRef}
                className="cf-input"
                placeholder="Search — JEE, NEET, Bank PO, IELTS, Cricket…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search services"
              />
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {!multiple && noneLabel && !query.trim() && (
                <button
                  type="button"
                  onClick={() => choose("")}
                  className="cf-pill"
                  data-selected={selectedIds.length === 0}
                >
                  {noneLabel}
                </button>
              )}

              {matchCount === 0 ? (
                <p className="text-sm text-muted">Nothing matches “{query.trim()}”.</p>
              ) : (
                sections.map((section) => (
                  <div key={section.key}>
                    <p className="mb-2 font-mono text-xs uppercase tracking-wide text-faint">
                      {section.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {section.items.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="cf-pill"
                          data-selected={selectedIds.includes(s.id)}
                          onClick={() => choose(s.id)}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-line px-5 py-4">
              <button type="button" onClick={close} className="cf-btn-primary w-full">
                {multiple
                  ? `Done${selected.length ? ` — ${selected.length} selected` : ""}`
                  : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
