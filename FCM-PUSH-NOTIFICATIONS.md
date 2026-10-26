# Push notifications — where it stands, and a decision to make

Written for: Gaurav and whoever else is deciding how push notifications should
actually send. Covers why nothing has buzzed a phone yet, what's been fixed,
what's still missing, and the one open architecture question — immediate send
(Gaurav's proposal) vs. the queue-and-worker design already in the backend.

## 1. Why no push has arrived yet

Three separate things all had to be true at once, and until this week none of
them were:

1. **The Flutter app had no push code at all.** The backend side (tables,
   endpoints, FCM sender) was built and ready, but nothing on the phone ever
   asked Firebase for a token, registered it, or knew what to do with an
   incoming message. This has been built now — see §2.
2. **No Firebase project existed**, so there was no `google-services.json`
   anywhere in the mobile repo. Without it, Firebase can't initialize on the
   device at all, so step 1 above couldn't do anything even once written.
   This is now fixed too — see §2.
3. **The backend's send step has never been configured or triggered.** This
   is the part that's still open, and it's what the rest of this doc is about.

In-app notifications (the bell, the list screen) showing up while the actual
phone tray stays silent is the direct fingerprint of #3: the database row
that says "notify this person" gets created fine (a trigger does that
regardless of Firebase), but nothing has ever actually called Firebase to
turn that row into a real push.

## 2. What's done

- **Mobile app**: Firebase init, device registration (on every launch, plus
  on token refresh), foreground notification display, all three tap states
  (terminated / background / foreground) routing to the right thread,
  permission requested only at the two sensible moments (never on first
  launch), device forgotten on sign-out. Android manifest fixes for the
  `POST_NOTIFICATIONS` permission and the `FLUTTER_NOTIFICATION_CLICK`
  intent-filter the backend's own push payload expects. Release builds for
  both flavors compile and install correctly with this in place.
- **`google-services.json`**: added for both `com.aspire91.app` and
  `com.aspire91.app.coach`, under one Firebase project (`aspire91`,
  project number `198476591357`). Confirmed this is not an SHA-1 issue —
  SHA-1 fingerprints are only needed for Google Sign-In, Phone Auth, or
  Dynamic Links, never for plain FCM push.

## 3. What's still missing — the backend's send step

The API is deployed as **serverless functions on Vercel** (confirmed via
`api/vercel.json` — no persistent process ever runs). The backend was built
around a **queue + periodic worker** pattern:

- A message/query/etc. being created queues a row in the database. It does
  **not** call Firebase itself.
- `POST /api/v1/notify/dispatch` is a worker endpoint that drains that queue
  and calls Firebase for whatever's waiting. It's meant to be hit by a
  scheduler every few minutes.
- Three things this endpoint needs are not yet set on the **live** Vercel
  deployment (the local `.env` on this machine doesn't have them either,
  which only matters for local dev):
  - `FIREBASE_SERVICE_ACCOUNT` — a Firebase service account key, so the
    backend can authenticate to send a push at all.
  - `SUPABASE_SERVICE_ROLE_KEY` — needed by the worker to read the queue.
  - `NOTIFICATION_DISPATCH_SECRET` — the shared secret whatever calls this
    endpoint on a schedule has to send.
- **Nothing calls this endpoint on a schedule at all.** Not in the codebase,
  not in CI, not in `vercel.json` (no `crons` entry). This was never set up.

Checking `GET /api/v1/notify/status` (with the dispatch secret) will say
`"firebase": false, "ready": false` until the first two env vars above are
actually set on Vercel and redeployed.

## 4. The architecture question — two ways to make the send actually happen

### Current design: queue + worker, called on a schedule

Already built, already has the resilience this exists for:

- If Firebase is slow or down, the *message* still sends — only the buzz is
  delayed. The thing that must never fail, doesn't.
- A failed send is just the same row waiting for next pass. No extra retry
  code needed.
- Sends go out a controlled batch at a time, so one burst of activity can't
  trip FCM's rate limit the way many simultaneous direct calls could.
- Matches the pattern already used for the existing email notifications — one
  mental model for both.

What it costs: an external trigger has to exist and call
`/notify/dispatch` on a schedule. On Vercel, that means either Vercel's own
Cron Jobs (needs a paid plan for anything more frequent than once a day) or a
free third-party scheduler like cron-job.org hitting the endpoint with the
dispatch secret. Either way, it's one more thing to set up and keep running.

### Gaurav's proposal: send at the moment the API is triggered

> "FCM jaise hi API trigger ho rahi hai, push kar do na — cron kyu?"

No queue, no worker, no scheduler. The moment the message (or query, or
whatever) is created, call Firebase right there in that same request.

**Why this is attractive:** one less moving part. No external cron account to
set up or keep paying for. Lower latency — the push goes out the instant the
thing happens, not up to five minutes later.

**The one real risk, and it's specific to Vercel:** these functions are
serverless — nothing keeps running once the HTTP response has gone out. A
naive "call Firebase but don't wait for it" (fire-and-forget) can get the
function frozen mid-call, before the push actually sends, and that failure is
silent — nobody would know it happened.

**The fix for that risk — my proposal for *implementing* Gaurav's idea
safely:** Vercel has a feature called `waitUntil()` (from `@vercel/functions`).
It lets the request return to the client immediately — so sending a message
is not slowed down waiting on Firebase — while Vercel *guarantees* the
Firebase call still finishes in the background, instead of risking it getting
killed. This gets Gaurav's actual goal (no cron, no queue, immediate send)
without the silent-drop risk a plain fire-and-forget call would have on this
specific hosting.

**What's given up, either way (naive immediate, or `waitUntil()`):**

- No automatic retry. If a device token has gone stale, or Firebase hiccups
  for a moment, that specific push is just gone — there's no second pass that
  picks it up later, the way the queue currently gives for free.
- No batching protection. A sudden burst of activity (e.g. a future bulk
  notification feature) would mean a burst of simultaneous direct Firebase
  calls instead of a controlled sequence.

**A middle option, if the retry behaviour matters:** keep the database queue
as a safety net only for sends that fail immediately, with a much-less-frequent
cleanup pass (hourly, say) retrying just those — instead of every
notification waiting up to five minutes for a dispatch pass regardless of
whether anything went wrong. Immediate for the common case, queue only for
the retry case.

## 5. Recommendation

Either direction removes the current blocker (§3) — that part has to happen
no matter which design wins:

- **If "no cron infrastructure to maintain" matters more than "a failed send
  automatically gets retried"**: go with Gaurav's immediate-send approach,
  built on `waitUntil()` specifically so it's safe on Vercel. This is a real
  code change to where messages/queries get created, not a config change.
- **If retry-on-failure and rate-limit protection matter more than removing
  one scheduler dependency**: finish the current design — set the three env
  vars on Vercel, redeploy, and point a free cron-job.org task at
  `/notify/dispatch` every five minutes. No backend code changes needed, only
  configuration.

Either way, nothing here is about FCM costing money — sending a push through
Firebase is free regardless of volume. The only thing that ever had a cost
attached was Vercel's own Cron Jobs feature needing a paid plan for
sub-daily schedules, which the cron-job.org alternative sidesteps entirely.
