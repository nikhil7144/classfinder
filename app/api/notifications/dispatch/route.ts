import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabase-server";
import { BRAND } from "@/lib/brand";

/**
 * Drains the notification queue written by the triggers in phase2n.
 *
 * Deliberately a worker rather than a send-at-write-time call. Triggers queue
 * a row and return; this drains it. That means a mail provider being down
 * delays a notification instead of failing a message insert, retries are just
 * a second pass over the same rows, and the mobile app — which writes to
 * Supabase directly and never touches this app — gets notifications for free.
 *
 * Called on a schedule (Vercel Cron, Supabase pg_cron via pg_net, or any
 * external cron) with the shared secret. Not public: it reads email addresses.
 */

type Pending = {
  id: string;
  email: string;
  kind: string;
  title: string;
  body: string | null;
  url: string;
};

const BATCH = 50;

function siteUrl(): string {
  return BRAND.siteUrl.replace(/\/$/, "");
}

/**
 * Plain, short, and honest about what it is. A notification email exists to
 * get someone back to the conversation, so the link is the content; anything
 * longer invites people to reply to a no-reply address.
 */
function renderEmail(n: Pending): { subject: string; html: string; text: string } {
  const link = `${siteUrl()}${n.url}`;
  const preview = n.body?.trim();

  const text = [
    n.title,
    preview ? `\n"${preview}"` : "",
    `\nOpen it: ${link}`,
    `\n— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2328">
      <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(n.title)}</h1>
      ${
        preview
          ? `<p style="margin:0 0 20px;padding:12px 14px;background:#f4f4f5;border-radius:12px;font-size:14px;line-height:1.5;color:#3f3f46">${escapeHtml(
              preview
            )}</p>`
          : ""
      }
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#1f2328;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Open the conversation</a>
      </p>
      <p style="margin:0;font-size:12px;color:#71717a">${escapeHtml(BRAND.name)}</p>
    </div>`;

  return { subject: n.title, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(n: Pending): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return "RESEND_API_KEY or NOTIFICATION_FROM_EMAIL is not set.";

  const { subject, html, text } = renderEmail(n);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [n.email], subject, html, text }),
  });

  if (!response.ok) {
    // Kept on the row rather than only logged: five failures park a
    // notification, and without the reason nobody can tell a bad address from
    // a bad API key.
    return `${response.status}: ${(await response.text()).slice(0, 300)}`;
  }
  return null;
}

/**
 * What this worker would use, without using it.
 *
 * Exists because a wrong NEXT_PUBLIC_SITE_URL is the one misconfiguration
 * that cannot be undone: the links are wrong, the rows are marked sent, and
 * nothing retries them. Reading the file on disk doesn't prove the running
 * server reloaded it. Same secret as POST; reports no key material.
 */
export async function GET(request: Request) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    origin: siteUrl(),
    sampleLink: `${siteUrl()}/account/messages?thread=<id>`,
    from: process.env.NOTIFICATION_FROM_EMAIL ?? null,
    resendKeySet: Boolean(process.env.RESEND_API_KEY),
  });
}

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Dispatch secret is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // BRAND.siteUrl falls back to localhost for local development. Mailing a
  // link nobody outside this machine can open is worse than not mailing: the
  // row would be marked sent and never retried once the domain exists.
  if (siteUrl().includes("localhost")) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SITE_URL still points at localhost; refusing to send." },
      { status: 500 }
    );
  }

  // pending_notifications joins auth.users for the address and is granted to
  // the service role alone.
  const { data, error } = await supabaseServerAdmin.rpc("pending_notifications", {
    p_limit: BATCH,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = (data as Pending[]) || [];
  let sent = 0;
  let failed = 0;

  // Sequential on purpose. The batch is small, mail providers rate-limit, and
  // a burst that trips the limit turns one late email into fifty.
  for (const n of pending) {
    let failure: string | null;
    try {
      failure = await sendEmail(n);
    } catch (e) {
      failure = e instanceof Error ? e.message : "Unknown send error.";
    }

    await supabaseServerAdmin.rpc("mark_notification_sent", {
      p_id: n.id,
      p_error: failure,
    });

    if (failure) failed += 1;
    else sent += 1;
  }

  return NextResponse.json({ considered: pending.length, sent, failed });
}
