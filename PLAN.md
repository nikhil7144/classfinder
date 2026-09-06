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
| **provider** | Coach, tutor, academy, centre | Approved by admin before appearing in search. |
| **organiser** | Event company running events | Approved by admin. Separate table since 3E — see below. |
| **admin** | Operator | Approvals, taxonomy, cities/areas, moderation, banners. |

### Provider structure

Two layers, so the taxonomy can grow without schema changes.

**`provider_type`** — structural, decides what the account can *do*:

- `individual` — works alone; selects the **areas they serve**
- `institution` — has **branches**, each in one area

**`event_planner` was a third value until 3E and is not one any more.** It
shared the providers table with coaches, so every read of that table carried
`provider_type <> 'event_planner'` — 18 clauses across 12 migrations, each one
a chance to forget and put an events business in front of a parent searching
for a coach. The columns never fitted either: providers has fees, teaching
places, availability and service areas, none of which an events business has,
and no contact address, which it needs.

Event companies are `public.organisers` now, with their own table, their own
RLS and their own role. Done while there were still zero of them, so it cost
no migration. The 18 exclusion clauses are inert rather than removed — the
constraint makes them always true, and rewriting 18 working functions to
delete a redundant condition is a large diff for no change in behaviour.

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

## API shape — a service in front, RLS underneath

**This section was rewritten on 2026-09-03.** It used to say the opposite, and
the reasoning it gave was sound, so the change is recorded rather than quietly
applied.

The original rule was that a mobile app would talk to Supabase directly with
the same anon key and the same RLS, so *"anything the app will need must be an
RPC function or an RLS-governed table read"*. That held for two and a half
phases and produced 6,174 lines of SQL: 74 policies, 72 functions, every rule
in one place and impossible to forget.

What it never produced was anywhere to put a test. It also left a second
client reading the schema and guessing — `returns table(...)` and `returns
jsonb` are not a contract — and no seam for logic that is judgement rather
than permission.

So there is now an API: **`api/`, a NestJS service**, deployed separately from
the web app so the mobile client does not ride the website's uptime and
release cadence.

### The rule that replaces it

> Postgres decides **who may see what**. The API decides **what shape it
> arrives in, and which of it is worth showing**.

Concretely, and this is the part that must not erode:

- The API **never holds the service role key**. Every authenticated request
  queries Postgres as the caller, so all 74 policies still apply. A forgotten
  ownership check in a controller returns too little; it cannot leak.
- **Definer writes stay in `db/`.** `respond_to_approach`, `set_reaction`,
  `resolve_report`, `set_enquiry_phone_sharing` and the rest exist because RLS
  cannot restrict *which columns* an UPDATE touches. Reimplementing them in
  TypeScript would hand the client the columns they exist to withhold.
- **Read functions may migrate freely.** They make no security decision RLS is
  not already making.
- The contract is **generated, never written**: `api/openapi.json` comes from
  the same DTOs that validate at runtime, emitted by the same `configureApp()`
  that serves the traffic. Clients are generated from it — `lib/api/schema.d.ts`
  for the web, `openapi-generator -g dart-dio` for Flutter.

### Two things stay direct to Supabase

- **Realtime.** Thread subscriptions are websockets with RLS applied per
  connection; proxying them rebuilds that for no gain. This is also what
  settles the question permanently: **RLS can never be switched off**, however
  much else moves.
- **File bytes.** Uploads go to Storage against a signed URL and images serve
  from the CDN. Forwarding 5 MB through the API to hand it to Supabase is
  waste.

### Which door does a surface use?

Both patterns coexist during the transition, so the rule is written down
rather than decided per file:

> A **surface** reads one way or the other, never both. Migrate a whole
> surface or none of it.

| Surface | Reads via |
|---|---|
| Spaces feeds — guest city feed, seeker feed | **API** — first surface migrated (3B) |
| AI suggestions — coaches for a parent, students for a coach | **API** — they hold the model key, so a server is the only place they can live |
| Search, groups, threads, trials, enquiries | Supabase direct — migrate when touched |
| A Space's own page (`space_feed`) | Supabase direct — still snake_case |
| Sign-in profile resolution, role switching | Supabase direct — no shaping, no secret; the login path must not depend on a second process |
| `/api/admin/*` | Next route handlers, web-only console, staying put |
| Phase 4 onward | **API from the start** — no new SQL read functions |

The old trap is still a trap: a server component reading with the **service
role** and re-checking the rule in TypeScript writes the same security rule
twice, and the copies drift. `app/provider/[id]` did exactly this before
`get_provider_profile()` replaced it. The API tier does not license that — it
queries as the caller precisely so it never has to.

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

- **It fires in the database, not the web client.** Other clients write
  without touching the web app at all, so an enquiry sent from a phone would
  send no mail at all
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
| Queries — ask a coach to call, worked as a lead (3H) | done |

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

| | Status |
|---|---|
| Organisers as their own table and role (3E) | done |
| Organiser signup, listing, approval gate, dashboard shell | done |
| Organiser office address replaces area/venue (3I) | done |
| Events and categories: table, RLS, `/api/v1/events` (3J) | done |
| Event creation and management screens (4A, 4B) | done |
| Entries, cancellation and receipts (4C) | done |
| Subscriptions and listing fees (4D) | 3L written, not yet run; API and admin screens next |

Organisers, events, bookings, and a dashboard of their own. Payment status
tracked manually; no gateway yet.

**Onboarding first**, built API-first — `/api/v1/organisers/me` is the first
endpoint written for a feature rather than migrated onto one. `/signup/organiser`
mirrors the other two entry points, and the listing is deliberately not a
cut-down provider form: a coach is asked what they teach and what they charge,
and none of that describes a business that runs a tournament at a ground.

**The listing does not ask where the events are (3I).** 3E gave organisers an
area, a venue name and a venue address; signup asked for all three. An event
company runs a tournament at a ground in one city and a showcase in another,
so there is no single answer, and whatever it picked was wrong by its second
event. The venue is a property of the event and is asked for there, where the
events table needs its own venue columns regardless. What the listing keeps is
an office address — who an admin is approving, and where they are.

Three decisions taken before any of it, worth not relitigating:

**Events can be created by coaches as well as organisers.** A cricket coach
running an inter-academy tournament is a real case that organiser-only would
block. The events table will carry nullable `provider_id` and `organiser_id`
with a check that exactly one is set — two nullable foreign keys rather than a
polymorphic owner id, so referential integrity survives.

**Entries are individual or team, declared per event.** Most competitions need
both across their categories: under-10 singles and under-14 team in the same
tournament.

**Capacity, not seat allocation.** The BookMyShow model is assigned-seat
ticketing — a venue layout, seat holds, a seat map. A ground, a hall and a
masterclass all have a capacity and a set of categories instead, and building
seat maps for events that do not have seats is a large amount of work for
nobody. The nearer model is a registration platform, not a cinema.

The table landed early, in 3E, because it had to: building events on top of a
providers row would have deepened the mistake it was already causing, and
every month of delay adds rows that would need moving.

**Bookings here means event bookings**, which are genuinely date-and-slot
shaped. Enrolling with a coach is not: it is a monthly relationship that merely
*starts* with one session, and that session is the trial class in Phase 2. A
calendar for coaching would be a calendar nobody fills in while the coach keeps
using WhatsApp.

**The build order.** Four chunks, each shippable alone. A and B add no SQL at
all — 3J's endpoints exist and are tested, and until somebody can create an
event there is no real data to build anything else against.

| | What | New SQL |
|---|---|---|
| **4A** | Organiser event screens — create, edit, categories, publish | none |
| **4B** | Public listing and event page | none |
| **4C** | Entries: `phase3k`, its API, both sides of the UI | 3K |
| **4D** | Subscriptions and listing fees | 3L |

4D is last because it gates publishing, and gating a flow that does not yet
work is untestable.

### Entries (3K)

`event_entries` — one row per registration: the event, the category, the
seeker who entered, the participant's name and date of birth, a status, a
payment status, `amount_due`, `receipt_no`. `event_entry_members` carries the
rest of a team.

**The participant is described on the entry, not looked up.** There is no
child record in this product — 2T gave seekers `relation_to_learner` and
nothing more — and an entry should be a record of what was true on the day
anyway, like `requirement_events`. A family that enters two children enters
twice.

**A team entry names the participant and the rest.** `enter_event` takes the
entrant plus `team_size - 1` members, not a list of `team_size` strangers, so
whoever the family entered under stays the person the entry belongs to. This
is also how one tournament carries both halves of a badminton draw: singles
and doubles are two categories on the same event — one `individual`, one
`team` of two — with their own fees, their own places and their own age
bands, and a child may enter both. The duplicate guard is per category, so
the same name in singles and in doubles is two entries and two receipts,
which is what the organiser is owed for.

**`entries_count` is a column on `event_categories`, maintained by a trigger,
not a view and not a definer read.** A parent has to see "34 of 40 taken"
before entering, and RLS hides other families' entries, so an API counting as
the caller would count only that family's own. A counter column is publicly
readable as an ordinary column, is O(1), and — the real payoff — is the row
that gets locked to enforce capacity.

**Capacity is enforced in `enter_event()`, a definer function.** A `with
check` cannot do it: it loses the race between two parents on the last place,
and it cannot count rows it is not allowed to see. The function locks the
category row, compares the counter with `capacity`, inserts, and returns. It
is also the only thing that may write `receipt_no` and `amount_due`, which is
what 3J's header meant by a receipt number unwritable by the person it bills.

Behind it sits a check constraint on the category row itself:

    check (capacity is null or capacity >= entries_count)

Two columns of one row, so one constraint closes both directions — an
organiser cannot shrink capacity below what is already sold, and a trigger
increment cannot overfill even if the lock were somehow lost.

**No holds, no waitlist, no expiry.** An entry is confirmed when it is
submitted; payment is a separate axis the organiser marks by hand, which is
what "payment status tracked manually" has always meant here. A
pending-payment state that reserves a place needs hold expiry, a sweeper, and
an answer for what happens when it fires mid-payment — all of which is Phase 6
work once a gateway makes it real. Building it now is a state machine nobody
exercises.

Entries exist only for `booking_mode = 'platform'`. `external` renders a link
out and `none` renders nothing; the mode is stated on the event precisely so
that no screen has to infer it.

### What an organiser may change once entries exist

| Field | After the first entry | Held by |
|---|---|---|
| `capacity` | raise freely; lower only to `>= entries_count` | the check constraint above |
| `fee_amount` | editable, future entries only | `amount_due` is copied onto the entry at entry time |
| `min_age` / `max_age` | editable; existing entrants grandfathered | age is checked at entry and not re-checked |
| `entry_type`, `team_size` | frozen | trigger refuses while `entries_count > 0` |
| `name`, `sort_order` | always editable | — |
| deleting the category | refused | `on delete restrict` from the entry |

Flipping an individual category to a team one makes every existing entry
meaningless and has no sane migration, which is why those two freeze rather
than warn.

**This is what forces `PUT /events/:id/categories` to become a real diff.** It
is delete-then-insert today, so every save mints new category ids; the moment
an entry references one, an organiser fixing a typo either orphans the entries
or fails on an ordinary save. The client will have to send ids for the rows it
is editing — the reason given for not doing so, that the form has no stable
ids, stops being acceptable here.

### Cancelling

Two different acts, and they do not share a button.

**One entry.** Wrong age, duplicate, never paid, withdrawn over the phone.
Either side may do it, and it is a status change and never a delete: the row
keeps its receipt number, because destroying the record of a fee that was
collected in cash is worse than any tidiness it buys. `cancelled_at`,
`cancelled_by` and `cancelled_reason` are recorded — six weeks later, who
pulled this out is the first question. The trigger decrements the counter, so
the place is genuinely resellable.

**Cancellation closes before the event does.** A family may withdraw itself
until `cancellation_deadline` — a nullable column on the event that falls back
to `booking_closes_at`, and to `starts_at` when neither is set. It exists as
its own column because "no withdrawals in the last week" is a real rule an
organiser needs and cannot express by closing entries a week early; after that
moment the parent's own cancel is refused and the screen tells them to contact
the organiser. The organiser keeps the power until the event is `completed`,
because entries taken in cash on the day still have to be corrected. Nobody
cancels a completed event's entries: at that point the register is a record,
not a working list.

The rule lives in `cancel_entry()` rather than in RLS or the client, because
it depends on who is asking — the same function already distinguishes them for
the audit columns, and a deadline enforced in the UI is not a deadline.

**There is no un-cancelling.** Re-entering makes a new entry with a new
receipt, and only while entries are still open. Partly because the record
should read as what happened, mostly because the freed place may already be
gone, and restoring an entry could push the counter past capacity at the exact
moment the screen has implied success.

**The whole event.** Rain, venue lost, too few entries. `status = 'cancelled'`
already exists; a trigger cancels every entry with that reason, queues a
notification to each entrant, and moves paid entries to `refund_due`. This is
the only bulk cancel, and there is deliberately no "cancel all entries"
button, because the reason for one is always the event. The deadline does not
apply to it — it binds families withdrawing, not an organiser calling the
whole thing off.

**A cancelled event stays visible, and says so.** It keeps its page, shows a
cancelled banner, and each entrant sees their own entry marked cancelled with
its refund state in plain words. It drops out of the upcoming-in-a-city
listing — a parent browsing should not be offered a tournament that is not
happening — but stays reachable by link and in the family's own entries.

**Refund is a payment state, not a promise from this platform.** The axis is
`unpaid | paid | refund_due | refunded | waived`, written only by the
organiser through `set_entry_payment()`; a parent can no more mark their own
refund than mark themselves paid. No money moves here and none is held, so
every word on the screen says the organiser will refund, never that we will.
`refund_due` is a filter on the organiser's register, because it is their
to-do list.

**How they paid is recorded, from the first version.** `payment_mode` —
`cash | upi | bank_transfer | card | other` — with a free-text
`payment_reference` and `paid_at`, written by that same setter and by nobody
else. Worth three columns now rather than in Phase 6, because a gateway does
not replace them: Razorpay becomes another mode whose reference is the payment
id, and a register that already has the columns keeps one history instead of
splitting into before and after. Most of these will say cash on the day, and
an organiser reconciling a hundred entries needs to know which hundred.

A withdrawal after the deadline is exactly why the two axes are separate: the
organiser can cancel the entry without moving it to `refund_due`, which is
what a non-refundable late withdrawal is.

### What 3J has to be corrected for, in the same migration

* **Only a draft is private.** The public read is `status = 'published'`
  today, so cancelling or completing an event hides it from the very families
  who entered it, and their own history quietly empties. Read becomes
  `status <> 'draft'`, still gated on the owner being live.
* **An event with entries cannot go back to `draft`.** Nothing stops
  `PATCH /:id/status` doing it, and under the rule above it is the one move
  that hides a live event from its entrants. Withdrawing is `cancelled`, which
  tells people; `draft`, which does not, is refused by trigger.
* **`cancellation_deadline`** joins the date columns and the ordering
  constraint that already refuses a booking window closing after the event.
* The category grant, the categories diff, and the freezes above.

### The screens

**Organiser and coach**, inside the dashboard shell that currently says events
are the next thing being built:

* `/dashboard` — drafts, published, past.
* `/events/new` then `/events/[id]/edit` — saved as a draft on first submit so
  nothing is lost, a categories editor, and a Publish action visibly separate
  from Save. A refused publish shows the API's own sentence about approval.
* `/events/[id]/entries` — the register: name, age, category, paid or not,
  cancel, refunds due, CSV. This is the screen an organiser opens daily and
  the one worth the most polish.

**Parent:**

* `/events` — city-scoped, soonest first, filterable by taxonomy group.
* `/events/[id]` — public to guests; the Enter button is what asks for a
  login, as booking has always required a completed profile. The cancellation
  deadline is stated next to the fee, before anybody pays anything.
* `/events/[id]/enter/[categoryId]` — participant details, team members if the
  category needs them, age checked against the category before submitting,
  then a receipt.
* `/account/entries` — what this family has entered, with cancel while the
  deadline allows it and a plain sentence when it does not.

**The poster is uploaded, not linked.** Bytes go straight to Storage against
the `event-banners` bucket — public read, writes keyed on the first folder
segment being the uploader's id, the shape phase 1 set for the photo buckets
— and only the resulting URL reaches `events.banner_url`. Asking an organiser
to host the image somewhere else first and paste a link is asking most of
them not to have one, and forwarding 5 MB through the API to hand it to
Supabase is the waste the file-bytes rule already forbids.

**Notifications** extend the `kind` check as 3H did — `entry_received` for the
organiser, `entry_cancelled` and `event_cancelled` for the family. Triggers in
the database, drained by the existing worker. A day-before reminder needs a
scheduled queuer rather than a trigger and is not in 3K.

### Subscriptions and listing fees (3L)

The provider or the organiser pays; there is no consumer subscription anywhere
in this product.

**Two scopes, not two price lists.** A plan carries a `scope`:

* `listing` — being findable at all: a coach or academy listing themselves, an
  event company listing its business. Priced for what it is, and the coach's
  is the cheap one.
* `events` — running an event here. One catalogue, with no role dimension in
  it: the price of running a tournament is the price of running a tournament,
  whether a cricket coach or a company is running it.

A coach who never runs an event pays only the first. A coach who runs one pays
both, and pays for the second exactly what an organiser pays. That is the
whole mechanism — **plans name a scope, entitlements name a party, and nothing
anywhere names a role.** The cheap listing plan and the events plan never meet,
so one cannot discount the other.

**Same price, different shape, which is what keeps it fair.** The events
catalogue holds two billing shapes: a period plan (a fee for a window, with a
cap on how many events may be published at once) and a one-off (a fee for one
event). A company running twenty a year takes the period plan; a coach running
one takes the one-off and pays nothing for the eleven months either side.
Nobody is charged a different price for the same thing — they are charged for
different amounts of it, which is the only fairness that survives contact with
a coach who runs one tournament a year.

One table carries both. `party_subscriptions` names its party the way events
do — nullable `provider_id` and `organiser_id` with a check that exactly one
is set, so 3J's reasoning about referential integrity and
`event_party_is_mine` holds unchanged — plus the plan, the dates, and a
nullable `event_id`. A row naming an event entitles that one event and never
expires; a row without one entitles anything inside its window, up to the
plan's cap.

**The check sits beside `event_party_is_live()`, not inside it.** The first
draft of this section said the opposite — fold it into that function, since it
is already the one place the question gets asked. That is wrong, and wrong in
a way worth recording: `event_party_is_live` is called by the *public read*
policy as well as by the publish check, so a plan lapsing would have hidden
every event the company had already published, including the ones families had
entered. The entitlement test therefore goes in the update policy's `with
check`, which only a row landing on `published` passes through. An expired plan
stops new publishing and retracts nothing.

It still lives in one place — `may_publish_event()` — rather than in the API,
for the reason that has held all phase: a rule the client enforces is a rule
the mobile client will not.

**Payment is recorded, not taken.** The same three columns as an entry — mode,
reference, paid at — on the subscription row, entered by the admin who saw the
money arrive. Phase 6 replaces the entering, not the columns.

Admin recording stays in `/admin/*` Next route handlers, with the rest of the
web-only console.

### Deliberately not in Phase 4

Seat maps, holds, waitlists, partial refunds, a payment gateway, and event
reminders. The first four are Phase 6's once money moves through the platform;
the last needs a scheduler and is not worth one yet.

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
| Event companies are their own table, not a provider_type | 18 exclusion clauses across 12 migrations, and none of providers' columns fit a venue business |
| The inert exclusion clauses stay | Rewriting 18 working functions to delete an always-true condition is a large diff and no behaviour change |
| No self-serve advertiser accounts | Admin-managed banners plus a lead form is enough |
| Payments deferred to Phase 6 | Model the booking data now, wire the gateway later |
| Capacity, never a seat map | A ground has a number, not a layout; the nearer model is a registration platform than a cinema |
| `entries_count` is a counter column, not a view or a definer read | RLS hides other families' entries, so nothing counting as the caller can produce "34 of 40 taken" |
| Capacity may rise freely, and fall only to what is already sold | One check constraint over two columns of the same row closes both the shrink and the overfill |
| Entries are cancelled, never deleted | The receipt records money that changed hands offline; deleting the row destroys the only trail there is |
| Cancellation has a deadline of its own | "No withdrawals in the last week" is a real rule, and closing entries a week early is not the same thing |
| Only a draft is private; cancelled and completed events stay readable | An event that vanishes empties the history of the families who entered it, exactly when they need to read it |
| Refund state is the organiser's word, not the platform's | No money moves through here until Phase 6, so no screen may promise what only the organiser can do |
| Running an event costs the same whoever runs it | Plans name a scope and entitlements name a party, so a coach's cheap listing plan cannot discount the events one |
| One-off and period billing in one catalogue | A coach running one tournament a year and a company running twenty pay for different amounts of the same thing, not different prices for it |
| Payment mode and reference recorded before there is a gateway | Razorpay becomes another mode value, so the register keeps one history rather than splitting into before and after |
| An API tier in front, RLS still underneath | 6,174 lines of SQL had nowhere to put a test and no contract a second client could build against; RLS stays because it cannot be forgotten |
| The API never holds the service role key | Querying as the caller means a missed check in a controller returns too little rather than leaking |
| Definer writes stay in the database | They exist because RLS cannot restrict which columns an UPDATE touches; moving them hands the client those columns |
| A surface reads one way or the other, never both | Two doors into one dataset is two implementations of one rule, which is what the API tier was added to stop |
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
| A query is not an enquiry | One is a lead a coach works through, the other a conversation; enquiries_one_live would have made them mutually exclusive with the same coach |
| A conversation opened from a query says so | A message from someone you never wrote to is what makes contact feel unsolicited |
| Phone required on a query, optional on an enquiry | Being called is the point of one and not the other; a query with no number is a request nobody can act on |
| A coach needn't accept an enquiry | The parent chose them — consent is the act of writing |
| Contact sharing is not blocked | Unenforceable, and a wall at cold start loses both sides |
| A trial class object from day one | The only cheap way to learn whether a match happened |
| Trials on group threads too | A group ends in the same first session, and Groups exists to produce them |
| The parent marks attendance | A coach certifying their own trials would void the review rule built on it |
| One de-duplicated alert count | Summing per-feature counts told people they had twice as much waiting |
| Notifications fire from triggers | A trigger catches every write whatever made it — web, API or mobile; a hook in any one client misses the others |
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
| The history is written by a trigger | A client-side log has holes exactly where the other client's users are, and now where the API's callers are too |
| Advertisers get an aggregate function, not a table | Counts with a five-family floor cannot be turned back into a household |
| marketing_opt_in is separate and defaults off | "Coaches may write to me" is not consent to be marketed at |
