"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EXAM_SUBGROUP_LABEL as SUBGROUP_LABEL,
  EXAM_SUBGROUP_ORDER,
  serviceMatches,
} from "@/lib/requirements";

export type ServiceCategory = {
  id: string;
  name: string;
  group: string;
  /** Only `competitive_exam` has these. See EXAM_SUBGROUP_ORDER. */
  subgroup?: string | null;
  /** Searched, never shown. "IIT JEE" finds JEE Advanced. */
  aliases?: string[] | null;
};

// Explicit order + labels. Without this the groups render in whatever order
// they arrive in, which once put "Mind Games" above "Sports" and buried the
// most common picks.
export const SERVICE_GROUP_ORDER: { key: string; label: string }[] = [
  { key: "sport", label: "Sports" },
  { key: "wellness_fitness", label: "Wellness & Fitness" },
  { key: "mind_game", label: "Mind Games" },
  { key: "indoor_game", label: "Indoor Games" },
  { key: "dance", label: "Dance" },
  { key: "music", label: "Music" },
  { key: "acting", label: "Acting & Theatre" },
  { key: "subject", label: "School Subjects" },
  { key: "exam_board", label: "School Boards" },
  { key: "competitive_exam", label: "Exams & Certifications" },
];

// The stream list and the alias matcher live in lib/requirements.ts, with
// the group labels, rather than in a fifth copy here. Phase 3F's migration
// complained about four copies of one list; this is the start of paying that
// down.

/**
 * Split a group into its streams, in EXAM_SUBGROUP_ORDER.
 *
 * Anything with no subgroup — every other group, and an exam an admin added
 * from the taxonomy page without picking a stream — falls into one unnamed
 * bucket rather than disappearing.
 */
function bySubgroup(items: ServiceCategory[]) {
  const buckets = new Map<string, ServiceCategory[]>();
  for (const item of items) {
    const key = item.subgroup || "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const ordered = EXAM_SUBGROUP_ORDER.filter((s) => buckets.has(s.key)).map((s) => ({
    key: s.key,
    label: s.label,
    items: buckets.get(s.key)!,
  }));

  const loose = buckets.get("");
  return loose ? [...ordered, { key: "", label: "Other", items: loose }] : ordered;
}

// The provider already told us their category, so lead with the groups that
// category actually teaches. This only reorders and pre-opens sections —
// nothing is hidden, since a sports academy may well also run yoga.
export const CATEGORY_GROUP_HINTS: Record<string, string[]> = {
  Coach: ["sport", "mind_game", "indoor_game"],
  "Academic Teacher": ["subject", "exam_board"],
  "Home Tutor": ["subject", "exam_board"],
  "Sports Academy": ["sport"],
  "Sports Center": ["sport", "wellness_fitness"],
  "Coaching Center": ["competitive_exam", "subject", "exam_board"],
  "Dance Teacher": ["dance"],
  "Music Teacher": ["music"],
  "Dance Academy": ["dance"],
  "Music School": ["music"],
  "Acting Teacher": ["acting"],
  "Acting School": ["acting"],
};

const GROUP_TONE: Record<string, string> = {
  sport: "var(--sport)",
  wellness_fitness: "var(--wellness)",
  mind_game: "var(--mind)",
  indoor_game: "var(--indoor)",
  dance: "var(--dance)",
  music: "var(--music)",
  // acting shipped in phase 3F without a dot here, so its sections drew a
  // colourless one. lib/events.ts had it; this copy did not, which is the
  // cost of the same map living in two files.
  acting: "var(--acting)",
  subject: "var(--subject)",
  exam_board: "var(--board)",
  competitive_exam: "var(--exam)",
};

// Past this a section stops being scannable and becomes a wall.
const INLINE_OPTION_LIMIT = 20;

type Props = {
  categories: ServiceCategory[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  suggestedForCategory?: string;
  invalid?: boolean;
};

export default function ServiceCategoryPicker({
  categories,
  selectedIds,
  onChange,
  suggestedForCategory,
  invalid,
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  // Which stream the modal opened on. Null means "all of them", which is
  // what the group header opens, and what clearing the filter returns to.
  const [modalSubgroup, setModalSubgroup] = useState<string | null>(null);

  const byGroup = useMemo(() => {
    return categories.reduce<Record<string, ServiceCategory[]>>((acc, item) => {
      (acc[item.group] = acc[item.group] || []).push(item);
      return acc;
    }, {});
  }, [categories]);

  const query = search.trim().toLowerCase();
  const suggested = CATEGORY_GROUP_HINTS[suggestedForCategory || ""] || [];

  const selected = useMemo(
    () => categories.filter((c) => selectedIds.includes(c.id)),
    [categories, selectedIds]
  );

  const groups = useMemo(() => {
    const all = SERVICE_GROUP_ORDER.map(({ key, label }) => {
      const items = byGroup[key] || [];
      return {
        key,
        label,
        total: items.length,
        suggested: suggested.includes(key),
        items: query ? items.filter((i) => serviceMatches(i, query)) : items,
        selectedCount: items.filter((i) => selectedIds.includes(i.id)).length,
        // Only competitive_exam has these today, but the picker asks the data
        // rather than the group name, so a second streamed group needs no
        // change here.
        streams: items.some((i) => i.subgroup)
          ? bySubgroup(items).map((sub) => ({
              ...sub,
              selectedCount: sub.items.filter((i) => selectedIds.includes(i.id)).length,
            }))
          : [],
      };
    }).filter((g) => g.total > 0);

    return [...all.filter((g) => g.suggested), ...all.filter((g) => !g.suggested)];
  }, [byGroup, query, selectedIds, suggested]);

  const modalLabel = SERVICE_GROUP_ORDER.find((g) => g.key === modalKey)?.label || "";
  // Sections, not a flat list: one per stream for a group that has them, and
  // a single unlabelled section for a group that does not. Searching looks
  // across every stream — the whole point of typing "IIT" is not knowing
  // which one it is in — so a filtered modal ignores the chosen stream.
  const modalSections = useMemo(() => {
    if (!modalKey) return [];
    const items = byGroup[modalKey] || [];
    const q = modalSearch.trim().toLowerCase();
    if (q) {
      const hits = items.filter((i) => serviceMatches(i, q));
      return items.some((i) => i.subgroup)
        ? bySubgroup(hits)
        : hits.length
          ? [{ key: "", label: "", items: hits }]
          : [];
    }
    if (!items.some((i) => i.subgroup)) return [{ key: "", label: "", items }];
    const sections = bySubgroup(items);
    return modalSubgroup ? sections.filter((sec) => sec.key === modalSubgroup) : sections;
  }, [modalKey, byGroup, modalSearch, modalSubgroup]);

  const modalCount = modalSections.reduce((n, sec) => n + sec.items.length, 0);

  const closeModal = () => {
    setModalKey(null);
    setModalSearch("");
    setModalSubgroup(null);
  };

  useEffect(() => {
    if (!modalKey) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalKey]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-surface-2 p-3">
          {selected.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              aria-label={`Remove ${item.name}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-ink px-3.5 py-2 text-sm font-semibold text-[#1a0d06]"
            >
              {item.name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <input
        className="cf-input"
        placeholder="Search — e.g. Cricket, Physics, JEE, Guitar"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div
        className={`mt-4 space-y-3 ${
          invalid ? "rounded-2xl border border-danger/50 bg-danger-soft/40 p-4" : ""
        }`}
      >
        {groups.map((group) => {
          const open = query ? group.items.length > 0 : expanded[group.key] ?? group.suggested;
          if (query && group.items.length === 0) return null;

          return (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-line">
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [group.key]: !open }))}
                className="flex w-full items-center justify-between gap-3 bg-surface-2 px-4 py-3 text-left transition hover:bg-surface-3"
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ background: GROUP_TONE[group.key] }}
                  />
                  {group.label}
                  <span className="font-mono text-xs font-normal text-faint">
                    {query ? `${group.items.length}/${group.total}` : group.total}
                  </span>
                  {group.suggested && !query && (
                    <span className="cf-badge cf-badge-ok">Usual for {suggestedForCategory}</span>
                  )}
                  {group.selectedCount > 0 && (
                    <span className="cf-badge cf-badge-neutral">{group.selectedCount} selected</span>
                  )}
                </span>
                {!query && <span className="text-faint">{open ? "−" : "+"}</span>}
              </button>

              {open && (
                <div className="border-t border-line-soft px-4 py-3">
                  {/* A streamed group opens on its streams, not on the first
                      20 of 200 rows in alphabetical order — which for exams
                      meant ACT, ACCA, AFCAT and no JEE anywhere in sight.
                      Searching skips this and matches rows directly. */}
                  {group.streams.length > 0 && !query ? (
                    <div className="flex flex-wrap gap-2">
                      {group.streams.map((stream) => (
                        <button
                          key={stream.key || "other"}
                          type="button"
                          onClick={() => {
                            setModalKey(group.key);
                            setModalSearch("");
                            setModalSubgroup(stream.key || null);
                          }}
                          className="cf-pill"
                          data-selected={stream.selectedCount > 0}
                        >
                          {stream.label}
                          <span className="ml-1.5 font-mono text-xs text-faint">
                            {stream.selectedCount > 0
                              ? `${stream.selectedCount}/${stream.items.length}`
                              : stream.items.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {group.items.slice(0, INLINE_OPTION_LIMIT).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="cf-pill"
                          data-selected={selectedIds.includes(item.id)}
                          onClick={() => toggle(item.id)}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {(group.streams.length > 0 || group.items.length > INLINE_OPTION_LIMIT) &&
                    !query && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalKey(group.key);
                          setModalSearch("");
                          setModalSubgroup(null);
                        }}
                        className="mt-3 text-sm font-semibold text-gold transition hover:text-accent-ink"
                      >
                        View all {group.total} {group.label.toLowerCase()} →
                      </button>
                    )}

                  {query && group.items.length > INLINE_OPTION_LIMIT && (
                    <p className="mt-3 font-mono text-xs text-faint">
                      Showing {INLINE_OPTION_LIMIT} of {group.items.length} matches — keep typing to
                      narrow.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {query && groups.every((g) => g.items.length === 0) && (
          <p className="px-1 py-2 text-sm text-muted">Nothing matches “{search.trim()}”.</p>
        )}
      </div>

      {modalKey && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`All ${modalLabel} options`}
        >
          <div
            className="mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h3 className="cf-display text-lg text-ink">
                  {modalSubgroup ? SUBGROUP_LABEL[modalSubgroup] || modalLabel : modalLabel}
                </h3>
                <p className="mt-1 font-mono text-xs text-faint">
                  {selected.filter((s) => s.group === modalKey).length} of{" "}
                  {(byGroup[modalKey] || []).length} selected
                </p>
                {modalSubgroup && (
                  <button
                    type="button"
                    onClick={() => setModalSubgroup(null)}
                    className="mt-2 text-sm font-semibold text-gold transition hover:text-accent-ink"
                  >
                    ← All {modalLabel.toLowerCase()}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="rounded-full px-3 py-1 text-2xl leading-none text-faint transition hover:bg-surface-3 hover:text-ink"
              >
                ×
              </button>
            </div>

            <div className="border-b border-line px-6 py-4">
              <input
                autoFocus
                className="cf-input"
                placeholder={`Search ${modalLabel.toLowerCase()}…`}
                aria-label={`Search ${modalLabel}`}
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {modalCount === 0 ? (
                <p className="text-sm text-muted">Nothing matches “{modalSearch.trim()}”.</p>
              ) : (
                modalSections.map((section) => (
                  <div key={section.key || "all"}>
                    {/* A single unnamed section is a group without streams —
                        it gets no heading, so nothing changes for Sports. */}
                    {section.label && (
                      <h4 className="mb-2 font-mono text-xs uppercase tracking-wide text-faint">
                        {section.label}
                      </h4>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="cf-pill"
                          data-selected={selectedIds.includes(item.id)}
                          onClick={() => toggle(item.id)}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-line px-6 py-4">
              <button type="button" onClick={closeModal} className="cf-btn-primary w-full">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
