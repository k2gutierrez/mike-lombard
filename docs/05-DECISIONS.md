# Technical decisions

Short rationale for the choices that are hard to reverse, plus what is
deliberately out of scope. Written so a future developer does not have to
reconstruct the reasoning from the diff.

## Content model: one JSON document + three normalised tables

`ml_site.draft` / `ml_site.published` hold all the *singular* copy: hero, bio,
career intro, mint copy, socials, featured selection. Projects, media and timeline
entries are rows.

Why the split: copy changes every time Mike edits a paragraph and does not need
per-object drafts, while a project has status, ordering and a media collection
that would be painful inside a document (slug uniqueness, cascade on delete,
ordering). A fully normalised copy table (`site_copy(key, locale, value)`) was
rejected as over-engineering for one artist and one language; the JSON document
is validated and sanitised on every write, so an unexpected shape cannot reach
the database.

Draft/publish is therefore **two mechanisms** with one button: the site document
is snapshotted into `published`, and `status` flips on project/timeline rows. Both
happen inside the publish action so the panel cannot publish half a release.

## Writes only through the server

RLS denies INSERT/UPDATE/DELETE to `authenticated` on purpose. The browser never
holds the service key; every mutation goes through `/api/admin/*`, which
re-verifies the session and the `ml_admin_roles` membership first.

The alternative — RLS policies for administrators and a browser Supabase client
holding a user token — is more idiomatic PostgREST, but it would spread
authorisation across a dozen policies and put media handling in the browser. One
audited server path is easier to reason about and to test. The cost is that the
publish RPC must be `security definer` (there is no UPDATE policy on `ml_site`),
with `ml_is_admin()` as its first statement — asserted by `tests/schema.test.mjs`
against a real Postgres engine.

## Administrator identity: two sources, one direction

`ML_ADMIN_EMAILS` (env) and `ml_admin_roles` (table). The allowlist can only
*promote* an email that has a Supabase account; the table can only *confirm*.
Checking the allowlist before generating any sign-in token matters because the
shared Mingles project has open sign-up enabled, so without it anybody could
create an account. Creating an account still grants nothing.

`ML_AUTH_MODE=handoff` exists so the panel is usable before SMTP is configured:
`generateLink` returns a one-time token that `/auth/callback` consumes
immediately. Switch to `email` when a real sender is set up.

## Upload transport: raw bytes, not multipart

The browser posts the file as the raw request body with metadata in the query
string. That gives `xhr.upload.onprogress` (real progress bars — the brief asked
for them) and lets the server sniff magic bytes without a multipart parser. The
declared MIME type is only recorded after it matches the bytes; a JPEG announced
as a PNG is stored as a JPEG, and random bytes are refused.

If Amplify's 6 MB function payload limit becomes a problem, replace `uploadMedia()`
with a Supabase signed upload URL. The DB row shape and the poster mechanism stay
identical, so the change is contained in one client function plus one route.

## Video posters without transcoding

Appending `#t=1.2` to a video URL (Media Fragment URI) makes the browser render
that frame as a still. Zero extra bytes, zero transcoding, works for every clip.
For art-directed control the panel extracts a frame with canvas and uploads it as
a WebP, which then takes priority. There is no transcoding pipeline, and none is
planned: it is the only heavyweight piece this project cannot justify.

## Why the video element has no `src` until play

`preload="none"` plus no `src` guarantees the browser fetches nothing for a video
the visitor has not started. Opening a page with ten clips downloads only the
posters. This is the single biggest performance decision for a media-heavy
portfolio, and it is asserted in the docs, not in code — a future refactor could
reintroduce `preload="metadata"` and undo it, so leave the comment in place.

## Tailwind 4 + custom CSS

Tailwind v4 (CSS-first `@theme`) covers layout and spacing; the design system
lives in `src/app/globals.css` as custom properties and a handful of components
(`.btn`, `.field`, `.frame`, prose). No UI kit: a portfolio needs an identity, and
component libraries all look the same.

## Preview without duplicating pages

`?preview=1` resolves to a draft-aware `loadSite()` only when the visitor has an
admin session; the header shows a banner. This costs static rendering (awaiting
`searchParams` makes the page dynamic), which was the deliberate trade: separate
`/preview/...` routes would double the page count, and a middleware rewrite would
not catch navigations without the marker.

## Scroll reveals never gate visibility

The reveal animation is `whileInView` and starts from `opacity: 0.55`, not `0`.
Content is in the DOM and legible before any observer fires. The first
implementation started at `opacity: 0` with a blur and produced invisible
sections in a full-page screenshot — a real accessibility and SEO risk for
exactly the content the site exists to show. Under `prefers-reduced-motion` the
component renders the final state with no animation at all.

## Never call a wagmi hook outside its provider

`WalletField` originally called `useAccount`, and it was rendered both inside and
outside `WagmiProvider` depending on whether a WalletConnect project id existed.
On a deployment where the value was present at build time but missing at runtime,
the server rendered the plain branch and the client the wallet branch: the whole
`/mint` page died with `WagmiProviderNotFoundError` and a hydration mismatch.

The rule now:

* `wallet-field.tsx` has **no** framework hooks and is safe to render anywhere;
* `wallet-field-connected.tsx` is the only file that touches wagmi, and it is
  mounted **only** inside `WalletProvider`;
* whether to mount wallet code at all is decided **on the server** and passed down
  as a prop, so both renders always agree.

## Never delete rows by a `like` pattern

Cleaning up the seeded placeholder projects, I ran a filter on
`slug=like.placeholder*` and deleted a **published project** by mistake: the
artist's own slug matched it. The files survived in Storage, so the project and
its twelve media rows were rebuilt from the storage listing and the inventory
taken beforehand — but that was luck, not process.

Rules that came out of it:

* delete by **exact id**, never by a name pattern;
* **list first and read the output** — the deletion printed
  `Hyper Realiste (published)` before removing it, and that line was the warning;
* prefer **soft delete** (`status = 'archived'`) for anything a human published;
* write an **audit row for destructive admin operations**. `delete-project` is the
  one action that still leaves no trail, which is why recovering this needed
  Storage forensics instead of a log lookup.

## Out of scope, on purpose

- **No transcoding, no video CDN, no HLS.** MP4/WebM served straight from
  Storage.
- **No wallet signature.** A pasted or connected address is never presented as
  proof of ownership. If verification is ever needed, it belongs in the same
  nonce/challenge pattern the Mingles portal already implements.
- **No scheduling.** `publish_at` columns exist in the content model discussion
  but not in the code: a date picker that implies scheduled publishing without a
  worker would be a lie.
- **No i18n.** One language, one document row; the table design (`id` per locale)
  leaves room.
- **No role administration UI.** `ml_admin_roles` is seeded from the allowlist or
  SQL. Exposing role assignment in the panel is how content tools become
  privilege-escalation vectors.
- **No comments, no CMS page builder.** Not asked for, and they would fight the
  fixed editorial layout that makes the gallery look intentional.
