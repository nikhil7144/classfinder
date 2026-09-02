# ClassFinder — Product & Build Plan

A multi-vertical finder for coaches, tutors, academies and coaching centres,
for parents and students. Sports, dance, music, mind and indoor games, school
subjects, and board/entrance exam prep — searched by **what** and **where**.

Forked from the MentBridge codebase, then rebuilt: different product, different
database, different visual identity. See
[docs/porting-from-mentbridge.md](docs/porting-from-mentbridge.md) for what was
kept, what was removed, and what to copy back when later phases need it.

> Working name only. All user-facing naming reads from `lib/brand.ts`, so the
> real brand is a one-line change.

---

## Roles

| Role | Who | Notes |
|---|---|---|
| **seeker** | Parent or student | Browses without logging in. Must log in and complete a profile to book, join a space, or message. |
| **provider** | Coach, tutor, academy, centre, event planner | Approved by admin before appearing in search. |
| **admin** | Operator | Approvals, taxonomy, cities/areas, moderation, banners. |

### Provider structure

Two layers, so the taxonomy can grow without schema changes.

**`provider_type`** — structural, decides what the account can *do*:

- `individual` — works alone; selects the **areas they serve**
- `institution` — has **branches**, each in one area
- `event_planner` — runs a space for events and bookings, and is **excluded
  from coach/tutor search entirely**

**`provider_category`** — the self-description picked at signup, admin-editable:

| Category | Type |
|---|---|
| Coach, Academic Teacher, Home Tutor, Dance Teacher, Music Teacher | individual |
| Sports Academy, Sports Center, Coaching Center, Dance Academy, Music School | institution |

---

## Service taxonomy

176 services across 8 groups, all admin-managed (`/admin/service-categories`):

| Group | Count | Examples |
|---|---|---|
| Sports | 32 | Cricket, Kabaddi, Kho Kho, Kalaripayattu, MMA |
| Wellness & Fitness | 12 | Yoga, Zumba, Pilates |
| Mind Games | 10 | Chess, **Abacus**, **Vedic Maths** |
| Indoor Games | 8 | Carrom, Snooker, Billiards |
| Dance | 23 | Bharatanatyam, Kathak, Bhangra, Hip Hop |
| Music | 25 | Hindustani/Carnatic vocal, Sitar, Tabla, Guitar |
| School Subjects | 30 | Maths, Physics, regional languages |
| Boards & Exams | 36 | CBSE, ICSE, IB, JEE, NEET, UPSC, CAT |

Abacus and Vedic Maths sit under Mind Games, not Subjects — in India they're
taught as brain-training programmes, not school subjects.

**Open question:** `exam_board` mixes school boards (CBSE) with entrance exams
(JEE, UPSC). Different search intents, and a CBSE Class-10 tutor is a different
business from a JEE institute. Splitting out `competitive_exam` is a one-line
check-constraint change now and a data migration later.

---

## Location — the spine of discovery

```
cities → areas (lat/lng centroid, is_live)
           ↑                    ↑
  provider_service_areas   branches.area_id
      (individuals)         (institutions)
```

Both resolve through one view, `provider_discoverable_areas`, so a home tutor
covering four areas and a centre with four branches are searched by the *same*
query. Nothing is denormalised, so a provider can't silently vanish from an
area they actually serve.

**Search** is `search_providers()` — a Postgres function over RPC, keeping
distance maths next to the data:

- Origin is the seeker's coordinates, falling back to their area's centroid
- Ranked by aerial distance (PostGIS), nearest first
- Soft radius, default 15 km, widenable
- Excludes unapproved, suspended, and event planners
- Never returns seeker coordinates

### Area-wise launch

`areas.is_live` **gates seekers only**. Providers can register in any defined
area, so supply builds quietly before an area opens to demand.

---

## Authentication

Email OTP or Google. **No passwords anywhere** — there is no password field in
the app, so nothing should ever offer to set one.

- One flow for signup and login, plus per-role links (`/signup/seeker`,
  `/signup/provider`) that pre-set the role for genuinely new accounts only
- Mobile number required at profile completion, not SMS-verified yet
- Account type can be **changed until the profile is complete** — nothing is
  published yet, so nothing is lost — and is locked afterwards, enforced
  server-side

**Requires in Supabase:** Site URL and Redirect URLs must point at the app, or
Supabase silently discards the app's requested redirect. Email templates
(*Confirm signup* for new users, *Magic Link* for returning) use `{{ .Token }}`
to send a code; either way the link path also works.

---

## Security

RLS is **on for every table**, a deliberate departure from MentBridge, which
ran with it off throughout. The stakes are higher here: more roles, minors in
the data, bookings and money later, and a planned mobile app shipping the same
anon key in its binary.

- Seeker rows and profiles: owner-only, never publicly listed
- Providers and branches: public only when approved and not suspended
- Taxonomy and locations: public read, writes only through admin API routes
- Admin actions use the service-role key server-side

Four things that bit us and are worth remembering:

- Tables created via the SQL editor **don't inherit Supabase's default grants**.
- New tables default to RLS-enabled-with-no-policies, silently returning empty.
- **A policy that reads another RLS-protected table is filtered too.** If the
  caller can't see that row the policy quietly evaluates false — no error. It
  made joining a group impossible, because proving the group was open meant
  reading a group only members could read. Ask such questions through
  `security definer` helpers that return a boolean and no data.
- **Every insertable table needs a SELECT path for the writer's own new row.**
  PostgREST asks for the row back by default, `RETURNING` needs SELECT, and a
  `STABLE` policy function reads the pre-statement snapshot so it cannot see
  the row being written. The symptom is a 403 on a write that actually
  succeeded.

Test RLS as a real user with their own JWT. The service-role key bypasses it
entirely, so service-role tests prove nothing — they passed for weeks while
admin approval was completely broken.

### Media

File bytes never go in a row — Storage holds the file, the database holds the
URL. Enforced by check constraints and bucket limits, not convention. Details
and the phases at risk are in the porting doc.

---

## API shape — built for the mobile app too

A mobile app is coming and will talk to Supabase directly, with the same anon
key and the same RLS. That makes one rule worth holding to:

> Anything the app will need must be an **RPC function** or an **RLS-governed
> table read**. Logic that only a Next.js server component can perform is
> logic the app cannot reuse.

This is why RLS being on matters beyond security: the rules live in the
database, so web and mobile inherit the same ones instead of each
re-implementing them. MentBridge's RLS-off approach — client-side redirects
plus per-route server checks — would have transferred nothing.

| Surface | Reusable by mobile? |
|---|---|
| `search_providers()`, `groups_for_provider()`, `get_provider_profile()` | Yes — call over RPC |
| `my_threads()` — every conversation, group and direct, in one call | Yes, and built for it: the app would otherwise assemble an inbox from four queries |
| `thread_trials()`, `propose_trial()`, `respond_to_trial()`, `mark_trial_outcome()` | Yes — the trial's rules are all in the database |
| Any table read (providers, areas, groups…) | Yes — RLS applies identically |
| `/api/admin/*` | No, and fine: admin is a web-only console |
| Server components rendering HTML | No — they must stay thin wrappers over the above |

The trap to avoid is a server component reading with the **service role** and
re-checking the rule in TypeScript. That writes the same security rule twice,
and the copies drift. `app/provider/[id]` did exactly this before
`get_provider_profile()` replaced it.

---

## Design

**Charcoal & Coral** — [proposal](https://claude.ai/code/artifact/03ec9968-92f5-4144-ab03-c044ea3fa035).
Layered charcoal ground, a single coral→gold gradient owning primary CTAs, teal
reserved strictly for approved/verified, and a per-group taxonomy palette kept
clear of both. Plus Jakarta Sans / Manrope / JetBrains Mono.

Tokens live in `app/globals.css`; screens consume them via `cf-*` primitives
rather than hard-coded hexes.

---

## Groups — how demand reaches supply

ClassFinder is asymmetric in a way MentBridge was not. There, startups posted
requirements and experts applied, and both sides had reason to search. Here
parents search and coaches wait: an approved coach has nothing to do until
someone finds them, so supply goes dormant before demand arrives.

**Groups are parent-created demand.** In metro societies parents already
coordinate this in WhatsApp — "anyone want to split a badminton coach for the
kids?" — so this digitises an existing behaviour rather than teaching a new one.

A group carries a service category, an area, a society, and how many students.
The creator shares a link; others join — and a member must be a registered
seeker with a **completed profile**, not merely an account, or three throwaway
email addresses would activate a fake group. It reaches providers only once it
has **at least 3 members**, which does double duty: it filters idle wishes from real
demand, and it makes recruiting neighbours the activation step, so the growth
loop and the quality gate are the same action.

Groups are **time-boxed** (default 10 days, extendable by the creator). Stale
demand is worse than none — a coach who contacts five dead groups stops
contacting groups.

The economics improve for both sides, which is why both will tolerate the
friction: five children in one society is a better rate per parent and one trip
for five students for the coach.

### Privacy

A group describes how many children, roughly what age, which society, and
eventually a weekly time. That is a description of where children gather and
when — the most sensitive object in the product.

- **Public:** service, area, number of students. Enough to signal activity.
- **Approved providers only:** society name and the creator's contact.
- The creator's phone is shown only if they opt in, never by default.

### Contact

No group wall. A provider reaches the **creator one-to-one**, adapted from
MentBridge's association pipeline. This keeps children and other members out of
any conversation with a stranger, and pulls messaging forward from Phase 4
rather than building a comment system.

**The pitch is the request.** MentBridge asked to connect first and talked
after, but there a veteran was approaching a business. Here a coach is
approaching a family, and a parent judging a stranger needs to read what they
actually said before deciding. So a provider's first message *is* the request;
the parent reads it, then chooses whether a conversation opens.

Because that message reaches a family unvetted, three things guard it:

- the pitch is required and substantive — a bare "hi" is rejected
- only an **approved, unsuspended** provider may send one, enforced in RLS
  rather than the UI
- one request per provider per group, so a declined coach cannot try again


---

## Reaching a coach directly

Groups solve supply going dormant. They do not solve demand arriving and
bouncing: search shipped in Phase 1 and every provider page ended by telling
the parent to come back later, so the path the whole product is built around —
parent searches, finds the right coach — was a dead end.

A parent now writes to a coach from their profile. It is the same object as a
group pitch pointed the other way, and the inversion changes three rules:

- **No accept gate.** The parent chose this coach; consent is the act of
  writing. A coach who cannot take the work declines, or never answers.
- **No minimum essay.** "Do you teach 8-year-olds on Saturdays?" is a real
  enquiry. The 20-character floor exists because a *coach's* cold approach to a
  family must be substantive.
- **Contact is released on the parent's say-so, per coach**, not on an accept.

Kept from Groups: a completed seeker profile to send anything, approved and
unsuspended providers only, one live enquiry per pair. A decline is not
permanent here — that rule stops a stranger pestering a family, and does not
run in this direction.

Both kinds land in **one inbox** (`my_threads()`). A parent talking to two
coaches about a group and a third directly has one inbox in their head.

### Contact sharing, and leaking off-platform

People will swap numbers and carry on over WhatsApp. That cannot be prevented —
numbers can be typed in words — and at cold start it should not be: a wall
between a parent and a coach they already like loses both.

The cost is not lost revenue, since nothing is charged yet. It is that the
product **learns nothing**: no idea which enquiries became students, so search
can only rank by aerial distance, reviews have no verified basis, and Phase 5
has nothing to show an advertiser.

## The first class

So one structured step sits inside the conversation. Either side proposes a
day, time and place — built from the coach's own availability rows — the other
confirms, and afterwards each says whether it happened.

It is **not a calendar**: no slot inventory, no capacity, no cancellation
policy, no payment.

It attaches to group threads and direct enquiries alike, from the first
migration. A group conversation ends in exactly the same event, and Groups
exists precisely to produce those students — building it enquiry-only would
leave every group-sourced student unrecordable.

What it buys that chat alone cannot:

- the conversion event, so the funnel is measurable at all
- a record both sides can point at
- **a verified basis for reviews** — "only someone with a confirmed trial may
  review this coach" is the whole defence against fake reviews, and it is free
  now and expensive to retrofit once reviews exist

"It happened" is the **parent's** word for it. The coach's column is kept for
their own record and for spotting disagreements; letting the person being
reviewed certify their own attendance would defeat the point.

**The risk:** a confirmation nobody presses is dead UI. It is one tap inside
the thread rather than a separate flow, and the coach has a selfish reason to
press it — it becomes their trial count, and later their ranking.

**Reviews are not yet on the roadmap.** Given search ranks purely on distance,
that is a bigger gap than booking, and the trial class is what makes it
buildable.


## Being told something happened

Everything above assumes the other person comes back to the site. Until 2N
nothing told them to — the only mail this product had ever sent was Supabase's
sign-in code — so a parent could write to exactly the right coach and have it
sit in a dashboard unopened for a week.

Two rules:

- **It fires in the database, not the web client.** The mobile app writes to
  Supabase directly, so an enquiry sent from a phone would send no mail at all
  if the web app were the thing that noticed. Triggers, not API routes.
- **A notification can never break what caused it.** Every trigger swallows its
  own errors. `respond_to_trial` raises on `not found`, so a trigger error
  inside that UPDATE would have surfaced to a coach as "that trial is not yours
  to answer" — a far worse bug than a missing email.

Triggers queue rows; a worker (`/api/notifications/dispatch`, called on a
schedule with a shared secret) drains them. Queue-then-send means a mail outage
delays a notification rather than failing a message insert, retries are a
second pass, and push for the mobile app slots in beside email later without
touching a trigger.

Chat is **debounced to one mail per thread per 30 minutes** while the last one
is unread — opening a thread clears it. Without that, a five-message exchange
is five emails, which is how people learn to filter your mail.

**Environment:** `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`,
`NOTIFICATION_DISPATCH_SECRET`, and a real `NEXT_PUBLIC_SITE_URL` — the worker
refuses to send while that still points at localhost, because a row marked sent
is never retried.

### Realtime

Threads were polled every 15 seconds; they now use a Supabase Realtime channel
per thread, with the poll kept at 60s as a fallback. MentBridge did this
already, but with **RLS off**, so its channel had nothing to satisfy. Here only
three tables are published — `group_messages`, `enquiry_messages`,
`trial_classes` — and the client subscribes with the user's own JWT, so the
same policies guard the socket. Publishing anything else broadcasts families
arranging where their children will be.

Realtime is an accelerator, never the source of truth: every component still
reloads explicitly after its own writes, so a dropped socket degrades to the
behaviour that shipped before it.


---

## Roadmap

### Phase 1 — Foundation

| | Status |
|---|---|
| Schema + RLS + grants | done |
| Email OTP + Google auth, per-role signup | done |
| Seeker profile (area, optional GPS) | done |
| Provider profile (full detail, service areas / branch areas) | done |
| Admin: provider approval, taxonomy, cities & areas | done |
| Design system applied to the user-facing app | partial — admin still light |
| Browse / search page | done |
| **AI-assisted matching** + usage tracking | **not started** — `lib/gemini.ts` is still MentBridge's, and nothing on the seeker path calls a model |

Provider profile captures: photo, category, services, help statement, age,
experience, certifications, fees (range + period), teaching formats, service
areas or branches, and **day- and place-wise availability**.

### Phase 2 — Groups, direct contact, and the first class

| | Status |
|---|---|
| Groups: create, share, join, expire, 2-member threshold | done |
| Pitch → accept → 1:1 chat, contact opt-in, alerts | done |
| Group page with tabs and one inbox per group | done |
| Direct enquiry from a provider profile (2L) | done |
| One inbox across group and direct threads (2L) | done |
| Trial classes on both thread kinds (2M) | done |
| Email notifications, queued in-database (2N) | done |
| Realtime threads, RLS-scoped (2O) | done |
| Parents state a requirement; coaches find students (2R) | done |
| Suggested coaches for a parent, cached per requirement (2S) | done |
| Who the learner is, and a kept history of interests (2T) | done |

Parent-created demand, per the section above, plus the request → accept → chat
pipeline it depends on. Chosen ahead of Spaces because it is what stops approved
coaches going dormant while areas open one at a time — Spaces without demand is
a coach posting photos to nobody.

Direct contact was folded into this phase rather than left for later once it
became clear the two shared everything: Groups had already built the request,
the thread, the read state, the contact opt-in and the alerts, and search was
finished but ended in a page that said "messaging and booking arrive in a later
release".

**Find students (2R)** closed the same gap on the other side. Everything to
this point ran on the parent starting: a coach's only demand feed was Groups,
which needs two families who already know each other, and a parent's profile
recorded a name, a number and an area and nothing about what they wanted. So
parents now state a requirement — what, for whom, at what level, where, when,
roughly what they'd pay — and groups are asked the same questions in the same
words. A coach gets one screen over both kinds of demand, filtered by activity,
area and distance, with an optional AI pass that ranks what is already on it.

Approaching a family inverts the consent direction enquiries were built for, so
the enquiry gains `initiated_by` and a `pending` state rather than a third
messaging pipeline: the coach writes once, sees an area and a requirement and
no name, and the parent decides whether anyone is introduced.

### Phase 3 — Spaces, with moderation

| | Status |
|---|---|
| Space per coach, auto-created, followable (3A) | done |
| Photo posts and YouTube video posts (3A) | done |
| Reactions: like, wow, surprise (3A) | done |
| Report, auto-hide at 3, admin queue, suspend (3A) | done |
| Public city feed on the guest homepage (3B) | done |
| Followed + interest-matched feed for seekers (3B) | done |

A Space is a provider's own page: what they do, what they know, how they
teach. Created automatically with the listing, one per provider, reached as a
tab from their profile. Seekers follow it. Posts are a short piece of writing
with either a photo or a YouTube video.

Three departures from how this phase was first sketched, each for a reason
worth keeping:

**No comments wall.** The original plan had one, and it directly contradicted
the decision Groups is built on — *no group wall, keeps children out of
conversations with strangers*. The same room, the same people. Reactions
instead: **like, wow, surprise**. No hearts, deliberately; this is a page about
children's classes and the affection register does not belong on it. Anything
a parent actually wants to say still goes through the 1:1 enquiry thread,
which is consent-gated and already carries trials and notifications.

**Not claimable.** "Per provider" and "claimable" contradicted each other, and
the claimable reading meant public pages about real businesses, carrying
public content, that the business could not moderate. Every Space has an owner
from the moment it exists.

**Video is a YouTube link, not an upload.** This removes the phase's only
named cost risk outright. Supabase does not transcode, so a hosted 60-second
phone video is 50–150 MB served untranscoded on every view; a YouTube id is 11
characters, and Google pays for the bandwidth, the transcoding, the CDN and
the abuse detection. Thumbnails render from `i.ytimg.com`, playback embeds the
privacy-mode player. Images are hosted here, in a bucket with the same limits
photos already use.

**Moderation ships in this phase, not after.** Any viewer can report a post;
three distinct reports hide it automatically, before an admin has read
anything; an admin queue resolves or dismisses. A Space in breach is
suspended and becomes unreachable — stated on the composer, so the rule is
known before it is enforced rather than after.

Coaches only. Event planners are a separate entity — they share the providers
table today, and are excluded from coach search, Groups and the demand feed —
and a teaching page is not what they need. Phase 4 is where they get theirs.

**The feeds (3B)** are what made following worth doing. 3A shipped the follow
button and then gave it nowhere to lead: `my_followed_spaces()` returned names
and post counts, so a parent who followed four coaches had to click into each
to read anything. Two reads fix it, and they are deliberately different
products — a signed-out **city feed** on the homepage, which is a shop window,
and a signed-in **feed** of followed coaches plus coaches in the same city
teaching what the parent said they are looking for.

Both are scoped to a **city**, not an area. Search is area-and-radius because
"who can teach my child" is a distance question; reading what a coach posted is
not, and an area-sized feed would be empty this early. `areas.is_live` still
gates it.

The public feed **lags** by six hours. Auto-hide needs three signed-in
reporters and a guest cannot report at all, so showing posts to the largest
audience the moment they are written would put them in front of exactly the
people who cannot trigger the safety mechanism. Followers are exempt — they
chose that coach. This is the one place the product deliberately shows
signed-in users something before everybody else.

### Phase 4 — Events & bookings

`event_planner` providers, events, bookings, and an events tab on the provider
dashboard. Payment status tracked manually; no gateway yet.

**Bookings here means event bookings**, which are genuinely date-and-slot
shaped. Enrolling with a coach is not: it is a monthly relationship that merely
*starts* with one session, and that session is the trial class in Phase 2. A
calendar for coaching would be a calendar nobody fills in while the coach keeps
using WhatsApp.

### Phase 5 — Advertising

Admin-managed banners and a public "advertise with us" lead form. No self-serve
advertiser accounts.

The audience this sells is already being collected — 2T records who the learner
is and keeps every version of what a family wants, rather than overwriting it,
because a family that moved from cricket to football in a year is the thing a
summer camp actually wants to reach and a snapshot cannot see it.

Two constraints are built already and are not to be relaxed here:

* `audience_segments()` returns **counts only** and suppresses any cell under
  five families. It has no identifying column to ask for. That is the read an
  organiser or advertiser gets; the tables beneath it are admin-only.
* `seekers.marketing_opt_in` defaults **false** and has to be asked for. It is
  separate from `open_to_offers`, which is only about coaches on this site
  writing to you. Identity reaches an advertiser when the family fills in that
  advertiser's form, and by no other route.

**Settle before building, not during:** most learners here are children, and
the DPDP Act 2023 treats a child's personal data as its own category —
verifiable parental consent, and a bar on behavioural advertising directed at
children. Age band is on the segment row so that rule can be enforced in code
rather than assumed. Get this reviewed by counsel; aggregate reporting plus a
consented lead form is the shape most likely to survive it, which is why it is
the shape that already exists.

### Phase 6 — Payments

A real gateway (Razorpay, given the India context) wired into Phase 3 bookings.

**Later, unscheduled:** third-party shop APIs (sports equipment, costumes).
**Mobile app** isn't a phase — it's a separate client, and Phase 1's RLS work
is what makes it straightforward rather than a rewrite.

---

## Decisions worth not relitigating

| Decision | Why |
|---|---|
| RLS on everywhere | Mobile app will ship the anon key; minors in the data |
| `is_live` gates seekers, not providers | Build supply in an area before opening it |
| Seeker coordinates stored | Chosen for ranking convenience; protected by owner-only RLS and never returned by search |
| Aerial distance | Simple and good enough to rank; under-reads real travel time |
| Soft radius, widenable | Avoids dead-end empty results while supply is thin |
| Role switchable until profile complete | Picking wrong at signup shouldn't be permanent |
| Fees as a range | Coaches quote "1500–2500 depending on level" |
| Availability keyed by place | A provider teaches at their academy *and* travels |
| Spaces have no wall at all, only reactions | A public wall on a children's-classes page is the group wall Phase 2 refused, with the same people in it |
| Reactions are like, wow, surprise — no heart | Affection is the wrong register for a page about other people's children |
| A Space is auto-created and never claimable | "Per provider" and "claimable" contradict; the claimable reading means public pages a business cannot moderate |
| Space video is a YouTube link, not an upload | Removes the phase's only cost risk: Google pays for transcoding, bandwidth and abuse detection |
| Three reports auto-hide a post | One admin cannot be the only thing between a bad post and a parent |
| Event planners hidden from search | They run spaces, they aren't "found" like coaches |
| No self-serve advertiser accounts | Admin-managed banners plus a lead form is enough |
| Payments deferred to Phase 6 | Model the booking data now, wire the gateway later |
| Groups before Spaces | Demand generation beats content marketing at cold start |
| Groups need 3 members to activate | Quality gate and growth loop in one action |
| Society name hidden from the public | It describes where children gather; approved providers only |
| No group wall, 1:1 to the creator only | Keeps children out of conversations with strangers |
| The pitch is the request | A parent judging a stranger needs to read what they said before deciding |
| Only approved providers may pitch | That first message reaches a family before any vetting |
| Joining needs a *completed* seeker profile | An account is just a verified email; three throwaways would activate a fake group |
| Groups expire after ~10 days | Stale demand poisons provider trust faster than no demand |
| Chat now, bookings much later | Coaching is a monthly relationship, not a slot; a calendar would sit empty |
| Enquiries are their own table | Same shape as a group pitch, opposite direction; merging means rewriting RLS that works |
| A coach needn't accept an enquiry | The parent chose them — consent is the act of writing |
| Contact sharing is not blocked | Unenforceable, and a wall at cold start loses both sides |
| A trial class object from day one | The only cheap way to learn whether a match happened |
| Trials on group threads too | A group ends in the same first session, and Groups exists to produce them |
| The parent marks attendance | A coach certifying their own trials would void the review rule built on it |
| One de-duplicated alert count | Summing per-feature counts told people they had twice as much waiting |
| Notifications fire from triggers | The mobile app writes straight to Supabase; a web-side hook would notify nobody |
| Queue first, send from a worker | A mail outage must delay a notification, not fail the message that caused it |
| Notification triggers swallow errors | A failed email must never roll back a confirmed trial class |
| Chat mail debounced 30 min | One mail per conversation beats five, which is how people learn to filter you |
| Only three tables published to Realtime | Each broadcast row is a family arranging where a child will be |
| Parents state a requirement, not just a location | A coach's only demand feed was Groups, which needs neighbours who already know each other |
| Groups answer the same questions as a parent | A group is a requirement several families share, not a different object |
| One demand feed, groups and families together | A coach asks "is there work here", not "which feature produced this row" |
| A coach's approach is a pending enquiry | Same tables, one new column; a third pipeline would mean a third of everything |
| A family is never named until they accept | open_to_offers means "you may see what I want", not "you may have my details" |
| One approach per coach per family, ever | The rule against a stranger trying again, applied in the direction that needs it |
| AI ranks, it never filters | Eligibility is rules and belongs in SQL; fit is judgement and is worth explaining |
| The coach's ranking is on demand, the parent's is ambient | A coach presses a button and waits; a parent just opens a page |
| Parent suggestions cached against a requirement fingerprint | Otherwise it is a paid model call per page load for an unchanged answer |
| Editing the requirement invalidates the ranking | "Change what you're looking for" has to visibly do something |
| Search starts from the parent's saved area and subject | Their area was collected at signup and then never used; the navbar landed them on "choose an area" |
| A link's ?area / ?service always beats the profile | A shared or back-buttoned link is a more specific intent than a profile field |
| An auto-applied subject filter says so, with an undo | A search that silently starts filtered is a search quietly hiding results |
| Ask who the learner is | An adult beginner and a mother enrolling a six-year-old were the same row, and are not the same conversation |
| Who the learner is sits with identity, and is required | It is true of the person, not of this month's search; asked inside the optional requirement it was missing for exactly the people an audience is made of |
| Mother and father kept apart, collapsed in aggregate | It is a thing people state about themselves; it is nobody's business in a count |
| Interests are appended, never overwritten | "Dropped cricket, took up football" is the signal, and a snapshot destroys it |
| The history is written by a trigger | The mobile app writes to Supabase directly; a client-side log has holes exactly where the other client's users are |
| Advertisers get an aggregate function, not a table | Counts with a five-family floor cannot be turned back into a household |
| marketing_opt_in is separate and defaults off | "Coaches may write to me" is not consent to be marketed at |
