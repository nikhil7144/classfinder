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
| **Browse / search page** | **not started** |
| **AI-assisted matching** + usage tracking | **not started** |

Provider profile captures: photo, category, services, help statement, age,
experience, certifications, fees (range + period), teaching formats, service
areas or branches, and **day- and place-wise availability**.

### Phase 2 — Groups, with 1:1 messaging

Parent-created demand, per the section above, plus the request → accept → chat
pipeline it depends on. Chosen ahead of Spaces because it is what stops approved
coaches going dormant while areas open one at a time — Spaces without demand is
a coach posting photos to nobody.

### Phase 3 — Spaces, with moderation

Community pages per provider (admin-creatable and claimable): photo and video
posts, join, and a public comments wall. Report/flag plus an admin review queue
ships **in this phase, not after** — parents and children are the audience.

Video is the main cost risk: its own bucket, explicit size and MIME limits.

### Phase 4 — Events & bookings

`event_planner` providers, events, bookings, and an events tab on the provider
dashboard. Payment status tracked manually; no gateway yet.

### Phase 5 — Advertising

Admin-managed banners and a public "advertise with us" lead form. No self-serve
advertiser accounts.

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
| Public space messages = comments wall | Live group chat is a materially bigger build; revisit if needed |
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
