# Aspire91 — Mobile Plan (Flutter, Android + iOS)

Companion to `PLAN.md`, which stays the product and backend plan. This one
covers only the mobile client: how it is packaged, what it can be built on
today, and what every existing web screen becomes.

Written 2026-09-10 against the repository as it stands: 50 web routes, 34 API
endpoints, 33 Supabase RPCs and 22 tables read directly by the web app.

---

## 1. The recommendation, in one line

**One Flutter codebase, two build flavors — `seeker` and `provider` — shipped
initially as a single store listing, split into two listings when coach supply
justifies the second.**

Packaging becomes a build-config decision rather than an architectural one, so
the choice can be deferred without a rewrite either way.

### Why two flavors rather than one app with a role switch

The data model has already made this decision, and it is worth reading the
constraint rather than working around it:

```sql
role text not null check (role in ('seeker','provider','organiser','admin'))
```

with `seekers.user_id` and `providers.user_id` both `unique`. **One account is
exactly one role.** `switch_role()` is not a counter-example — it refuses once
`profile_complete` is true (*"Your profile is already complete, so the account
type cannot be changed"*) and it **deletes** the row for the role being left,
cascading branches and service areas. It is an escape hatch for somebody who
picked wrong during onboarding, not dual-role support.

So a single app would open by asking a question the account answers once and
never again. The two sides also share almost no screens: a parent searches,
enquires and reads; a coach works a demand feed, answers leads, posts to a
Space and runs events. The nouns overlap, the jobs do not.

A coach who is also a parent needs a second account today, on a different
email. That is a real limitation, and it is a *data model* question, not a
mobile one — see §7.

### Why one codebase rather than two

Both sides use `me`, `reference`, feeds, Spaces, events, entries, threads and
`queries` — the last being literally two ends of one conversation. Two
repositories would duplicate the generated Dart client, auth, chat, the feed
and event browsing, and those copies would drift. The API tier exists partly
to stop a second client guessing at the schema; two mobile codebases would
reintroduce that at the client layer.

### Why one store listing first

There is one approved coach in one live city. Two listings means two review
queues, two release trains, two crash dashboards and two ASO efforts against
no evidence yet that either is wanted. Split when the coach side has enough
daily use that a dedicated listing earns its keep.

**Precedent both ways:** UrbanPro — the closest comparator — ships
*"UrbanPro for Tutors"* as a separate Play Store app. Urban Company, Swiggy
and Uber all split their partner apps too. All of them did so *after* supply
density, not before.

### The organiser is not in the app at all

**Revised.** This section originally said organiser rides inside the provider
flavor as a role, on the grounds that its job is a subset of what a coach does
with events. Building the coach app showed that to be wrong.

An organiser shares none of what the app actually does. They have no listing,
no demand feed, no queries and no Space — four of the five tabs are empty for
them, and the fifth would offer them a coach listing they must not create
(`save_provider_profile()` does not check the caller's role, so it would
write a `providers` row for an organiser account).

Worse, the role chooser offered "I run events", and choosing a role is one
way: `switch_role()` refuses once a profile is complete. Somebody picking it in
the app got an account they could not undo and could not use.

So `Flavor.provider.roles` is `{'provider'}` and the gate points an organiser
at the website, naming their actual role rather than calling them a family.
Running events is a desk job — dates, venues, fee tiers, a register — and it
already works on the web. A third flavor remains the wrong answer for the same
reason it always was.

---

## 2. The finding that shapes the whole schedule

**The mobile app cannot be built on the API as it stands.** The API covers 34
endpoints, and the parts it covers are not the parts a parent's critical path
needs.

| Surface | Door today | Needed by |
|---|---|---|
| `reference`, `me` | **API** | both |
| Spaces feeds — city feed, my feed | **API** | both |
| Events, categories, entries, register | **API** | both |
| Queries — raise, answer, status, read | **API** | both |
| Subscriptions, plans | **API** | provider |
| AI suggestions — coaches, students | **API** | both |
| Organiser listing (`organisers/me`) | **API** | organiser |
| **Search** (`search_providers`) | Supabase direct | **seeker — critical path** |
| **Provider profile** (`get_provider_profile`) | Supabase direct | **seeker — critical path** |
| **Threads / chat** (`my_threads`, `mark_thread_read`, …) | Supabase direct | **both — critical path** |
| **A Space's own page** (`space_feed`, `get_space`, `set_reaction`) | Supabase direct | both |
| **Groups** (`my_groups`, `get_group_invite`, `get_request_contact`, group tables) | Supabase direct | seeker |
| **Demand feed** (`students_for_provider`) | Supabase direct | **provider — critical path** |
| Trials (`propose_trial`, `respond_to_trial`, `mark_trial_outcome`) | Supabase direct | both |
| Enquiries (`respond_to_approach`, `withdraw_approach`, `set_enquiry_phone_sharing`) | Supabase direct | both |
| Alerts (`my_alerts`, `mark_notifications_read`) | Supabase direct | both |
| Profile writes (`seekers`, `providers`, `organisers`) | Supabase direct | both |
| `switch_role` | Supabase direct | onboarding |
| `/api/admin/*` | Next route handlers | **web only — never mobile** |

Roughly: **Phase 4 is migrated, Phases 1–3 largely are not.** The seeker
journey — search a coach, read their profile, enquire, chat — is the least
migrated part of the product, and it is the first thing a parent does.

### Two doors that stay open on purpose

`PLAN.md` already settles these and mobile inherits them unchanged:

- **Realtime** — thread subscriptions are websockets with RLS applied per
  connection. Flutter uses `supabase_flutter` for these directly.
- **File bytes** — uploads go to Storage against a signed URL; images serve
  from the CDN. Never forwarded through the API.

So the app carries **both** clients regardless: the generated Dart API client,
and `supabase_flutter` for auth, realtime and Storage. That is by design, not
a compromise.

### The rule that must not erode

> A **surface** reads one way or the other, never both. Migrate a whole
> surface or none of it.

Mobile is allowed to read an unmigrated surface via `supabase_flutter` **only
if the web still does too**. The moment a surface is migrated, both clients
move. What must never happen is the web on the API and Flutter on the RPC for
the same surface — that is two implementations of one rule, which is the thing
the API tier exists to prevent.

---

## 3. Migration order — the API work that gates mobile

Each of these is a backend task, not a Flutter task, and each unblocks a
screen. Ordered by what the seeker journey needs first.

| # | Migrate | Unblocks | Notes |
|---|---|---|---|
| M1 | `search_providers` → `GET /api/v1/providers/search` | Search | The single biggest gap. Returns are already shaped by the RPC; this is a contract and a DTO, not new logic |
| M2 | `get_provider_profile` → `GET /api/v1/providers/{id}` | Coach profile | Read-only, no security decision RLS is not already making |
| M3 | `space_feed`, `get_space`, `set_reaction`, `my_followed_spaces` | Space pages, follow, react | `space_feed` still returns snake_case — migrating is also the moment to fix that |
| M4 | Threads — `my_threads`, `group_threads`, `mark_thread_read` | Chat list, read state | Message *delivery* stays Realtime; only the list and read-state move |
| M5 | `students_for_provider` | Provider demand feed | Provider critical path; pairs with the already-migrated `suggestions/students` |
| M6 | Groups — `my_groups`, invites, requests, contact | Group screens | **Done.** /groups, 9 endpoints. Pitching *to* one stayed on /students/{kind}/{id}/approach |
| M7 | Trials + enquiries | Trial flow, approaches | **Done.** /enquiries (4) and /trials (4). Definer writes stayed; the API exposes them |
| M8 | Profile writes — seeker, provider, organiser | Onboarding | **Done.** /providers/me, /organisers/me, /seekers/me. phase3r guards which role may own which row |
| M9 | `my_alerts`, `mark_notifications_read` | Badges | Small, do it with whatever surface needs it first |

M1–M4 are the minimum for a useful seeker app. M1, M2, M5 and M4 are the
minimum for a useful provider app.

**As of 2026-09-12, M1–M9 are all done.** Every surface a mobile client needs
has a contract, and the provider app is built against it. What is left is
Flutter work — the seeker flavor — not backend.

The web has not moved onto most of these endpoints and does not have to: the
rule is that a surface reads one way or the other, and migrating each web
surface is its own change with its own testing.

**Do not build Flutter screens against `supabase_flutter` for M1–M9 as a
shortcut.** It would work, and it would produce exactly the second client
reading the schema and guessing that `PLAN.md` records as the reason the API
exists.

---

## 4. Every web screen, and what it becomes

50 routes. `S` = seeker flavor, `P` = provider flavor (organiser rides here),
`—` = not a mobile screen.

### Public and marketing

| Web route | Mobile | Notes |
|---|---|---|
| `/` (landing) | — | Acquisition surface, stays web. The app opens on the role's home |
| `/for-coaches` | — | Play/App Store listing does this job instead |
| `/privacy` | S P | **Required by both stores.** In-app link to the live page |
| `/terms` | S P | Same |

### Auth and onboarding

| Web route | Mobile | Notes |
|---|---|---|
| `/login` | S P | Email OTP + Google. `supabase_flutter`, native Google sign-in |
| `/signup/seeker` | S | Role preset by flavor; no role question asked |
| `/signup/provider` | P | Same |
| `/signup/organiser` | P | Behind a "we run events" choice, not a separate app |
| `/auth/callback` | S P | Becomes a **deep link / app link handler**, not a screen. New platform work — see §5 |
| `/choose-role` | S P | Only reachable when an existing account's role does not match the flavor. See §5 |
| `/complete-profile/seeker` | S | Needs M8 |
| `/complete-profile/provider` | P | Needs M8. Multi-step: services, areas, fees, branches |
| `/complete-profile/organiser` | P | Needs M8 |

### Seeker app

| Web route | Mobile | Needs | Notes |
|---|---|---|---|
| `/home`, `/dashboard` (SeekerHome) | S | API + M9 | Home tab: requirement, suggestions, feed, groups |
| `/search` | S | **M1** | Search tab. Area + service + radius; map view is a mobile-native opportunity |
| `/provider/[id]` | S | **M2** | Coach profile |
| `/provider/[id]/space` | S | **M3** | Their Space |
| `/groups/new` | S | M6 | Create a group |
| `/groups/[id]` | S | M6 | Group detail, members, validity |
| `/groups/[id]/chat/[requestId]` | S | M6 + Realtime | Group chat |
| `/account/groups` | S | M6 | My groups |
| `/account/queries` | S | API ✓ | My enquiries — already migrated |
| `/account/messages` | S | **M4** + Realtime | Chat list → thread |
| `/account/entries` | S | API ✓ | What we have entered |
| `/account/profile` | S | M8 | Edit requirement and profile |
| `/account/settings` | S | M8 | Notifications, phone sharing, delete account |
| `/events` | S | API ✓ | Browse |
| `/events/[id]` | S | API ✓ | Event detail |
| `/events/[id]/enter/[categoryId]` | S | API ✓ | **Carries the DPDP consent — see §6** |

### Provider app (organiser included)

| Web route | Mobile | Needs | Notes |
|---|---|---|---|
| `/dashboard` (ProviderHome) | P | API + M9 | Listing state, alerts, shortcuts |
| `/dashboard` (OrganiserHome) | P | API ✓ | Same tab, organiser role |
| `/students` | P | **M5** | Demand feed + "suggest my best matches" |
| `/dashboard/queries` | P | API ✓ | Leads, status, callbacks |
| `/dashboard/messages` | P | **M4** + Realtime | Chat |
| `/dashboard/groups` | P | M6 | Groups in my areas |
| `/dashboard/space` | P | **M3** + Storage | Post photos and video. Camera roll is a mobile advantage |
| `/events/new` | P | API ✓ | Create |
| `/events/[id]/edit` | P | API ✓ | Edit, categories, publish |
| `/events/[id]/entries` | P | API ✓ | Register, payments, cancellations |
| `/account/profile` | P | M8 | Edit listing |
| `/account/settings` | P | M8 | |
| `/account/messages` | P | M4 | Shared with seeker code |

### Admin — web only, permanently

`/admin`, `/admin/api-usage`, `/admin/audience`, `/admin/locations`,
`/admin/moderation`, `/admin/organisers`, `/admin/plans`,
`/admin/provider-categories`, `/admin/providers`, `/admin/providers/[id]`,
`/admin/service-categories`, `/admin/subscriptions`.

Twelve routes on Next route handlers. `PLAN.md` already says they stay put.
Moderation and approvals want a big screen and a keyboard, and shipping an
admin console through app review is friction for no gain.

---

## 5. Mobile-only work with no web equivalent

Real deliverables that do not exist anywhere in the repo today.

- **Deep links / app links.** `/auth/callback` is a web page; on mobile the
  OTP link and the Google round trip must return into the app. Needs an
  `assetlinks.json` on `www.aspire91.com` and an Apple App Site Association
  file, plus the redirect allowlist in Supabase extended to the app scheme.
- **Push notifications.** The web dispatches email via Resend
  (`app/api/notifications/dispatch`). Mobile wants FCM and APNs, a device
  token table, and a decision on which of the existing notification kinds push
  rather than email.
- **Wrong-flavor handling.** A coach who installs the seeker app, or a parent
  who installs the coach app, must be told plainly and pointed at the other —
  not dropped on `/choose-role`, which would offer to *delete* their listing
  via `switch_role`. This is the sharpest edge of the two-flavor decision.
- **Store compliance.** Play Data Safety and App Store privacy labels must
  match `/privacy` exactly, including that a learner's age and free-text notes
  reach Google's Gemini. Age rating needs care: the app is used by adults about
  children.
- **Offline and flaky networks.** Every read currently assumes a network. The
  demand feed and chat are the two worth caching.
- **Native affordances worth having:** camera for Space posts, a map view on
  search, contacts-free share sheet for group invites.

---

## 6. DPDP, carried into the app

The consent work landed on the web (`db/2026-09-13-phase3n-entry-consent.sql`)
and applies to mobile unchanged, because it is enforced in Postgres:

- `enter_event` refuses without `p_consent_version`; the DTO refuses anything
  but `consentGiven: true`. **A Flutter client gets no further than the web
  form does.**
- The app must show wording matching `ENTRY_CONSENT_VERSION`. Bump both
  together, as the constant's comment says.
- Event entry is still the only place the product takes a child's name and date
  of birth. That is as true in the app as on the web.
- **Unresolved and unchanged by mobile:** Rule 10 verifiable parental consent
  turns on holding reliable identity or age information about the parent, and
  `profiles` carries a role and a phone behind an email OTP. A mobile app does
  not improve this — though device-level signals are one more option on the
  table if it is ever addressed.

---

## 7. Decisions to make before building

1. **Can one account hold two roles?** Today: no, permanently, once onboarded.
   If that should change, it is a schema change — role becomes a set, or a
   profile grows multiple party rows — and it flips §1 toward a single app with
   a role switcher. **Settle this first; the packaging follows from it.**
2. **How much API migration before the first build?** M1–M4 is the honest
   minimum for a seeker app. Building sooner means `supabase_flutter` against
   unmigrated RPCs, which is the trap §2 describes.
3. **Which flavor ships first?** Seeker is the acquisition surface; provider is
   where daily engagement lives and where supply is the bottleneck. No strong
   recommendation without knowing which side the launch is pushing.
4. **Team size.** Everything above assumes maintenance lands on one person. Two
   people owning two sides makes an earlier split defensible.

---

## 8. What this plan does not cover

Payments (`PLAN.md` Phase 6), advertising (Phase 5), and any mobile-only
feature not present on the web. Both are downstream of the app existing.

---

## 9. Where a screen lives

Organised screen-wise, under `lib/src/screens/`. One folder per screen,
holding the screen and the widgets only that screen uses — `demand_card.dart`
is not a feature, it is the part of the students screen that would otherwise
make one 400-line file.

The web's layout is not a choice anyone made: Next.js App Router requires
`app/students/page.tsx` to sit at that path, because the folder structure *is*
the URL structure. Flutter declares its routes in `router.dart`, so the file
layout is free — and where the two correspond, they are named the same.

Three places they deliberately do not correspond, because a literal mirror
would encode a shape that does not fit:

- **`/dashboard`** renders SeekerHome, ProviderHome or OrganiserHome by role.
  The flavor does that job on mobile, so there is no dashboard screen.
- **`screens/shell/more_screen.dart`** has no web equivalent at all. A
  NavigationBar takes five destinations and the coach app has six things, so
  the listing and events — opened a handful of times a season, not daily —
  live one tap deeper. Signing out is there too.
- **`/dashboard/messages` and `/account/messages`** are one inbox at two paths
  for two roles. Mobile has one.
- **`/students`** is one file on the web and several here: screen, card, and
  soon detail and composer.

| Web route | Dart |
|---|---|
| `/login`, `/signup/provider` | `screens/auth/sign_in_screen.dart` |
| `/choose-role` | `screens/auth/choose_role_screen.dart` |
| — (role gate, no web equivalent) | `screens/shell/gate_screen.dart` |
| `/students` | `screens/students/` |
| `/dashboard/messages`, `/account/messages` | `screens/threads/` |
| `/account/profile` | `screens/listing/` |
| `/dashboard/space` | `screens/space/` |
| `/events`, `/events/new`, `/events/[id]/edit`, `/events/[id]/entries` | `screens/events/` |
| `/dashboard/queries` | `screens/queries/` |
| `/account/settings` | `screens/settings/` *(shared with the seeker app)* |
| `/admin/*` | never — web only |

Keep this table current. It is the answer to "where is the Flutter version of
that page", and it is cheaper to maintain than to reconstruct.
