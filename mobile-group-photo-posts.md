# Mobile: family group photo posts

Status: ready to build · Written 2026-10-26 · Web reference: `components/groups/GroupPosts.tsx`
(web commits `029f326` Phase 3Y and `2267eff` media buckets)

This brief is for the agent building the feature in the Flutter app
(`mobile/`). Read it all before starting. Where it names a file, open that
file. The existing code is the style guide.

## What the feature is

Families in a group can post photos from their sessions on the group's
**Posts** feed. Every post starts as **members only**. Each author can choose
to show their own photo on the group's public page, and can turn that off
again.

The web has had this since Phase 3Y. The app has none of it: `GroupScreen`
shows the group overview and "Coaches who pitched", and nothing else.

## What the web has that the app doesn't

Everything below shipped on the web in Phase 3Y (2026-10-18) and Phase 3Z
(2026-10-25). The app has none of it.

| Feature | Web | API | In this brief? |
|---|---|---|---|
| Posts feed on the group page | `GroupPosts.tsx` | `GET /api/v1/groups/:id/posts` | **Yes** |
| Upload a photo to the `group-media` bucket | `GroupPosts.tsx` | direct to Supabase Storage | **Yes** |
| Create a photo post | `GroupPosts.tsx` | `POST /api/v1/groups/:id/posts` | **Yes** |
| Author shows / hides their own post on the public page | `GroupPosts.tsx` | `PATCH /api/v1/groups/posts/:postId/visibility` | **Yes** |
| Author deletes their own post | not on web either | **endpoint missing** | **Yes** (API change 2) |
| Creator publishes the group (headline + about) | `GroupPublish.tsx` | `PATCH /api/v1/groups/:id/publish` | Optional, last section |
| Public group page `/groups/public/:id` | `app/groups/public/[id]` | `GET /api/v1/groups/:id/public` | No. Web/SEO only |
| Browse public groups by city and area `/groups/in/...` | `app/groups/in/...` | `GET /api/v1/groups/discover` | No. Web/SEO only |
| "Groups they train" on a coach's profile | `app/provider/[id]` | `GET /api/v1/groups/by-coach/:providerId` | No. Possible follow-up |

The app already writes to the `space-media` bucket for coach Space photos. The
Phase 3Z migration created that bucket under the right name. Coach photo posts
in the app failed with "Bucket not found" before the migration and should now
work without any app change. Check this once while testing.

## Rules the app must keep

These are product decisions. The API and the database row-level security
(RLS) enforce them. The app must not try to work around them.

1. **Every post starts as members only.** A parent's photo of their child
   stays inside the group unless that parent opens it up. The app never sends
   a visibility on create.
2. **Only the author changes visibility. The group's creator cannot.** A
   creator who could promote any post could put another family's child on a
   public page.
3. **Only members of a live group can post.** Live means `isActive`: open,
   not expired, two or more families. Otherwise the API returns 403.
4. **Photo bytes go straight to Storage, never through the API.** The API
   receives only the public URL. The Space composer works the same way.
5. **Photos only.** The API also accepts `kind: "video"` (YouTube), but the
   web offers photos only. Match the web.
6. **Public read never names families.** Don't show author names to anyone
   outside the group.

## API contract as it is today

Base path `/api/v1`. Bearer auth via the app's existing `ApiClient`. Every
call needs a signed-in user.

### `GET /groups/:id/posts` → `GroupPost[]`

A member gets every non-hidden post, at most 60. They are sorted by
`showOrder` ascending (nulls last), then newest first. A non-member gets only
public posts, and only while the group is published.

```json
{
  "id": "uuid",
  "kind": "photo",              // "photo" | "video"
  "body": "First Sunday session…", // nullable, ≤ 2000 chars
  "imageUrl": "https://…/storage/v1/object/public/group-media/<uid>/<groupId>/<name>.jpg",
  "youtubeId": null,
  "visibility": "members",      // "members" | "public"
  "showOrder": null,            // creator curation, usually null
  "createdAt": "2026-10-25T06:12:00Z"
}
```

### `POST /groups/:id/posts` → `GroupPost`

```json
{ "kind": "photo", "body": "optional caption or null", "imageUrl": "<public URL from Storage>" }
```

- 400: `photo` without `imageUrl`, a caption over 2000 characters, or a URL
  that isn't `http(s)` or is over 1000 characters
- 403: "Only members of the group can post to it." Either not a member or
  the group is not live.

### `PATCH /groups/posts/:postId/visibility` → `GroupPost`

```json
{ "visibility": "public" }   // or "members"
```

- 403: "Only the person who posted it can change that."

Error bodies follow the shape the app's `ApiException` already parses. Show
`e.message` as it comes back.

## API changes to make first

These go in `api/src/groups/` (NestJS). Make them before or alongside the app
work. After you change a DTO, regenerate `api/openapi.json` and the web's
`lib/api/schema.d.ts` the same way commit `03964c6` did.

### 1. Add `isMine` to `GroupPostDto` (required)

At the moment nothing tells the client who wrote a post. The web works around
this by showing the visibility toggle on **every** post to every member and
letting the API return 403. That is a web bug. In the app it would show a
menu that fails for most posts.

- `dto/group.dto.ts`: add `@ApiProperty() isMine!: boolean;` to `GroupPostDto`.
- `groups.service.ts`: in `posts()` (member branch), `addPost()` and
  `setPostVisibility()`, add `author_id` to the `.select(...)` and set
  `isMine: r.author_id === caller.id`. In the signed-out branch of `posts()`,
  always set `isMine: false`.
- These four methods now repeat the same row mapping. Pull it into one
  `toPostDto(row, callerId)` helper.
- Web fix in `components/groups/GroupPosts.tsx`: change `{me && isMember && (`
  around the toggle to `{p.isMine && (`.

Don't add the author's name. If members later need "who posted this", add a
first-name-only `authorName` for members and keep it null on public reads.

### 2. `DELETE /groups/posts/:postId` (required)

The RLS policy `author deletes own post` already exists. Only the endpoint is
missing.

- Controller: `@Delete("posts/:postId")`, `@HttpCode(204)`. Put it next to
  the visibility route.
- Service: delete as the caller (`this.supabase.asUser(caller.accessToken)`)
  with `.eq("id", postId).select("image_url").maybeSingle()`. If no row comes
  back, throw `ForbiddenException("Only the person who posted it can delete it.")`.
- Then, as a best effort, remove the file. It is stored at the part of
  `image_url` after `/group-media/`. Call
  `storage.from("group-media").remove([path])` as the caller; the
  `owner deletes own group media` policy allows it. Log any failure but don't
  throw. An orphaned file is a cleanup problem, not a user error.

### 3. Return `publishedAt` on the caller's own groups (only for the optional publish part)

`GET /groups` returns `GroupDto`, which has no `publishedAt`,
`publicHeadline` or `publicAbout`. Add all three if you build the publish
action. Skip this if you don't.

## App work

All paths are under `mobile/lib/src/`. Use the same Riverpod, `ApiClient`,
`ApiException`, `A91` theme tokens, skeleton and states widgets as the
neighbouring files.

### Model: `data/models/group.dart`

Add a `GroupPost` class with `id`, `kind`, `body`, `imageUrl`, `youtubeId`,
`visibility`, `showOrder`, `createdAt` (`DateTime`), `isMine` (default
`false` when it is missing, so the app keeps working against an older API),
and `bool get isPublic => visibility == 'public'`. Write `fromJson` as
defensively as the other classes in the file.

### Repository: `data/repositories/groups_repository.dart`

```dart
Future<List<GroupPost>> posts(String groupId);            // GET   /api/v1/groups/$groupId/posts
Future<GroupPost> addPost(String groupId, {String? body, required String imageUrl});
                                                          // POST  body: {kind: 'photo', body, imageUrl}
Future<GroupPost> setPostVisibility(String postId, {required bool public});
                                                          // PATCH /api/v1/groups/posts/$postId/visibility
Future<void> deletePost(String postId);                   // DELETE /api/v1/groups/posts/$postId
Future<String> uploadImage(File file, {required String groupId});
```

Model `uploadImage` on `SpacesRepository.uploadImage`
(`data/repositories/spaces_repository.dart:97`). Make these changes:

- Bucket: `group-media`, not `space-media`.
- Path: `'$userId/$groupId/$name.$ext'`, where `userId` is
  `supabase.auth.currentUser!.id`. **The first folder must be the uploader's
  own user id.** The bucket's insert policy checks only that, so any other
  path fails with a policy error. If `currentUser` is null, throw
  `ApiException('Log in again.')`.
- Keep the 5 MB check before uploading (`maxImageBytes`) and the same message:
  "That photo is over 5 MB. Try a smaller one."
- The bucket allows only JPEG, PNG, WebP and AVIF. `ImagePicker` with
  `imageQuality` set re-encodes to JPEG on both platforms, so HEIC from an
  iPhone is fine as long as the composer always passes `imageQuality`. If the
  extension is anything other than `jpg`/`jpeg`/`png`/`webp`/`avif`, use
  `jpg` and pass `FileOptions(contentType: 'image/jpeg')`.
- Wrap `StorageException` as `ApiException('That photo could not be uploaded. ${e.message}')`.

### Provider: `providers.dart`

Put this next to `groupPitchesProvider`:

```dart
final groupPostsProvider = FutureProvider.family<List<GroupPost>, String>(
  (ref, groupId) => ref.watch(groupsRepositoryProvider).posts(groupId),
);
```

### Screen: `screens/groups/group_screen.dart`

Add a **Posts** section below "Coaches who pitched". Use a section, not a
tab. The screen's doc comment explains that tabs would hide the pitches.
Update that comment to say there are now three parts.

The app opens `GroupScreen` only from "My groups" (`groups_screen.dart:133`),
so the viewer is always a member. No membership check is needed. If a
non-member entry point is added later, it needs one.

- **Header row:** "Posts" title and, on the right, a **Post a photo** button.
  Show the button only when `_g.isActive`. When the group isn't live, show one
  muted line instead, such as "You can post once the group is live." or
  "This group is closed." Use the reason `_g` already gives elsewhere on the
  screen.
- **Each post card:** the image (`Image.network`, `BoxFit.cover`, full width,
  about 200 px tall, rounded like other cards, with a loading placeholder and
  a broken-image fallback), the caption if there is one, and a badge:
  **Members only** (neutral) or **On the group page** (success colour).
- **Own posts (`isMine`):** an overflow menu (⋮) with *Show on group page* /
  *Make it members only* and *Delete*. Before *Show on group page* takes
  effect, show a one-line confirmation: "Anyone can see this photo on your
  group's public page once the group is published." Confirm before deleting.
  Other people's posts get no menu.
- **States:** skeleton while loading. Error with retry, the same as the
  pitches section. Empty: "Nothing posted yet. Photos from your sessions go
  here."
- **Refresh:** the screen's `RefreshIndicator` also invalidates
  `groupPostsProvider(_g.id)`. So do toggle, delete and returning from the
  composer.
- Tapping an image opens it full screen (`InteractiveViewer`). This is nice
  to have.

### Screen: `screens/groups/group_post_composer_screen.dart` (new)

Base it on `screens/space/composer_screen.dart`, with photo mode only:

- Camera / gallery bottom sheet. Use `ImagePicker` with `maxWidth: 1600`,
  `maxHeight: 1600`, `imageQuality: 85`. `image_picker` is already in
  `pubspec.yaml`.
- Upload **as soon as the photo is picked**, not when *Post* is pressed. Show
  progress over the preview. If the upload fails, show the error, keep the
  caption and allow a retry or another photo.
- Caption field: hint "Say something about it", `maxLength: 2000`. That is
  the database limit, not the 4000 the Space composer uses.
- Footer text: "Only the families in this group see it, unless you choose to
  show it on your group's page."
- *Post* stays disabled until an upload has finished. On success, invalidate
  `groupPostsProvider(groupId)`, pop, and show a snackbar: "Posted to your
  group."
- On a 403, show the API's message as it comes back. Most likely the group
  closed while the composer was open.

### Optional: publish the group

This can be a separate release. It needs API change 3. For the creator only,
and only when `_g.isActive`, add a **Show on Aspire91** action to the
overview card. It opens a short form: headline up to 140 characters, about up
to 2000 characters. Submitting calls `PATCH /api/v1/groups/:id/publish` with
`{ "published": true, "publicHeadline": "…", "publicAbout": "…" }`. An
**Unpublish** action sends `{ "published": false }`. Take the wording and
rules from `components/groups/GroupPublish.tsx`. A group stops being public by
itself once it closes, expires or drops below two families.

## Out of scope

- Video posts. The API supports them, but the web doesn't offer them.
- Creator ordering of posts (`showOrder`). There is no endpoint for it.
- Reporting a group post. `is_hidden` exists, but there is no report flow
  yet.
- Editing a caption after posting.
- Private storage with signed URLs. Members-only photos sit in a public bucket
  at addresses nobody can guess, and the privacy page says so. Moving to
  signed URLs would change the web, the app and the `group_posts_image_is_link`
  check together.

## Before starting

- [ ] `db/2026-10-25-phase3z-media-buckets.sql` has been run in Supabase.
      `group-media` and `space-media` appear under Storage, each with 4
      policies.
- [ ] API changes 1 and 2 are deployed, or running locally against the app.

## Testing checklist

- [ ] Member of a live group: post from the camera and from the gallery. The
      post appears at the top as *Members only*.
- [ ] A second member's account sees the post, with no menu on it.
- [ ] Photo still over 5 MB after compression: refused before upload, with
      the clear message.
- [ ] Upload fails (airplane mode): caption kept, error shown, retry works.
- [ ] Own post set to *On the group page*: once the group is published, it
      shows on `/groups/public/:id` on the web. Setting it back removes it.
- [ ] Group closed or expired: no post button, and the reason is shown.
- [ ] Delete own post: it disappears from the feed, and the file is gone from
      `group-media` in Supabase.
- [ ] An iPhone HEIC photo uploads as JPEG.
- [ ] Coach Space photo post still works (the `space-media` bucket fix).
- [ ] Both light and dark themes are readable. Use `A91` tokens only, no
      hard-coded colours.
- [ ] Web: the visibility toggle now appears only on your own posts.
