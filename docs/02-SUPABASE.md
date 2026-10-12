# Setup and Supabase

Everything here is verified against a local Postgres (PGlite) by `npm test` and
against the live project by `npm run check:backend`. Where something could not be
verified on your account, it says so explicitly.

## 1. Which Supabase project

The portfolio uses the **same project as Mingles** so the brand, the artist and
his work all live in one place. Isolation is by prefix:

| Object | Mingles | Mike Lombard portfolio |
| --- | --- | --- |
| Tables | `site_content`, `website_drafts`, `admin_roles`, `media_assets`, `linked_wallets`, `ownership_snapshots` | `ml_site`, `ml_projects`, `ml_media`, `ml_timeline`, `ml_mint_interest`, `ml_admin_roles`, `ml_rate_limit`, `ml_audit_log` |
| Role check | `is_content_admin()` | `ml_is_admin()` |
| Bucket | `public-media`, `game-assets`, `traits` | `ml-media` |
| Object prefix | — | `mike-lombard/` |

The migration never touches a Mingles object. Reusing `public-media` was rejected
on purpose: its RLS and MIME policy are tuned for the existing site and sharing it
would couple two content lifecycles.

## 2. Environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → publishable | Public, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → service_role | **Secret, server only** |
| `NEXT_PUBLIC_SITE_URL` / `APP_ORIGIN` | your domain | No trailing slash |
| `ML_ADMIN_EMAILS` | the artist's email | Comma separated |
| `ML_AUTH_MODE=handoff` | — | Direct sign-in until SMTP exists |
| `ML_HASH_SALT` | random string | Salt for the rate limiter hashes |

Then:

```bash
npm run check:backend
```

## 3. Apply the migration

The migration is a single file:
`supabase/migrations/202610120001_mike_lombard_foundation.sql`

### Option A — script (Management API)

Needs a Personal Access Token from
<https://supabase.com/dashboard/account/tokens>:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply
```

It applies every file in `supabase/migrations` in filename order, then prints the
tables, the `ml-media` bucket and the RLS policy count, and promotes every email
in `ML_ADMIN_EMAILS` that already has an account. **Revoke the token afterwards.**

### Option B — SQL editor

Paste the file into the project's SQL editor and run it. It is idempotent
(`create table if not exists`, `on conflict do nothing`, guarded extension), so
running it twice is safe.

### What it creates

- 8 tables, all `ml_`-prefixed, RLS enabled everywhere.
- `ml_is_admin()` — session-bound role check used by every read policy.
- `ml_publish_site()` — the atomic draft → published promotion, `security
  definer` with the role check as its first statement. `ml_site` deliberately has
  no UPDATE policy: publication can only happen through this audited path.
- `ml_rate_limit_hit()` — fixed-window throttle, executable by nobody but the
  service role.
- The public `ml-media` bucket (200 MB ceiling, image + video MIME allowlist).
- A **provable baseline**: the site row starts with `published = null`, so no
  anonymous visitor sees anything until an administrator publishes. The seeded
  works and timeline rows are `draft`.

## 4. Row Level Security, in plain terms

| Table | Anonymous | Signed in, not admin | Administrator (service role) |
| --- | --- | --- | --- |
| `ml_site` | read only after a publish | same | read + write |
| `ml_projects` | read only `status = published` | same | read + write, all rows |
| `ml_media` | read only with a published project or a published site | same | full |
| `ml_timeline` | read only `status = published` | same | full |
| `ml_mint_interest` | **nothing** | nothing | read (panel + CSV) |
| `ml_admin_roles` | nothing | own row only | full |
| `ml_rate_limit` | nothing | nothing | full |
| `ml_audit_log` | nothing | nothing | read |

Storage: `ml-media` is a public bucket, so objects are readable by URL. Uploads,
overwrites and deletes are **not** exposed to the browser at all — they happen on
the server with the service key after the role check, then the media row is
written. There is no policy that lets an authenticated user write to the bucket
directly.

`npm test` asserts all of this against a real Postgres engine, including that a
non-admin cannot publish, cannot insert a role, cannot read drafts, and that a
duplicate email is rejected by the unique index on `lower(email)`.

## 5. Administrator accounts

1. Put the email in `ML_ADMIN_EMAILS`.
2. **If the account does not exist yet**, create it once — the shared project has
   open sign-up, so this matters:
   - Supabase → Authentication → Users → *Add user* → *Create new user* with that
     email (no password needed), or
   - run `npm run db:apply` after the user has signed in once, or
   - simply sign in at `/admin/login` (it creates the account through the
     allowlist) — this is what happens in practice.
3. The first sign-in with an allowlisted email inserts the `ml_admin_roles` row.
   After that, the table is the single source of truth and `ML_ADMIN_EMAILS` can
   be emptied.

Sign-in flow (`ML_AUTH_MODE` not set to `email`):

```
/api/admin/login  →  is this email an administrator?  (roles table, then allowlist)
                  →  no:   generic "if that email has access…" response
                  →  yes:  Supabase generateLink(magiclink) → one-time token
/auth/callback    →  verifyOtp → HttpOnly session cookies → /admin
```

With `ML_AUTH_MODE=email` the same check runs first, then Supabase sends a real
magic link (`signInWithOtp`, `shouldCreateUser: false`). That requires SMTP to be
configured: **Authentication → Emails → SMTP Settings**. Until then, the hand-off
mode is used, which is also why the panel works before any mail infrastructure
exists.

## 6. Storage

| | |
| --- | --- |
| Bucket | `ml-media`, public read |
| Paths | `mike-lombard/projects/<project-id>/<timestamp>-<random>.<ext>` and `mike-lombard/site/…` |
| Images | JPEG, PNG, WebP, AVIF, GIF · 20 MB |
| Video | MP4, WebM, MOV · 200 MB |
| Validation | magic bytes on the server; the declared MIME type is recorded only after it matches the bytes |
| Cache | `Cache-Control: max-age=31536000` (paths are unique, never overwritten) |

Uploads go through `/api/admin/upload` (POST for media, PATCH for a poster). The
browser sends raw bytes so `xhr.upload.onprogress` can drive the progress bar, and
the server streams them to Storage. If the media row fails to insert, the object
is deleted so no orphan is left behind. Deleting a project removes its objects
first, then the row (media cascades).

**Supabase Storage upload limit.** Supabase rejects uploads above the project's
global limit (the free plan allows 50 MB per object) before the bucket policy is
consulted. If videos above that are needed, raise the project limit in
Storage settings; the 200 MB ceiling here is the application-side maximum.

## 7. Optional: Image Transformations

Storage can resize on the fly (paid plans). Enable it and set:

```
NEXT_PUBLIC_ML_IMAGE_TRANSFORMS=1
```

Then `publicMediaUrl()` requests `/storage/v1/render/image/public/...?width=…`
instead of the master file, and the CDN does the resizing. Without it, the Next.js
image optimizer resizes the originals and caches the derivatives for 30 days —
also fine, just more work in the app runtime.

## 8. Verified against the live project

Both migrations are applied to `zifpnidxmvofiqqbekhe`, the `ml-media` bucket
exists, and `minglesnft@gmail.com` holds the administrator role.

Automated, reproducible with `npm test` (PGlite, a real Postgres engine):

- The migrations apply cleanly against Supabase's `anon` / `authenticated` /
  `service_role` roles, `auth.uid()` and the storage schema.
- Anonymous sees published rows only. A signed-in stranger sees nothing extra and
  cannot publish, insert a role or write content.
- Publishing snapshots the draft and stamps the release time without touching it
  afterwards.
- Duplicate registrations are rejected by the database, and the throttle function
  denies the request over the limit.

Verified end to end in a real browser against the live project (22 acceptance
checks in one clean run, all passing, zero browser and server errors):

| Check | Result |
| --- | --- |
| Admin sign-in with a one-time token | ✅ |
| Seeded placeholders stay invisible after a publish | ✅ |
| Create work, save draft | ✅ |
| Multi-file upload with real progress | ✅ |
| Cover assigned to the first image, kept across save and reopen | ✅ |
| Media listed exactly once after upload, save and reopen | ✅ |
| `?preview=1` shows drafts to the administrator | ✅ |
| `?preview=1` shows nothing extra to an anonymous visitor | ✅ |
| Publish promotes only rows queued for release | ✅ |
| Work appears on the public index and its own page | ✅ |
| Work page renders the stored image and the description | ✅ |
| Mint registration accepted, stored with consent and timestamp | ✅ |
| Duplicate registration handled idempotently | ✅ |
| Registrations table renders for the administrator | ✅ |
| CSV export (200, includes `consent_at`) | ✅ |
| Deleting a work removes it from the site and sweeps Storage | ✅ |
| Drag a work up or down the list — UI order changes and survives a reload | ✅ |
| Console / server errors during the whole run | none |

Additional checks, run across **desktop (1440px) and mobile (390px)** and both
motion preferences — 24 page/mode combinations, all clean:

| Check | Result |
| --- | --- |
| Landing, works, biography, career, mint, `/admin/login` render with no console or hydration errors | ✅ 24/24 |
| No hydration mismatch with `prefers-reduced-motion: reduce` | ✅ (see note) |
| Canvas ambient field is disabled under reduced motion, active without it | ✅ |
| Skip link is the first Tab stop; one `h1` per page; `lang` set | ✅ |
| Zero video bytes requested before a play button is pressed | ✅ |
| Images served lazy (`loading="lazy"`) | ✅ |

**Note on the reduced-motion bug.** Motion's `useReducedMotion()` reads
`matchMedia` synchronously on the client, so the first client render disagreed
with the server for anyone who has "reduce motion" enabled — React reported a
hydration mismatch and discarded the tree. `src/lib/use-reduced-motion.ts`
starts at the static value (what the server renders) and corrects itself after
mount, so hydration is stable and reduced-motion visitors get the static
presentation.

Not verified here: email delivery (no SMTP is configured, which is why the
hand-off mode exists), and behaviour on AWS Amplify, which needs a deployment.
