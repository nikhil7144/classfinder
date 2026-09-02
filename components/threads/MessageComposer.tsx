"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder?: string;
};

/** Roughly eight lines. Past that the box scrolls instead of eating the thread. */
const MAX_HEIGHT_PX = 160;

/**
 * The message box.
 *
 * Was a single-line `<input>` in both panes, inherited from MentBridge, which
 * has three problems for anything longer than a sentence: the box never grows,
 * so a parent writing a paragraph sees a sliding one-line window of their own
 * message; there is no way to type a second line at all; and Enter fired a
 * bare handler that never called preventDefault.
 *
 * A textarea that grows to a cap fixes all three. Shared by both panes because
 * the auto-grow measurement is exactly the kind of fiddly code that drifts
 * when it exists twice.
 */
export default function MessageComposer({
  value,
  onChange,
  onSend,
  sending,
  placeholder = "Write a message…",
}: Props) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Measure after every change: reset to auto first, or scrollHeight only ever
  // reports the height it already has and the box can grow but never shrink.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const wanted = el.scrollHeight;
    el.style.height = `${Math.min(wanted, MAX_HEIGHT_PX)}px`;
    // Only carry a scrollbar once there is something to scroll. Left on
    // permanently, a one-line box shows the scroll arrows as decoration —
    // sub-pixel rounding on line-height is enough to trip it.
    el.style.overflowY = wanted > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value]);

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={box}
        rows={1}
        className="cf-input max-h-40 resize-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // isComposing matters here rather than being defensive boilerplate:
          // an IME is how a lot of this audience types, and Enter mid-compose
          // is choosing a candidate word, not sending the message.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="cf-btn-primary shrink-0"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
