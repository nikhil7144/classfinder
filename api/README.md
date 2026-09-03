# ClassFinder API

The contract the web app and the Flutter app both speak.

```bash
cp .env.example .env      # same Supabase project as the web app
npm install
npm run start:dev         # http://localhost:4000/api/v1
                          # docs at http://localhost:4000/api/docs
npm test
npm run spec              # regenerate openapi.json
```

## Why this exists

Until now every client talked to Supabase directly, and every rule lived in
`db/` as an RLS policy or a `security definer` function. That works — and the
mobile app was going to inherit it for free — but it left no place to put a
test, no typed contract for a second client to build against, and no seam for
logic that is judgement rather than permission.

This service adds those three things. **It does not replace RLS.**

## The rule

> Postgres decides **who may see what**. This API decides **what shape it
> arrives in and which of it is worth showing**.

Concretely:

- `SupabaseService` never holds the service role key. Every authenticated
  request runs as the caller, so all 74 policies in `db/` still apply. A
  forgotten check in a controller returns too little; it cannot leak.
- Writes that exist because RLS cannot restrict *which columns* an update
  touches — `respond_to_approach`, `set_reaction`, `resolve_report` and the
  rest — stay `security definer` functions. Reimplementing them here would
  hand the client the columns those functions exist to withhold.
- Read functions are pure queries and may migrate here whenever it is
  convenient. `my_space_feed` and `public_city_feed` are the first.

## Two things stay direct to Supabase

Not everything belongs behind this API, and pretending otherwise costs more
than it buys:

- **Realtime.** Thread subscriptions are websockets with RLS applied per
  connection. Proxying them would mean rebuilding that for no gain — and it is
  the reason RLS can never be switched off, whatever else moves here.
- **File bytes.** Uploads go straight to Storage against a signed URL; images
  are served from the CDN. Forwarding 5 MB through this service to hand it to
  Supabase is waste.

## The contract

`openapi.json` is generated from the same DTOs that validate at runtime, by
the same configuration that serves the traffic — `configureApp()` is shared by
`main.ts` and the spec emitter, because a spec built from different settings
describes routes that do not exist.

It is committed on purpose. CI should run `npm run spec` and fail on a diff,
so a controller cannot change shape without the contract moving with it.

Generate clients from it rather than hand-writing them:

```bash
# Dart, for the Flutter app
openapi-generator generate -i openapi.json -g dart-dio -o ../mobile/lib/api

# TypeScript, for the web app
openapi-generator generate -i openapi.json -g typescript-fetch -o ../lib/api
```

## Secrets

`GOOGLE_API_KEY` lives here and nowhere else. It is the one thing in the
product that genuinely cannot be given to a browser or a phone, and holding it
is why the two suggestion endpoints are here rather than called directly. It
is not a service role key and does not weaken the rule above: those endpoints
still query Postgres as the caller, and their two writes — metering and the
suggestion cache — go through definer functions added in phase3d.

## Deploying

**On Vercel**, as its own project with Root Directory `api`. `vercel.json`
deliberately does *not* run `nest build`: @vercel/node compiles `api/index.ts`
and everything it imports on its own, so the Nest build would produce a dist/
nothing reads — and Vercel then fails the deploy looking for static output
that a server has no reason to emit.

It insists on a non-empty output directory either way, so `public/` holds one
page saying this host is the API and pointing at the docs. Vercel checks the
filesystem before rewrites, so `/` serves that page and every other path falls
through to the function — which is better than a JSON 404 for anyone who
opens the bare hostname.

Environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_API_KEY`,
`CORS_ORIGINS`. Not `PORT` — nothing listens in the serverless path.

**Anywhere else**, `Dockerfile` builds a two-stage image that runs `node dist/main` as a non-root
user, so any container host will take it. Set `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `GOOGLE_API_KEY` and `CORS_ORIGINS`; most platforms
inject `PORT` themselves.

`GET /api/v1/health` is the readiness probe. It is deliberately shallow — it
reports that the process is serving, not that Postgres is reachable, because a
check that fails on a database blip pulls the whole service out of rotation
over something a restart cannot fix.

Then point the web app at it: **`NEXT_PUBLIC_API_URL`** in the site's
environment. Without it the browser looks for the API on the visitor's own
machine, and because every call here fails soft, the homepage feed and both
suggestion panels come back empty rather than erroring. Quiet, and easy to
miss.

## Status

Two modules, five endpoints, twenty-two tests. The rest of the app still talks
to Supabase directly, and that is fine — surfaces move over as they are
touched. What must not happen is a surface reading *both* ways at once.

Nothing user-facing is left that a mobile client cannot reach.
