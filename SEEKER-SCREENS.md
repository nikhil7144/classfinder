# Seeker app — screen inventory

What every seeker-facing web route actually contains, what serves it, and what
it becomes in Flutter. Written 2026-09-12 by reading the pages, not from
memory.

## Why this exists

The coach app was built from a reading of the API plus a recollection of the
web. That worked until groups, where diffing the new module against
`GroupOverview.tsx` turned up an **Extend** button with no endpoint behind it
and a reopen that produced a group claiming to be open that nobody could pitch
to. Neither was visible from the API side; both were obvious from the page.

Writing the same module from this document would have caught both before any
Dart existed. So: one row per thing on the screen, and a gap is recorded rather
than remembered.

**Scope:** the `seeker` flavor only. `/for-coaches`, `/privacy`, `/terms`,
`/students`, `/dashboard/*` and `/admin/*` are not a parent's screens.

**Size:** ~2,800 lines of pages plus ~3,800 lines of components. Larger than
the coach app.

---

## Gaps found while writing this

These are API or platform problems, not Flutter ones, and they block the screen
named beside them.

| # | Gap | Blocks | Fix |
|---|---|---|---|
| G1 | ~~`CreateGroupDto` has no `validityDays`~~ | — | **Closed.** The creator picks the window, 1–30 days |
| G2 | ~~`studentCount` allowed 1~~ | — | **Closed.** Floor is two: a group of one family is an enquiry |
| G3 | ~~Geolocation~~ | — | **Closed.** `geolocator`, coarse only, with `data/location.dart` turning every refusal into a sentence |
| G4 | ~~`/account/settings` unread~~ | — | **Closed.** Inventoried in §9 |

Every gap found while writing this is now closed.

---

## 1. Getting in

| Web | Dart | Serves it | Notes |
|---|---|---|---|
| `/login`, `/signup/seeker` | `screens/auth/sign_in_screen.dart` | Supabase auth | **Built.** Email OTP. Google is not wired on mobile — README §7 |
| `/choose-role` | `screens/auth/choose_role_screen.dart` | `PUT /me/role` | **Built.** The seeker flavor offers one option, correctly |
| `/auth/callback` | — | — | Deep links, not a screen. README §7 |
| `/complete-profile/seeker` | `screens/profile/` | `PUT /seekers/me` | **Built.** See §2 |

## 2. The profile — `/complete-profile/seeker`, `/account/profile`

`SeekerProfileForm` (502 lines) + `RequirementFields` (267). One form doing two
jobs: who you are, and what you want. Both save in one call.

**Who you are**

| Field | Required | Serves it |
|---|---|---|
| Name | yes | `name` |
| Who you're looking for — self / mother / father / guardian / relative / other | yes | `relationToLearner` |
| Mobile number | yes | **`PUT /me/phone`** — it is on `profiles`, not `seekers` |
| City → Area | yes | `areaId` |
| "Use my location" → lat/lng | no | `lat`, `lng` — **G3** |
| Photo | no | Storage `seeker-photos`, then `photoUrl` |

**What you want** — `RequirementFields`

| Field | Serves it |
|---|---|
| What are you looking for (taxonomy, grouped) | `lookingFor[]` |
| Learner age | `learnerAge` |
| Level — beginner / improver / advanced / exam_prep | `level` |
| How classes run | `preferredModes[]` |
| Which days | `preferredDays[]` |
| Time of day | `preferredTime` |
| Budget min / max / period | `budgetMin`, `budgetMax`, `budgetPeriod` |
| Anything else | `requirementNotes` |

**Two consent switches, pointing opposite ways — both deliberate**

- `openToOffers` defaults **on**: a parent who has typed out what they want has
  asked to be found. Off hides them from `students_for_provider` immediately.
- `marketingOptIn` defaults **off**.

**The rule that is easy to miss:** *what you want* is only required when
`openToOffers` is on. The form's own comment: "a parent who just wants to
browse and message owes us nothing." `listing_rules.dart` has no equivalent yet
— the seeker rules need their own port, same as the coach ones.

## 3. Home — `/home`

`SeekerHome` (273) plus four feed components.

| Section | Serves it | Notes |
|---|---|---|
| "Your search" — what they asked for, edit link | `GET /seekers/me` | |
| **Waiting on you** | `GET /alerts` | Pending pitches, coach approaches |
| Profile-incomplete prompt | `GET /me` | |
| `SuggestedCoaches` (173) | `POST /suggestions/coaches` | AI ranking. Only when the requirement is published |
| `FollowedSpaces` (83) | `GET /spaces/following` | |
| `InterestFeed` (96) | `GET /feeds/me` | |
| Start a group | → `/groups/new` | |
| Coming next | static | |

`MatchedSpacesRail` (123) exists and is not on this page — check before
assuming it is dead.

## 4. Search — `/search` (397)

The screen a parent judges the product by.

| Control | Serves it |
|---|---|
| City, Area | `GET /reference` |
| What are you looking for | `GET /reference` taxonomy |
| Radius — `RADIUS_OPTIONS` | `radiusKm` |
| Use my location | `lat`, `lng` — **G3** |
| Results | `GET /providers/search` |

Deep-linkable: `?area=` and `?service=` preset the filters. The subject is
prefilled from the profile (`subjectFromProfile`), and when nothing is found
inside the radius it offers to widen to the maximum rather than showing an
empty list.

**How distance works, because it is not obvious.** `search_providers` measures
**centroid to centroid**: the origin is the seeker's lat/lng if they shared one
and otherwise the searched area's centroid, and the target is the nearest of
the coach's `provider_discoverable_areas`. A coach's street address is never
used, which is deliberate — it cannot leak through a distance.

The consequence that bites: when an area is given, candidate areas are filtered
to *that* area, so **without a lat/lng the origin and the target are the same
point and every distance is exactly 0**. The web guards this with
`showDistance={Boolean(coords)}`. Show it only when a real location was shared.

**`ProviderCard` (121) must render all of:** photo or initial, name, Featured
badge, nearest area, distance, experience, fees, `help_statement`, services,
teaching places. The DTO carries all 18 columns — that was fixed once already
when a first pass dropped five of them.

## 5. Coach profile — `/provider/[id]` (273), `/provider/[id]/space` (168)

Two tabs, not one page with a section: a Space paginates and the profile does
not, and an event planner has a Space with no profile behind it.

**Profile tab** — `GET /providers/{id}`: name, photo, fees, About, Teaches,
How classes run, Availability grouped by place, Certifications.

**Actions**: `EnquiryForm` → `POST /enquiries`; `RaiseQueryForm` →
`POST /queries`.

**Space tab** — `GET /spaces/{providerId}` + `/posts`, follow/unfollow,
reactions. `PostCard` (229) is richer than the coach app's: it carries
reporting, which the coach's own Space does not.

## 6. Messages — `/account/messages`

`ThreadInbox` (149) + `ThreadPane` (472) + `TrialCard` (409). The coach app has
a simpler version of this; the seeker side adds three things it does not have.

| Element | Serves it |
|---|---|
| Inbox, both kinds | `GET /threads` |
| Messages | `GET/POST /threads/{kind}/{id}/messages` |
| Live delivery | Supabase Realtime |
| Where it came from — "They asked for a call about X on Y" | `ThreadDto.origin` — **built** |
| **Answer an approach** | `POST /enquiries/{id}/respond` |
| **Phone sharing**, with "They can see your number" / "Your number is not shared" | `PUT /enquiries/{id}/phone` |
| **Trials** — propose, confirm/decline, outcome | `/trials` — 4 endpoints |

`TrialCard` collects: day and time, how long, where, how many students, address
or landmark. All are on `ProposeTrialDto`.

## 7. Groups

| Web | Serves it |
|---|---|
| `/groups/new` (329) | `POST /groups` |
| `/groups/[id]` (237) + `GroupOverview` (267) | `GET /groups`, `PATCH /groups/{id}` |
| `GroupTabs` (73), `GroupThread` (272), `GroupMessages` (151) | `GET /groups/{id}/pitches`, `/threads/group/{requestId}/messages` |
| `/groups/[id]/chat/[requestId]` | same thread endpoints |
| `/account/groups` (124) | `GET /groups` |

**Create collects:** service, city, area, society, student count (floor of
two), notes, share phone, validity days (1 week / 10 days / 3 weeks / 1 month
on the web; the API takes any 1–30).

**Overview offers:** join, share link (copies `groupShareUrl(id)`), extend,
close, reopen. Extend and reopen were the two gaps found the hard way; both are
now on `PATCH /groups/{id}`.

**Pitches:** accept / decline, and the contact strip once accepted.

## 8. Events

| Web | Serves it |
|---|---|
| `/events` (132) | `GET /events/city/{cityId}` |
| `/events/[id]` (136) | `GET /events/{id}` |
| `/events/[id]/enter/[categoryId]` | `POST /entries` |
| `/account/entries` (167) | `GET /entries/mine`, `POST /entries/{id}/cancel` |

**Entry collects:** participant name, participant DOB, **consent** — and for a
team category, `teamSize - 1` further members with name and DOB each.

The consent box is **never pre-ticked**, and the wording must match
`ENTRY_CONSENT_VERSION` in `api/src/entries/dto/entry.dto.ts`. The API refuses
the entry without it, so a Flutter client gets no further than the web form
does. This is the one place the product takes a child's name and date of birth.

## 9. Account

| Web | Serves it | Status |
|---|---|---|
| `/account` (11) | — | Index |
| `/account/profile` (54) | §2 | |
| `/account/queries` (18) | `GET /queries` | `QueryList side="seeker"` — watch only, no worklist actions |
| `/account/settings` (127) | Supabase auth | Change email, sign out. No API call — both are `supabase.auth` |

---

## Where a screen lives

Extends `MOBILE-PLAN.md` §9 for the seeker flavor. Keep both current.

| Web route | Dart |
|---|---|
| `/login`, `/signup/seeker` | `screens/auth/sign_in_screen.dart` *(shared)* |
| `/complete-profile/seeker`, `/account/profile` | `screens/profile/` |
| `/home` | `screens/home/` *(not built)* |
| `/search` | `screens/search/` |
| `/provider/[id]`, `/provider/[id]/space` | `screens/coach/` |
| `/account/messages` | `screens/threads/` *(shared)* |
| `/groups/*`, `/account/groups` | `screens/groups/` *(not built)* |
| `/events`, `/events/[id]`, entry, `/account/entries` | `screens/events/` *(shared, needs the seeker half)* |
| `/account/settings` | `screens/settings/` *(not built — change email, sign out)* |

## Motion and waiting

Done across every screen that exists, 2026-09-12.

- **Skeletons** where the shape is knowable — `widgets/skeleton.dart`, a port
  of `components/ui/PageSkeleton.tsx` including its reasoning: blocks one step
  above the card they lie on, `surface-3` on `surface`, no shadows. A spinner
  is still right for a wait with no shape, like a save in flight.
- **One page transition for both platforms**, in `A91.theme()`. Flutter's
  defaults differ per platform, so the two matched neither each other nor the
  web until this was stated.
- **Tabs cross-fade** without losing their place. Deliberately a `Stack` of
  `AnimatedOpacity` rather than an `AnimatedSwitcher`: the latter rebuilds the
  whole subtree on each switch and throws away the scroll positions that were
  the entire reason for an `IndexedStack`.

## Build order

Each slice is usable on its own, and each depends only on what is above it.

1. ~~**Profile**~~ — **done.** `screens/profile/`, `seeker_rules.dart`,
   `screens/shell/seeker_shell.dart`, and the router now picks a shell by
   flavor.
2. ~~**Search + coach profile**~~ — **done.** `screens/search/`,
   `screens/coach/`, and the contact sheet that carries both ways of getting
   in touch.
3. ~~**Messages**~~ — **done.** The shared thread screen gained the three
   things the coach version lacked: `ApproachBanner`, `PhoneSharingRow` and
   `TrialCard`. `ThreadDto` gained `showPhone`, which it did not carry — the
   control would otherwise have read "not shared" whatever the truth was.
4. **Home** — it is mostly links to 1–3, so it is worth the least first.
5. **Groups**.
6. **Events** — the seeker half; the coach half already exists.
7. **Settings** — small: change email and sign out, both straight to
   `supabase.auth`. No endpoint needed.
