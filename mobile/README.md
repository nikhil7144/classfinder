# Aspire91 Mobile — developer handover

Flutter, Android + iOS, **one codebase, two flavors**: `seeker` (parents) and
`provider` (coaches, academies, event organisers).

Read `../MOBILE-PLAN.md` first — it explains why two flavors, what every one of
the 50 web screens becomes, and, most importantly, **which backend work has to
land before most screens can be built.** This file is the setup guide.

---

## Read this before you start

**Nothing here has been compiled.** It was written on a machine with no Flutter,
Dart or Gradle installed. The Dart is structured and commented, and the palette
is copied from the web's stylesheet, but:

- dependency versions in `pubspec.yaml` are unverified — expect to bump them,
- `android/` and `ios/` **do not exist yet**; you generate them in step 2,
- there are no product screens, only a placeholder that proves the wiring.

Treat it as a starting skeleton and a set of decisions already made, not as a
running app. Your first commit will probably be "make it build".

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Flutter SDK | 3.24+ (Dart 3.4+) |
| Android Studio | Ladybug or newer, with the Flutter and Dart plugins |
| JDK | 17 |
| Xcode | 15+ — macOS only, for iOS |
| Node.js | 20+ — only if you regenerate the API client |

```bash
flutter doctor        # must be clean for android + ios before you continue
```

---

## 2. Generate the platform folders

The repo carries the Dart source only. Platform folders are machine-generated
and are not checked in until you create them:

```bash
cd mobile
flutter create --platforms=android,ios --org com.trustcabbage --project-name aspire91 .
flutter pub get
```

`flutter create` will not overwrite `lib/` or `pubspec.yaml` that already
exist. If it complains about `pubspec.yaml`, keep ours — it has the
dependencies.

---

## 3. Android flavors

Add to `android/app/build.gradle.kts`, inside `android { }`:

```kotlin
flavorDimensions += "audience"

productFlavors {
    create("seeker") {
        dimension = "audience"
        // The base id. Parents' app.
        resValue("string", "app_name", "Aspire91")
    }
    create("provider") {
        dimension = "audience"
        applicationIdSuffix = ".coach"
        resValue("string", "app_name", "Aspire91 for Coaches")
    }
}
```

<details>
<summary>Groovy equivalent, if your Flutter version still generates build.gradle</summary>

```groovy
flavorDimensions "audience"
productFlavors {
    seeker   { dimension "audience"; resValue "string", "app_name", "Aspire91" }
    provider { dimension "audience"; applicationIdSuffix ".coach"
               resValue "string", "app_name", "Aspire91 for Coaches" }
}
```
</details>

Then in `android/app/src/main/AndroidManifest.xml`, change the `<application>`
label so each flavor picks up its own name:

```xml
android:label="@string/app_name"
```

Resulting application ids:

| Flavor | Application id |
|---|---|
| seeker | `com.trustcabbage.aspire91` |
| provider | `com.trustcabbage.aspire91.coach` |

---

## 4. iOS flavors

Xcode calls them schemes. In `ios/Runner.xcodeproj`:

1. Duplicate the three build configurations (`Debug`, `Release`, `Profile`)
   into `Debug-seeker`, `Release-seeker`, `Profile-seeker`, and the same for
   `provider`.
2. Create two schemes, `seeker` and `provider`, each pointing at its own
   configurations.
3. Set `PRODUCT_BUNDLE_IDENTIFIER` per configuration:
   `com.trustcabbage.aspire91` and `com.trustcabbage.aspire91.coach`.
4. Set `PRODUCT_NAME` / `CFBundleDisplayName` to `Aspire91` and
   `Aspire91 for Coaches`.

---

## 5. Configuration

No `.env` file ships with the app. Everything comes in through `--dart-define`
so nothing config-shaped is readable in the bundle. `Env.assertConfigured()`
throws a named error at startup if any is missing.

| Define | Value |
|---|---|
| `SUPABASE_URL` | `https://wpegcnmqygdaqrjhryit.supabase.co` |
| `SUPABASE_ANON_KEY` | ask — it is the same anon key the web uses, and it is public by design |
| `API_BASE_URL` | `https://api.aspire91.com` |

The **anon key is not a secret** — it is already in the web bundle, and every
request is authorised by RLS as the calling user. Do not put the service role
key in the app; it does not exist on the client and must never be added.

### Run

```bash
flutter run --flavor seeker -t lib/main_seeker.dart \
  --dart-define=SUPABASE_URL=https://wpegcnmqygdaqrjhryit.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon key> \
  --dart-define=API_BASE_URL=https://api.aspire91.com
```

Swap `seeker` → `provider` and `main_seeker.dart` → `main_provider.dart` for
the other app.

### Android Studio

Create two run configurations (Run → Edit Configurations → **+** → Flutter):

| Field | Seeker | Provider |
|---|---|---|
| Dart entrypoint | `lib/main_seeker.dart` | `lib/main_provider.dart` |
| Build flavor | `seeker` | `provider` |
| Additional args | the three `--dart-define`s above | same |

Put both under `.idea/runConfigurations/` and commit them so nobody has to
retype the defines.

---

## 6. The typed API client

`api/openapi.json` is generated from the same DTOs that validate requests at
runtime, so the Dart client is generated too — never hand-written. Same rule as
`lib/api/schema.d.ts` on the web.

```bash
npm i -g @openapitools/openapi-generator-cli
./tool/gen_api_client.sh
dart run build_runner build --delete-conflicting-outputs
```

Output lands in `lib/src/data/generated/`, which is **gitignored on purpose**.
Regenerate after any API change rather than editing it.

---

## 7. Architecture rules that are not negotiable

These come from `../PLAN.md` and exist for reasons that already bit this
project once.

### Two doors, and only two, go straight to Supabase

`supabase_flutter` is for **auth, realtime and Storage**. That is it.

- **Realtime** — thread subscriptions are websockets with RLS applied per
  connection. Proxying them through the API rebuilds that for no gain.
- **File bytes** — uploads go to Storage against a signed URL and images serve
  from the CDN. Never forward 5 MB through the API.

Everything else goes through `api.aspire91.com`.

### Do not read unmigrated tables or RPCs from the app

You will notice the web still calls 33 SQL functions and 22 tables directly,
and that `supabase_flutter` would happily let you do the same. **Don't.** RLS
would keep it safe, but it would make this the second client guessing at the
schema — which is precisely what the API tier was built to stop, and the copies
drift. If a screen needs a surface that is not on the API yet, the API work
comes first. The list and the order are in `MOBILE-PLAN.md` §3.

> A **surface** reads one way or the other, never both. Migrate a whole surface
> or none of it.

### One account is one role

`profiles.role` is a single column and both party tables are unique on
`user_id`. `switch_role()` refuses once a profile is complete and **deletes**
the row for the role being left. So:

- the seeker app never asks "are you a coach?" — the flavor decides,
- an account whose role does not match the flavor must be told plainly and
  pointed at the other app. **Do not route them to a role chooser**; that
  offers `switch_role`, which would destroy a completed listing.

### Show the API's own sentence

The service answers a refusal with something a reader can act on — *"Finish
your coach or company profile before creating an event"*. Use `apiMessage()`
in `lib/src/data/api.dart` rather than replacing it with "Something went
wrong". The web shipped that bug and it was worth fixing.

---

## 8. Still to do before auth works end to end

Auth is email OTP plus Google. Both need platform work that does not exist yet:

- **Deep links.** `/auth/callback` is a web page; on mobile the OTP link and
  the Google round trip must return into the app. Needs
  `https://www.aspire91.com/.well-known/assetlinks.json` (Android) and an Apple
  App Site Association file, plus the app's redirect URL added to the Supabase
  allowlist.
- **Native Google sign-in.** Use the platform SDK rather than a webview —
  Google blocks OAuth in embedded webviews. You will need an Android OAuth
  client (with the release and debug SHA-1s) and an iOS client, both in the
  same Google Cloud project as the existing web client.

Note the Google consent screen currently reads *"to continue to
wpegcnmqygdaqrjhryit.supabase.co"*. That is a known open item on the backend
side, not something the app can fix.

---

## 9. Compliance, before either store review

- `/privacy` and `/terms` are live on the website; link to them in-app. Both
  stores require it.
- **Play Data Safety and App Store privacy labels must match `/privacy`
  exactly** — including that a learner's age, level and the parent's free-text
  notes are sent to Google's Gemini for ranking.
- Event entry is the one place the product takes a child's name and date of
  birth. The consent wording shown in the app must match
  `ENTRY_CONSENT_VERSION` in `api/src/entries/dto/entry.dto.ts`, and the API
  refuses the entry without it — so a Flutter client gets no further than the
  web form does.
- Age rating: the app is used by adults about children. Answer the
  questionnaires with that in mind.

---

## 10. What to build, in what order

`MOBILE-PLAN.md` §3 and §4. In short, the seeker app needs backend migrations
M1–M4 (search, coach profile, Spaces, chat) before it is worth shipping; the
provider app needs M5, M4, M3, M2. Events, entries, queries, suggestions and
the reference data are already on the API and can be built today.

Twelve `/admin/*` routes stay on the web permanently and are out of scope.

## Layout

```
mobile/
  lib/
    main_seeker.dart          flavor entry point
    main_provider.dart        flavor entry point
    src/
      app.dart                shared MaterialApp shell
      flavor.dart             Flavor enum, role mapping
      config/env.dart         --dart-define reader, startup assertion
      theme/theme.dart        Charcoal & Coral, ported from globals.css
      data/supabase.dart      auth, realtime, Storage — nothing else
      data/api.dart           Dio + bearer + apiMessage()
      data/generated/         typed client (gitignored, generated)
      features/               one folder per screen, as you add them
  tool/gen_api_client.sh
```
