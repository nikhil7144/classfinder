"use client";

import { useEffect, useMemo, useState } from "react";

export type ServiceCategory = { id: string; name: string; group: string };

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
  { key: "exam_board", label: "Boards & Exams" },
];

// The provider already told us their category, so lead with the groups that
// category actually teaches. This only reorders and pre-opens sections —
// nothing is hidden, since a sports academy may well also run yoga.
export const CATEGORY_GROUP_HINTS: Record<string, string[]> = {
  Coach: ["sport", "mind_game", "indoor_game"],
  "Academic Teacher": ["subject", "exam_board"],
  "Home Tutor": ["subject", "exam_board"],
  "Sports Academy": ["sport"],
  "Sports Center": ["sport", "wellness_fitness"],
  "Coaching Center": ["subject", "exam_board"],
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
  subject: "var(--subject)",
  exam_board: "var(--exam)",
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
        items: query ? items.filter((i) => i.name.toLowerCase().includes(query)) : items,
        selectedCount: items.filter((i) => selectedIds.includes(i.id)).length,
      };
    }).filter((g) => g.total > 0);

    return [...all.filter((g) => g.suggested), ...all.filter((g) => !g.suggested)];
  }, [byGroup, query, selectedIds, suggested]);

  const modalLabel = SERVICE_GROUP_ORDER.find((g) => g.key === modalKey)?.label || "";
  const modalItems = useMemo(() => {
    if (!modalKey) return [];
    const items = byGroup[modalKey] || [];
    const q = modalSearch.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [modalKey, byGroup, modalSearch]);

  const closeModal = () => {
    setModalKey(null);
    setModalSearch("");
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

                  {group.items.length > INLINE_OPTION_LIMIT && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalKey(group.key);
                        setModalSearch("");
                      }}
                      className="mt-3 text-sm font-semibold text-gold transition hover:text-accent-ink"
                    >
                      View all {group.total} {group.label.toLowerCase()} →
                    </button>
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
                <h3 className="cf-display text-lg text-ink">{modalLabel}</h3>
                <p className="mt-1 font-mono text-xs text-faint">
                  {selected.filter((s) => s.group === modalKey).length} of{" "}
                  {(byGroup[modalKey] || []).length} selected
                </p>
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
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {modalItems.length === 0 ? (
                <p className="text-sm text-muted">Nothing matches “{modalSearch.trim()}”.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {modalItems.map((item) => (
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
