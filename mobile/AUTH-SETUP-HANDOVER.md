# Mobile auth — what the backend/ops side still needs to do

For whoever has access to Google Cloud Console, the Supabase dashboard, and
the production deploy pipeline for `api/`. The Flutter app's own code is
already done — see `mobile/README.md` §7/§10.4 for the full background. This
file is just the action list and the exact values to use.

Two independent things are blocked here. Neither needs the other.

---

## 1. Google sign-in (native, not a webview)

The app uses the platform's own Google Sign-In (Play Services on Android),
not a browser — Google blocks OAuth inside webviews. This needs three things,
all in **the same Google Cloud project the website's existing Google sign-in
already uses**.

### 1a. Send us the existing Web OAuth client id

Find it in either place (same value either way):

- **Supabase Dashboard** → Authentication → Providers → Google → **Client ID** field, or
- **Google Cloud Console** → APIs & Services → Credentials → the OAuth 2.0 Client ID of type **Web application**

Send that value back. It gets set as `GOOGLE_WEB_CLIENT_ID` when building the
app — nothing else needed on your end for this part.

**Do not send the Client Secret.** Only the Client ID is used, and only on
the client side (Supabase's server side already has the secret from when the
web app's Google sign-in was set up).

### 1b. Register two new Android OAuth clients

In the same Google Cloud project → Credentials → Create Credentials → OAuth
client ID → Android. Create **two** — one per app:

| Package name | SHA-1 (release) | SHA-1 (debug) |
|---|---|---|
| `com.aspire91.app` | `31:A8:52:E5:2D:74:A4:82:4F:33:20:25:61:F4:D6:C0:94:60:B4:64` | `82:C1:F0:5B:E5:70:85:41:4D:47:32:19:26:EE:36:E3:33:91:D0:D0` |
| `com.aspire91.app.coach` | `31:A8:52:E5:2D:74:A4:82:4F:33:20:25:61:F4:D6:C0:94:60:B4:64` | `82:C1:F0:5B:E5:70:85:41:4D:47:32:19:26:EE:36:E3:33:91:D0:D0` |

Both flavors share one keystore, hence the identical SHA-1s in both rows —
just the package name differs. Each Android OAuth client entry only accepts
one SHA-1, so each package name needs **two** entries (release + debug), or
one Google Cloud UI flow that lets you add both fingerprints under one
client — either way, both fingerprints must be present for both package
names.

Nothing comes back from this step into the app. Google just needs to
recognise these apps as allowed to ask for sign-in.

> **If the release keystore is ever regenerated**, its SHA-1 changes and
> these entries must be updated — otherwise every existing install still
> works but a build signed with the *new* key will fail Google sign-in until
> its fingerprint is added too.

### 1c. Add two redirect URLs to Supabase's allowlist

**Supabase Dashboard** → Authentication → URL Configuration → **Redirect URLs** → add both:

```
com.aspire91.app://login-callback
com.aspire91.app.coach://login-callback
```

Supabase silently discards a redirect that isn't on this list — the app
would appear to hang after Google's account picker with nothing visibly
wrong, so this step is easy to think is done when it isn't. Please add both,
not just one.

### What you do *not* need to do

- **No `assetlinks.json`.** The app uses a custom URL scheme
  (`com.aspire91.app://…`), not an HTTPS universal/app link, specifically so
  this file is unnecessary. Skip it.
- **No Apple App Site Association file**, for the same reason.
- **No iOS Google OAuth client yet** — iOS flavors don't exist in this repo
  yet (needs a Mac to set up), so there's nothing for an iOS client to attach
  to. Ignore iOS for now.

### How to tell it's working

Once 1a–1c are done and we've rebuilt with the real `GOOGLE_WEB_CLIENT_ID`, a
"Continue with Google" button appears on the sign-in screen (it's invisible
until configured — no broken button in the meantime). Tapping it should show
the native Google account picker and sign straight in, no browser tab.

---

## 2. Deploy the API + run one migration

Independent of the above — this is a live bug fix already written and
committed, just not shipped yet.

1. **Deploy `api/`** to production. Fixes `/api/v1/providers/me` answering an
   empty `200` instead of a `404` for a coach with no listing yet — currently
   locks out every new coach signup from the one screen that creates their
   listing. See `mobile/README.md` §0 for the full account of the bug.
2. **Run `db/2026-09-21-phase3v-provider-role-check.sql`** in the Supabase
   SQL editor. Idempotent — safe to run even if unsure whether it already ran.

Neither step touches the mobile app. Both are needed before the app's own
already-shipped fixes for these two issues have any effect.

---

## Quick checklist

- [ ] Google Web OAuth client id sent back
- [ ] Android OAuth client registered for `com.aspire91.app` (both SHA-1s)
- [ ] Android OAuth client registered for `com.aspire91.app.coach` (both SHA-1s)
- [ ] `com.aspire91.app://login-callback` added to Supabase redirect URLs
- [ ] `com.aspire91.app.coach://login-callback` added to Supabase redirect URLs
- [ ] `api/` deployed to production
- [ ] `db/2026-09-21-phase3v-provider-role-check.sql` run in Supabase SQL editor
