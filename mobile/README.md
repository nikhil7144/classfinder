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

**The provider (coach) app is built. The seeker app has started** — see
`../SEEKER-SCREENS.md`, which inventories all twenty of its web routes and
carries the build order.

What runs today, on the provider flavor:

| Screen | Files | Status |
|---|---|---|
| Sign in — email OTP | `screens/auth/sign_in_screen.dart` | built |
| Choose a role | `screens/auth/choose_role_screen.dart` | built |
| Role gate | `screens/shell/gate_screen.dart` | built |
| Students — the demand feed, and the one message | `screens/students/` | built |
| Messages — inbox and conversation, live | `screens/threads/` | built |
| Listing — the whole coach profile | `screens/listing/` | built |
| Space — posts, photos, video, reactions | `screens/space/` | built |
| Queries — leads, call booking, dialling | `screens/queries/` | built |
| Events — create, publish, categories | `screens/events/` | built |
| Register — entries, payments, withdrawals | `screens/events/` | built |

`flutter analyze` is clean and `flutter test` passes (119 tests). It has **never
been built into an APK** — the machine it was written on has no Android SDK, so
`flutter build` could not run. `test/smoke_test.dart` imports both entry points
specifically so the whole tree is compiled by `flutter test`; that is as close
to proof as this repo can get on its own. Expect your first job to be `flutter
build apk` and whatever falls out of it.

Google sign-in and deep links are **not wired** — see §7.

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
the other app. The seeker flavor builds, signs in, and has its profile screen;
the rest is in `../SEEKER-SCREENS.md`.

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
  test/                       119 tests, no device needed
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

### The listing saves whole, never in parts

`save_provider_profile()` replaces branches and service areas wholesale, in one
transaction. This exists because the web did it as four round trips with six
unchecked results: the delete ran before the insert, so a failure in between
left a coach **discoverable nowhere** and told them it had saved. Do not add a
partial-save or autosave path to `ListingScreen`.

---

## 6. Tests

```bash
flutter test          # 119 tests, no device or SDK needed
```

- `test/listing_rules_test.dart` pins the completeness rules against the web's
  `lib/profile-rules.ts`. If you change one, change both — a coach who
  completes a listing in the app and opens it on the web must not be told it is
  unfinished.
- `test/space_test.dart` pins `parseYouTubeId` against the web's
  `lib/spaces.ts`, and the optimistic reaction arithmetic that runs before the
  server is asked.
- `test/query_test.dart` pins which statuses are still on the worklist, and
  the thread origin line.
- `test/event_test.dart` pins the two rules the database would otherwise
  report as a constraint violation: team size belongs only to a team, and a
  booking URL only to an event that sends entries elsewhere. Also the age
  calculation, which is about the day of the event and not today.
- `test/smoke_test.dart` imports both entry points so `flutter test` compiles
  the whole tree.

The API has its own suite: `cd api && npm test` (211 tests, 56 endpoints).

---

## 7. Still to do before auth works end to end

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

In order, for the provider app:

**The provider app is feature-complete against what the API exposes.** What is
left is either blocked or a different app:

1. **Groups** — `/dashboard/groups`. **Blocked**: groups is migration M6 and
   has not happened, so there is no API to build against.
2. **The seeker flavor** — search, coach profiles, groups, enquiries. Blocked
   on M1, M2 and M6; threads and Spaces it can reuse as they are.

So the next real work is backend, not Flutter.

Twelve `/admin/*` routes stay on the web permanently and are out of scope.
