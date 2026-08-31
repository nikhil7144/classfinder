# Porting from MentBridge

ClassFinder started as a copy of the MentBridge codebase (`../bridgeup`,
github.com/nikhil7144/MentBridge). The MentBridge-specific product surface was
removed once it became clear it was serving live pages for a different product
against tables that don't exist in this database.

**Nothing was lost.** `bridgeup` is intact on disk and on GitHub, and every
deleted file is also in this repo's first commit (`5233aa4`). This file records
what to copy back, and when.

## Why deleting was safe

Every removed file queried a table that returns 404 here — `veterans`,
`startups`, `associations`, `messages`, `posts`, `blogs`, `startup_news`,
`industry_master`, `function_master`, `stage_master`, `startup_followers`.

Keeping them would not have saved any work. Reusing that logic requires
creating the tables under ClassFinder names and updating every query either
way; that effort is the same whether the file sat here for months or gets
copied from `bridgeup` on the day the phase starts. Meanwhile the copies were
serving `/why-mentbridge` and "MENTBRIDGE BLOG" to real visitors.

## What to copy back, by phase

Paths are relative to `../bridgeup`. The logic ports well — it's the table and
column names that change.

### Phase 2 — Spaces (photo/video posts, join, comments)

| Copy from bridgeup | Becomes | Rename |
|---|---|---|
| `app/account/create-post/page.tsx` | space post composer | `startup_id` → `space_id`; add `media_type` for video |
| `app/account/my-posts/page.tsx` | manage own space posts | same |
| `app/[startupSlug]/post/[postId]/page.tsx` | single post view | route by space slug |
| `startup_followers` usage in `app/startup/[id]/page.tsx` | `space_members` (join a space) | `startup_id`/`veteran_id` → `space_id`/`seeker_id` |

Content moderation (report/flag + admin queue) ships in this phase too — it has
no MentBridge equivalent and is written fresh.

### Phase 4 — 1:1 messaging

The request → accept → chat pipeline is the right shape and ports almost
verbatim.

| Copy from bridgeup | Rename |
|---|---|
| `app/api/associations/request/route.ts` | `startup_id` → `seeker_id`, `veteran_id` → `provider_id` |
| `app/api/associations/requests/route.ts` | same |
| `app/api/associations/requests/[id]/accept/route.ts` | same |
| `app/api/associations/requests/[id]/reject/route.ts` | same |
| `app/chat/[associationID]/page.tsx` | same |
| `app/messages/page.tsx` | same |
| `app/account/associations/page.tsx` | same |
| `app/account/requested-associations/page.tsx` | same |

Note MentBridge ran these with RLS off. ClassFinder has RLS on everywhere, so
each new table needs policies — a participant may read only their own threads.

### Phase 5 — Advertising / admin-authored content

`app/admin/news/page.tsx` + `app/api/admin/startup-news/route.ts` are the
reference pattern for admin-authored records not tied to a user account
(`created_by`). Reuse the shape for `ad_banners`.

### If a blog is ever wanted

`app/blog/*`, `lib/blogs.ts`, `app/admin/blogs/*`. A ClassFinder blog would be
a different content model (parent-facing coaching advice, not founder content),
so treat these as a structural reference, not content to import.

## Already here, still MentBridge-flavoured

- `lib/gemini.ts` — the structured-JSON-with-enum-constraint approach is exactly
  what Phase 1 step 6 needs, but its prompts still describe tagging consultants
  for a startup marketplace. Rewrite the prompts, keep the shape.
- `app/admin/api-usage/page.tsx` — reads `llm_usage_log`, which doesn't exist
  yet. Create it alongside step 6.
- `app/account/payments/page.tsx` — a stub in MentBridge too. Phase 6.

## Branding

All user-facing naming reads from `lib/brand.ts`. Changing the product name is
one edit there. Set `NEXT_PUBLIC_SITE_URL` in the deploy environment before
going live — `robots.ts` and `sitemap.ts` fall back to localhost, and until
that variable is set they must not advertise a domain we don't own.

## Media rule: file bytes never go in a row

Images, video and documents belong in Supabase Storage; the database holds
only the URL. Base64 in a column is ~33% larger than the file, is billed at
database rates rather than storage rates, is read into memory by any SELECT
touching that row, bloats every backup, and cannot be CDN-served. One 2 MB
photo becomes ~2.7 MB of row data — a thousand providers is ~2.7 GB of
database that should have been cheap object storage.

`db/2026-08-31-phase1g-no-blobs.sql` enforces this: photo columns must match
`^https?://`, free-text and JSONB columns have size ceilings an encoded file
cannot fit inside, and the photo buckets cap uploads at 5 MB with an image-only
MIME allowlist.

Phases that will need the same treatment:

- **Phase 2, Spaces** — photo *and video* posts. The largest risk here. Video
  needs its own bucket with a deliberately chosen size limit and MIME list;
  do not reuse the 5 MB photo buckets, and do not let a client send a data URI.
- **Phase 5, ad banners** — `ad_banners.image_url`, same URL-only constraint.
- **Certifications** — if scans are ever uploaded, they go to Storage with the
  URL in the JSONB, not the file.
