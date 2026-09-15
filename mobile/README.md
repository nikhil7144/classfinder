# Aspire91 Mobile — developer handover

Flutter, Android + iOS, **one codebase, two flavors**: `seeker` (parents) and
`provider` (coaches and academies).

Event organisers are deliberately **not** in either app — they work on the
website. See `../MOBILE-PLAN.md` §1.

Read `../MOBILE-PLAN.md` first — it explains why two flavors, what every one of
the 50 web screens becomes, and which backend work has to land before the rest
can be built. This file is the setup guide.

---

## State of play

**Both flavors are built.** `../SEEKER-SCREENS.md` inventories all twenty of
the seeker's web routes and closes with "Every seeker slice is built"; the coach
app is feature-complete against what the API exposes. What is left is platform
and store work, not screens — §10 lists it.

Both flavors run. Both are worth putting on a device.

**Shared by both flavors**

| Screen | Files |
|---|---|
| Sign in — email OTP | `screens/auth/sign_in_screen.dart` |
| Choose a role | `screens/auth/choose_role_screen.dart` |
| Role gate — wrong-app and wrong-role dead ends | `screens/shell/gate_screen.dart` |
| Messages — inbox, conversation, live delivery, trials, approach answers, phone sharing | `screens/threads/` |

**`provider` — the coach app.** Five tabs: Students, Queries, Messages, Space,
More (listing, events, settings, sign out).

| Screen | Files |
|---|---|
| Students — the demand feed, and the one message | `screens/students/` |
| Queries — leads, call booking, dialling | `screens/queries/` |
| Space — posts, photos, video, reactions | `screens/space/` |
| Listing — the whole coach profile | `screens/listing/` |
| Events — create, publish, categories | `screens/events/` |
| Share your page — the listing link, once it is live | `screens/shell/more_screen.dart` |
| Register — entries, payments, withdrawals | `screens/events/` |
| Settings — the email you sign in with | `screens/settings/` *(shared)* |

**`seeker` — the families app.** Four tabs: Home, Find, Messages, You.

| Screen | Files | |
|---|---|---|
| Home — what is waiting, and who to look at first | `screens/home/` | built |
| Groups — start, join, share, pitches | `screens/groups/` | built |
| Profile — who you are, and what you want | `screens/profile/` | built |
| Search — area, subject, radius, distance | `screens/search/` | built |
| Coach page — profile and Space, two tabs | `screens/coach/` | built |
| Events — browse, enter, your entries | `screens/events/` | built |
| Settings — change email, sign out | `screens/settings/` *(shared)* | built |

`../SEEKER-SCREENS.md` has the rest, in order.

`flutter analyze` is clean and `flutter test` passes (184 tests).
`test/smoke_test.dart` imports both entry points specifically so the whole tree
is compiled by `flutter test`.

**It has been built into an APK and run on a device.** That is what §0 is
about: building it is what found the bugs a test suite of hand-written mocks
never could, and one of them stopped every new coach dead.

Google sign-in and deep links are **not wired** — see §7.

---

## 0. Read this first — what the last round of testing found

The app was built into an APK and put on a device, and the reports that came
back were "a coach whose profile is not finished gets an error saving it, and
sometimes signing in on an existing coach account". One bug caused both. It and
four others are already fixed in this repo.

**Two of the five fixes are not in the app at all** — they are a backend deploy
and a migration — so a new APK on its own changes nothing. One of the other
three is app-only and needs the rebuild.

### What you have to do, in order

1. **Deploy the API.** `api/` has the fix that matters. Until it is deployed,
   the bug below is live for every coach whatever APK they hold.
2. **Run `db/2026-09-21-phase3v-provider-role-check.sql`** in the Supabase SQL
   editor. Idempotent, safe to re-run, and it replaces one function whose body
   is otherwise unchanged from phase 3O.
3. **Then** rebuild both APKs (§2) and reinstall.

Steps 1 and 2 are a backend deploy and a migration. Neither needs a new app.

### The bug, because it is worth understanding before you touch anything

`GET /api/v1/providers/me` answered a coach with no listing yet by returning
`null`. Nest serialises that as **200 with a zero-length body** — the API's own
test pinned it as `expect(res.body).toEqual({})`. The app expected a 404,
because that is what `/seekers/me` does for the identical state, and cast the
body to a map. Dio decodes an empty body as `null`, so the cast threw a
`TypeError` — which is not an `ApiException`, so nothing caught it, and
`ListingScreen` showed *"Something went wrong loading your listing"* with a
retry that could never succeed.

Every coach without a `providers` row was locked out of the one screen that
creates one. That is every new signup, and every existing web account that
never finished its listing — which is why it looked like "an error on login"
to some people and "an error saving my profile" to others.

Neither half was unreasonable on its own. Nobody had ever written down which
one was right: `MOBILE-PLAN.md` §M8 said "Done — /providers/me, /seekers/me"
and `api/openapi.json` declared only `200 MyListingDto`. The two sides guessed,
and guessed differently. §5 now carries the rule.

### The other three

- **`providers.service.ts` returned a 500 for a correct refusal.** phase 3R's
  role-guard trigger raises Postgres `23514`, which is not `P0001`, so a
  readable refusal arrived as a server fault carrying a raw Postgres string.
  `seekers.service.ts` had mapped it all along; the provider half had not.
  `save_provider_profile()` now also checks the role itself and raises a
  sentence — that is the migration in step 2.
- **`GET /api/v1/me` swallowed its read errors.** A failed `profiles` read
  answered `role: null`, which every client reads as a brand-new account, so an
  established coach was shown the role chooser. A failed `providers` read made
  an approved, findable listing look unstarted. Both now fail loudly.
- **An availability slot's place was a class format, not a venue.** The app fed
  `teachingPlaces` — "group or one-to-one" — into the picker whose value is
  stored as *where* a slot happens, so a coach editing on the phone wrote
  `individual_classes` into the same `providers.availability` column a browser
  fills with `Indirapuram`. One column, two clients, two meanings, last write
  wins. phase 2U separated the two questions and the app had never caught up —
  partly because the web's own `AvailabilityEditor` still carried a pre-2U
  comment saying the places were teaching formats. §5 has the rule; the
  derivation is `availabilityPlaces()` and it is pinned in
  `listing_rules_test.dart`. **App-only — it needs the APK rebuild, not the
  deploy.**

### And one that was hiding in the test suite

`flutter test` had been **failing since the taxonomy commit** and nobody ran
it. `A91.group` was correctly updated to the real group keys; the test still
passed the old short names. Worse, the old test had been pinning a bug:
`wellness`, `mind`, `indoor` and `exam` were never the API's keys, so four of
the ten taxonomy groups had been rendering in fallback grey the whole time and
a green suite said they were covered.

**Run `flutter test` and `cd api && npm test` before you build anything.** A
test that agrees with the code and not with the contract is worse than no test.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Flutter SDK | 3.35+ (Dart 3.9+). Written against Flutter 3.47.3 / Dart 3.13.3 |
| Android Studio | Ladybug or newer, with the Flutter and Dart plugins |
| JDK | 17 |
| Xcode | 15+ — macOS only, for iOS |
| Node.js | 20+ — only if you regenerate `api/openapi.json` |

```bash
flutter doctor        # must be clean for android before you continue
cd mobile && flutter pub get
```

---

## 2. Configuration

No `.env` ships with the app. Everything comes in through `--dart-define`, and
`Env.assertConfigured()` throws a named error at startup if any is missing.

| Define | Value |
|---|---|
| `SUPABASE_URL` | `https://wpegcnmqygdaqrjhryit.supabase.co` |
| `SUPABASE_ANON_KEY` | **ask for it** — not committed |
| `API_BASE_URL` | `https://api.aspire91.com` |

The anon key is **public by design**: it is already in the web bundle, and
every request is authorised by RLS as the calling user. It is kept out of the
repo as hygiene, not because leaking it is a breach. The **service role key
must never be in the app** — it is not on the client and must not be added.

### Run

```bash
flutter run --flavor provider -t lib/main_provider.dart \
  --dart-define=SUPABASE_URL=https://wpegcnmqygdaqrjhryit.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon key> \
  --dart-define=API_BASE_URL=https://api.aspire91.com
```

Swap `provider` → `seeker` and `main_provider.dart` → `main_seeker.dart` for
the other app.

### Both APKs, for testing

```bash
D=" --dart-define=SUPABASE_URL=https://wpegcnmqygdaqrjhryit.supabase.co     --dart-define=SUPABASE_ANON_KEY=<anon key>     --dart-define=API_BASE_URL=https://api.aspire91.com"

flutter build apk --debug --flavor provider -t lib/main_provider.dart $D
flutter build apk --debug --flavor seeker   -t lib/main_seeker.dart   $D
```

They land in `build/app/outputs/flutter-apk/`, one per flavor, with different
application ids — so **both install side by side on one phone**, which is the
point: a coach account and a family account talking to each other is the only
way to test half of this.

`--debug` because release builds are still signed with the debug keystore (see
§3). For anything going to a tester outside the team, sort the signing config
first.

### Android Studio

Two run configurations (Run → Edit Configurations → **+** → Flutter):

| Field | Seeker | Provider |
|---|---|---|
| Dart entrypoint | `lib/main_seeker.dart` | `lib/main_provider.dart` |
| Build flavor | `seeker` | `provider` |
| Additional args | the three `--dart-define`s | same |

Commit them under `.idea/runConfigurations/` so nobody retypes the defines.

---

## 3. Flavors

Android is **done** — `android/app/build.gradle.kts` carries the
`audience` dimension and both product flavors.

| Flavor | Application id | Store name |
|---|---|---|
| seeker | `com.aspire91.app` | Aspire91 |
| provider | `com.aspire91.app.coach` | Aspire91 for Coaches |

> **Confirm the application id before the first Play upload.** It is permanent
> once published — a published app's id can never be changed. `com.aspire91.app`
> was chosen to match the brand and the domain; if the business wants something
> else, change it now, in `android/app/build.gradle.kts` and the Kotlin package
> under `android/app/src/main/kotlin/`.

Release builds are still signed with the **debug** keystore, so that `flutter
run --release` works at all. A real signing config is your job before upload.

### iOS is not done

Xcode calls them schemes, and they cannot be generated from a Windows machine.
In `ios/Runner.xcodeproj`:

1. Duplicate `Debug`, `Release` and `Profile` into `Debug-seeker`,
   `Release-seeker`, `Profile-seeker`, and the same for `provider`.
2. Create two schemes, `seeker` and `provider`, each on its own configurations.
3. `PRODUCT_BUNDLE_IDENTIFIER` per configuration: `com.aspire91.app` and
   `com.aspire91.app.coach`.
4. `CFBundleDisplayName`: `Aspire91` and `Aspire91 for Coaches`.

`ios/Runner/Info.plist` already carries `NSCameraUsageDescription` and
`NSPhotoLibraryUsageDescription` — the listing screen's photo picker. iOS
terminates the app rather than refusing the picker when those are missing.

---

## 4. How the code is arranged

Screen-wise, mirroring the web's routes. `MOBILE-PLAN.md` §9 holds the
route → folder table and **should be kept current** — it is the answer to
"where is the Flutter version of that page".

```
mobile/
  lib/
    main_seeker.dart          flavor entry point
    main_provider.dart        flavor entry point
    src/
      app.dart                shared MaterialApp.router
      flavor.dart             Flavor enum, role mapping
      router.dart             go_router, one auth redirect
      providers.dart          every Riverpod provider, hand-written
      config/env.dart         --dart-define reader, startup assertion
      theme/theme.dart        Charcoal & Coral, ported from globals.css
      data/
        api.dart              Dio + bearer + the service's own error sentence
        supabase.dart         auth, realtime, Storage — nothing else
        listing_rules.dart    port of the web's lib/profile-rules.ts
        models/               hand-written, field names match the DTOs
        repositories/         one per surface; pure Dart, no Riverpod
      screens/                one folder per screen
      widgets/                shared: PrimaryButton, states, skeleton, branding
  test/                       184 tests, no device needed
```

`lib/src/providers.dart` is the seam. Below it — `lib/src/data` — is pure Dart
that imports nothing from Riverpod, so it stays testable. Above it, screens
read providers and never construct a repository themselves.

### Models are hand-written, on purpose

`tool/gen_api_client.sh` holds the openapi-generator command, and it is **not
used**. The generator needs a JDK 11+ toolchain that the authoring machine did
not have, so the models the built screens need were written by hand with field
names matching the DTOs exactly — swapping to a generated client later is a
deletion, not a rewrite. If you have the toolchain and want to switch, that is
a reasonable first improvement.

`api/openapi.json` is generated from the same DTOs that validate requests at
runtime (`cd api && npm run spec`). It is the contract; do not hand-edit it.

---

## 5. Architecture rules that are not negotiable

From `../PLAN.md`, and each one cost something to learn.

### Two doors, and only two, go straight to Supabase

`supabase_flutter` is for **auth, realtime and Storage**. That is it.

- **Realtime** — `ThreadsRepository.incoming()` subscribes to
  `group_messages` / `enquiry_messages`. RLS applies per connection; proxying
  a websocket rebuilds that for no gain.
- **File bytes** — `ListingRepository.uploadPhoto()` writes to
  `provider-photos` and `SpacesRepository.uploadImage()` to `space-media`.
  Never forward megabytes through the API.

Everything else goes through `api.aspire91.com`.

### Do not read unmigrated tables or RPCs from the app

The web still calls SQL functions and tables directly, and `supabase_flutter`
would happily let you do the same. **Don't.** RLS would keep it safe, but it
makes the app a second client guessing at the schema — which is what the API
tier exists to stop. If a screen needs a surface the API does not have yet, the
API work comes first. `MOBILE-PLAN.md` §3 has the order.

> A **surface** reads one way or the other, never both. Migrate a whole surface
> or none of it.

### One account is one role

`profiles.role` is a single column and both party tables are unique on
`user_id`. `switch_role()` refuses once a profile is complete and **deletes**
the row for the role being left. So:

- the coach app never asks "are you a parent?" — the flavor decides,
- an account whose role does not match the flavor is told plainly and pointed
  at the other app. **Do not route them to the role chooser**: that offers
  `switch_role`, which would destroy a completed listing. `GateScreen` and
  `_WrongAppEscape` already handle this; keep it that way.

### Show the API's own sentence

The service answers a refusal with something a reader can act on — *"Finish
your coach or company profile before creating an event"*. `ApiClient` already
extracts it; show it. Replacing it with "Something went wrong" is a bug the
web shipped once and was worth fixing.

### "Nothing yet" is a 404, and never an empty body

A surface that can legitimately be empty — no listing started, no profile
filled in — says so with a status code. Never with `200` and nothing in it.

This is not style. A Nest handler that returns `null` sends a zero-length body,
`openapi.json` still advertises the DTO, and every client that believes the
contract casts an empty response to a model. Dart throws a `TypeError` on that
cast, which is not an `ApiException`, so it lands outside every `catch` the
screens have and surfaces as "something went wrong" on the one screen somebody
needed. §0 has the full account; it cost every new coach their onboarding.

So:

- **In the service** — `throw new NotFoundException("...")` with a sentence,
  the way `/seekers/me` always did. Do not `return null` from a controller.
- **In the contract** — declare it. `@ApiNotFoundResponse` on the route, so the
  spec says the state exists and a generated client handles it.
- **In the repository** — catch the 404 and answer `null`, *and* treat an empty
  200 as the same thing. Belt and braces, because an app already on a phone
  cannot be patched when the server changes its mind.

`/providers/me` and `/seekers/me` now both do all three; `ListingRepository.mine()`
and `SeekerRepository.mine()` are the repository half of it. Copy that shape.

One instance is left: **`GET /api/v1/organisers/me` still returns `null`.** It
is the only other endpoint in the service that does, and neither flavor calls
it — organisers work on the website (§1 of `../MOBILE-PLAN.md`), so it has
never hurt anybody. Fix it if you touch that controller; do not let a third one
appear.

### An availability slot's place is a venue, never a class format

`providers.availability[].place` holds **where** a slot happens — a branch
name, `"My place"`, or an area name like `"Indirapuram"`. It does not hold a
`teaching_places` value. Those answer a different question — group or
one-to-one — and format says nothing about venue: one coach runs group batches
at their own academy, another travels to run them.

phase 2U is the migration that separated the two, and added
`providers.travels_to_students` to ask the venue question properly. Its column
comment says the quiet part: this list is what the appointment scheduler reads.

The app was built from a reading of the web, and the web's `AvailabilityEditor`
still carried a pre-2U comment saying the places were "chosen teaching formats
for an individual". So the app fed `teachingPlaces` into the picker and wrote
`individual_classes` into the column a browser fills with `Indirapuram` — one
column, two clients, two meanings, and whichever saved last won.

`availabilityPlaces()` in `data/listing_rules.dart` is the single derivation,
ported case for case from the `useMemo` of the same name in
`ProviderProfileForm.tsx` and pinned in `listing_rules_test.dart`:

- an **institution** — its branch names,
- an **individual** — `"My place"` if they teach at their own premises, plus
  every area they travel to, **only** when `travelsToStudents` is true. Service
  areas are required of every individual because search locates them that way,
  so offering them unconditionally put areas a coach has never visited into
  their availability.

Bare area names, not `Reference.areaLabel` — that renders "Indirapuram,
Ghaziabad" for a flat picker, and storing it would be the same mismatch again,
quieter.

### The listing saves whole, never in parts

`save_provider_profile()` replaces branches and service areas wholesale, in one
transaction. This exists because the web did it as four round trips with six
unchecked results: the delete ran before the insert, so a failure in between
left a coach **discoverable nowhere** and told them it had saved. Do not add a
partial-save or autosave path to `ListingScreen`.

---

## 6. Tests

```bash
flutter test          # 184 tests, no device or SDK needed
```

- `test/listing_rules_test.dart` pins the completeness rules against the web's
  `lib/profile-rules.ts`. If you change one, change both — a coach who
  completes a listing in the app and opens it on the web must not be told it is
  unfinished. It also pins `availabilityPlaces`, which is a port of a `useMemo`
  in `ProviderProfileForm.tsx` rather than of `profile-rules.ts` — see the rule
  in §5 on what a slot's place means, and why the app had it wrong.
- `test/space_test.dart` pins `parseYouTubeId` against the web's
  `lib/spaces.ts`, and the optimistic reaction arithmetic that runs before the
  server is asked.
- `test/query_test.dart` pins which statuses are still on the worklist, and
  the thread origin line.
- `test/auth_rules_test.dart` pins the one credential action there is. There
  is no password in Aspire91 — the email address is the login — so a mistake
  here locks somebody out of their own account.
- `test/entry_rules_test.dart` pins the entry form, which is the one place in
  the product that takes a child's name and date of birth: the consent check
  the API refuses an entry without, the age band a cap actually means (a
  category capped at 9 is the under-10s), and a birthday sent as a date with no
  time on it — an offset of a few hours is enough to move a child across an age
  band in transit.
- `test/event_test.dart` pins the two rules the database would otherwise
  report as a constraint violation: team size belongs only to a team, and a
  booking URL only to an event that sends entries elsewhere. Also the age
  calculation, which is about the day of the event and not today.
- `test/smoke_test.dart` imports both entry points so `flutter test` compiles
  the whole tree, and pins a colour to each of the ten taxonomy group keys. Use
  the keys the API actually sends — the list must match `_groupLabels` in
  `data/models/reference.dart`. It once listed shortened versions of them,
  which matched the `switch` and nothing else, so four groups rendered grey
  while the test called them covered. A test that agrees with the code instead
  of the contract will pass forever and prove nothing.

The API has its own suite: `cd api && npm test` (300 tests, 63 endpoints).

---

## 7. Still to do before auth works end to end

> Restated as an actionable item in §10.4, with what was verified about the
> current state of the manifest. This section is the detail behind it.

Auth is email OTP plus Google. **Only email OTP is wired.** Both need platform
work that does not exist yet:

- **Deep links.** `/auth/callback` is a web page; on mobile the OTP link and
  the Google round trip must return into the app. Needs
  `https://www.aspire91.com/.well-known/assetlinks.json` (Android) and an Apple
  App Site Association file, plus the app's redirect URL on the Supabase
  allowlist.
- **Native Google sign-in.** Use the platform SDK, not a webview — Google
  blocks OAuth in embedded webviews. Needs an Android OAuth client (release and
  debug SHA-1s) and an iOS client, both in the same Google Cloud project as the
  existing web client.

The Google consent screen currently reads *"to continue to
wpegcnmqygdaqrjhryit.supabase.co"*. That is a backend item — it needs a
Supabase custom domain — and nothing the app can fix.

---

## 8. Compliance, before either store review

> Restated as §10.5. This section is the detail behind it.

- `/privacy` and `/terms` are live on the website; link to them in-app. Both
  stores require it.
- **Play Data Safety and App Store privacy labels must match `/privacy`
  exactly** — including that a learner's age, level and the parent's free-text
  notes are sent to Google's Gemini for ranking.
- Event entry is the one place the product takes a child's name and date of
  birth. The consent wording shown in the app must match `ENTRY_CONSENT_VERSION`
  in `api/src/entries/dto/entry.dto.ts`; the API refuses the entry without it,
  so a Flutter client gets no further than the web form does.
- The listing screen uploads a coach's own photo. That is an adult's photo of
  themselves and is shown publicly — say so in the labels.
- Age rating: the app is used by adults, about children. Answer the
  questionnaires with that in mind.

---

## 9. What to build next

**Nothing, in screens.** This section used to say the coach app was blocked on
migration M6 and the seeker flavor on M1, M2 and M6. All of them have landed —
`M6: groups have a contract. Every migration is done.` — and every seeker slice
was built on top of them. Both flavors are feature-complete against the API.

What remains is platform work, store work, and shipping the repairs in §0.
§10 is the list, in the order it has to happen.

Twelve `/admin/*` routes stay on the web permanently and are out of scope.

---

## 10. What still needs implementing

Everything below is outstanding. Nothing here is a screen — both flavors are
feature-complete against the API. The order matters: 1 and 2 are live bugs for
people already holding the app, 3–5 gate the first store upload, 6 is cleanup.

### 1. Ship the fixes that are already in this repo — **do this first**

They are in this repo but not live, so they are doing nobody any good yet.

| Step | Where | Why |
|---|---|---|
| Deploy the API | `api/` | Carries the `/providers/me` fix. **Fixes the APK already on phones** — the installed app handles 404 correctly, so no rebuild is needed for this one |
| Run `db/2026-09-21-phase3v-provider-role-check.sql` | Supabase SQL editor | Gives `save_provider_profile()` the role check its seeker twin has had since phase 3S. Idempotent |
| Rebuild both APKs (§2) | `mobile/` | Picks up the repository hardening, so an empty body can never crash a screen again, **and** the availability venue fix, which is app-only |

**No backfill.** A handful of coaches who saved availability from an early APK
have a class format sitting in `providers.availability[].place` where a venue
belongs. That is known and deliberately left alone — the numbers are small, the
field is optional, and a format cannot be mapped to a venue anyway, because
knowing somebody teaches one-to-one does not say where. The picker shows the
stored value raw rather than blank, so a coach who opens their listing sees
there is something to re-pick, and the next save puts it right. Do not write a
migration for this.

Acceptance: sign in as a coach who has never saved a listing, open **More →
Your listing**. The form loads blank. Before the fix it said "Something went
wrong loading your listing" and the retry never worked. §0 has the full account.

### 2. Handle a 401 by refreshing, not by failing the screen

`ApiClient` reads `supabase.auth.currentSession?.accessToken` fresh on every
request, which is right — but `supabase_flutter` hands back a *stored* token on
a cold start and refreshes it in the background. A request that goes out in
that window gets a 401, and `GateScreen` renders "That session is no longer
valid." to somebody whose session is fine.

- In `data/api.dart`, on a 401: await one `supabase.auth.refreshSession()`,
  retry the request **once**, and only then surface the error.
- Guard against a stampede — five tabs mount at once (`HomeShell` builds all
  five children), so five requests can 401 together and must share one refresh.
- Sign the user out only if the refresh itself fails. That is the real
  "session is no longer valid".

This is the most likely remaining cause of an intermittent error on launch.

### 3. Release signing

`android/app/build.gradle.kts:47-50` still signs release builds with the
**debug** keystore, with a TODO saying so. Anything leaving the team needs a
real one first, and the upload key is permanent once Play has it.

- Generate an upload keystore, keep it out of the repo, read it from
  `key.properties` + an environment variable in CI.
- **Confirm the application ids before the first upload** — `com.aspire91.app`
  and `com.aspire91.app.coach`. §3 explains why this is the last moment.

### 4. Deep links and native Google sign-in

Still exactly as §7 describes — nothing has been wired. The two `<intent>`
blocks in `AndroidManifest.xml` are `<queries>` entries for `url_launcher`, not
deep-link `<intent-filter>`s; there are none.

- `https://www.aspire91.com/.well-known/assetlinks.json` (Android) and an Apple
  App Site Association file, both served from the live site.
- The app's redirect URL on the Supabase allowlist.
- An `<intent-filter>` per flavor for `/auth/callback`.
- Native Google sign-in through the platform SDK — **not** a webview, which
  Google blocks for OAuth. Needs an Android OAuth client with release *and*
  debug SHA-1s, plus an iOS client, all in the same Google Cloud project as the
  existing web client.

Email OTP works today and does not need any of this, so the app is usable
without it. Google sign-in is not.

### 5. iOS, and the store paperwork

- **iOS flavors do not exist.** `ios/Runner.xcodeproj/project.pbxproj` has no
  `Debug-seeker` / `Release-provider` configurations — §3 has the exact steps,
  and they need a Mac.
- **Link `/privacy` and `/terms` in-app.** Both stores require it and neither
  is reachable from any screen today; `Env.siteUrl` is already there to build
  the URLs from. Settings is the obvious home.
- Play Data Safety and App Store privacy labels must match `/privacy` exactly —
  including that a learner's age, level and the parent's free-text notes go to
  Gemini for ranking. §8 has the rest.

### 6. `ListingRepository.save()` returns a type it does not have

`PUT /api/v1/providers/me` answers `SavedProfileDto` — `{id, approved,
isSuspended}` — but `save()` is typed `Future<Listing>` and runs the response
through `Listing.fromJson`. Every other field comes back as its default, so it
returns a near-blank `Listing` that claims to be the saved one.

Harmless today only because `ListingScreen._save()` discards the result and
invalidates `myListingProvider` instead. The next person to trust the return
value gets a blank listing with no warning. Give it a `SavedProfile` model and
return that. `SeekerRepository.save()` does not have this problem —
`PUT /seekers/me` really does answer the whole profile.

### Before you call any of it done

```bash
cd mobile && flutter analyze && flutter test   # 184 tests
cd api    && npm test                          # 300 tests, 63 endpoints
```

If you change an endpoint's shape, `cd api && npm run spec` regenerates
`api/openapi.json`, and `npm run gen:api` at the repo root regenerates the
web's `lib/api/schema.d.ts` from it. The spec is the contract — §0 is what it
costs when the contract does not describe a state that actually happens.
