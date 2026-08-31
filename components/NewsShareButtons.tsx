"use client";

import { useState } from "react";

type NewsShareButtonsProps = {
  title: string;
  url: string;
};

const iconClass = "h-4 w-4";

export default function NewsShareButtons({ title, url }: NewsShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("Unable to copy the news link.");
    }
  };

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className={iconClass} aria-hidden="true">
          <path d="M6.94 8.5H3.56v10.88h3.38V8.5Zm.22-3.36A1.97 1.97 0 1 0 3.22 5.1a1.97 1.97 0 0 0 3.94.04ZM20.78 13.02c0-3.28-1.75-4.8-4.08-4.8-1.88 0-2.72 1.03-3.19 1.76V8.5h-3.38c.04.99 0 10.88 0 10.88h3.38v-6.08c0-.33.02-.66.12-.9.26-.66.86-1.35 1.87-1.35 1.32 0 1.85 1.01 1.85 2.49v5.84h3.38v-6.36Z" />
        </svg>
        LinkedIn
      </a>

      <a
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className={iconClass} aria-hidden="true">
          <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.25l-4.9-6.41L6.44 22H3.33l7.25-8.29L.8 2h6.4l4.43 5.85L18.9 2Zm-1.1 18h1.72L6.3 3.9H4.46L17.8 20Z" />
        </svg>
        X
      </a>

      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className={iconClass} aria-hidden="true">
          <path d="M20.52 3.48A11.9 11.9 0 0 0 12.04 0C5.5 0 .18 5.32.18 11.86c0 2.09.54 4.14 1.58 5.95L0 24l6.37-1.67a11.8 11.8 0 0 0 5.66 1.44h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.24-6.14-3.38-8.43ZM12.04 21.8c-1.8 0-3.56-.48-5.1-1.38l-.37-.22-3.78.99 1.01-3.69-.24-.38a9.8 9.8 0 0 1-1.52-5.26c0-5.44 4.43-9.87 9.88-9.87 2.64 0 5.12 1.03 6.98 2.89a9.8 9.8 0 0 1 2.88 6.98c0 5.44-4.43 9.86-9.86 9.86Zm5.41-7.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.95 1.16-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5a9.02 9.02 0 0 1-1.68-2.09c-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.5l-.57-.01c-.2 0-.52.08-.8.37-.27.3-1.05 1.02-1.05 2.48 0 1.45 1.07 2.86 1.21 3.05.15.2 2.1 3.2 5.09 4.49.71.31 1.26.49 1.69.62.71.23 1.35.2 1.86.12.57-.08 1.75-.71 2-1.4.25-.69.25-1.27.17-1.4-.08-.13-.28-.2-.58-.35Z" />
        </svg>
        WhatsApp
      </a>

      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10 14 21 3m0 0h-6.75M21 3v6.75M14 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" />
        </svg>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
