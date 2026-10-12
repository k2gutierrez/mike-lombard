# Deploy to AWS Amplify Hosting

Amplify supports Next.js 16 App Router with SSR through its built-in Next.js
adapter. `amplify.yml` in the repo root is already configured; this document
covers the console settings and the checks to run afterwards.

Region for all resources: **us-east-1** (matches the rest of the Mingles stack).

## 1. Prerequisites

- The Supabase migration applied (see [02-SUPABASE.md](02-SUPABASE.md)).
- A Git remote Amplify can read (GitHub, GitLab, Bitbucket, or CodeCommit).
- A domain, or use the default `*.amplifyapp.com` while testing.

## 2. Connect the repository

Amplify console → **Create new app** → **Host a web app** → connect the provider
→ pick the repo and branch.

Amplify detects `amplify.yml`. Leave the build settings as they are:

```yaml
preBuild: nvm use 22 && npm ci
build:    npm run build
artifacts: .next/**/*
```

**Node 22** is required by Next.js 16. The `nvm use 22` line in `amplify.yml`
selects it.

## 3. Environment variables

Amplify console → **App settings → Environment variables**. Add every variable
from `.env.example` that applies to your environment. They must be present
**before the build**, because `NEXT_PUBLIC_*` values are inlined into the bundle
while the others are handed to the runtime by the build step described below.

> **This is the step that decides whether `/admin` works at all.** Amplify keeps
> console variables in the *build* environment only. A Next.js server component
> does not see them at runtime by default — that is deliberate, so build-time
> secrets are not exposed to the SSR compute. The documented mechanism is to
> write them to `.env.production` before building:
> <https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html>
>
> `amplify.yml` already does this. If that step is removed, the public site still
> renders but `/admin` shows **"Demo mode. Supabase is not configured…"** and
> nobody can sign in, because `hasSupabaseService` is false on the server.

### Required

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zifpnidxmvofiqqbekhe.supabase.co` | public; **the build fails without it** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | public; **the build fails without it** |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | **secret, server only**. Without it the panel runs in demo mode |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` | no trailing slash |
| `APP_ORIGIN` | `https://your-domain` | used for the sign-in redirect. If it stays `localhost`, sign-in bounces |

### Recommended

| Variable | Value | Notes |
| --- | --- | --- |
| `ML_ADMIN_EMAILS` | `minglesnft@gmail.com` | allowlist for onboarding. The role already exists in `ml_admin_roles`, so this is only needed for new admins |
| `ML_AUTH_MODE` | `handoff` | `email` once SMTP is configured |
| `ML_HASH_SALT` | random string | salt for throttle hashes. Rotating it only resets counters |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown project id | optional; enables the wallet connect modal on `/mint` |

### Only if you need them

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_ML_IMAGE_TRANSFORMS` | `0` | `1` makes Supabase Storage resize images (paid plan) |
| `APECHAIN_RPC_URL` | public endpoint | only for wallet reads on `/mint` |
| `NEXT_PUBLIC_APECHAIN_RPC_URL` | public endpoint | browser-side equivalent |
| `ML_SITE_ID` / `ML_MEDIA_BUCKET` / `ML_MEDIA_PREFIX` | `mike-lombard` / `ml-media` / `mike-lombard` | namespacing; leave the defaults |

**Do not add `SUPABASE_ACCESS_TOKEN`** to Amplify: it is only for running
`npm run db:apply` from a trusted machine, and it can change your database schema.

### How to confirm the build picked them up

The build log prints one line per expected variable:

```
env NEXT_PUBLIC_SUPABASE_URL: set
env SUPABASE_SERVICE_ROLE_KEY: set
env ML_ADMIN_EMAILS: set
vars written to .env.production: 9
```

If any line says `MISSING`, the variable is not in the Amplify environment (check
the branch scoping) and it must be added before the next build.

Do **not** add `SUPABASE_ACCESS_TOKEN` here: it is only needed on the machine
that runs `npm run db:apply`.

## 4. Domain and redirect allowlist

1. Amplify → **Custom domains** → add the domain.
2. Supabase → **Authentication → URL Configuration**:
   - *Site URL*: `https://your-domain`
   - *Redirect URLs*: add `https://your-domain/auth/callback` and
     `https://your-domain/admin` (keep the localhost entries for development).
3. If `ML_AUTH_MODE=email`, verify the SMTP sender before launch.

## 5. Build and runtime characteristics

- The public pages call Supabase on each request, so Amplify's SSR Lambda stays
  warm under traffic. Response time measured locally: **~180–350 ms** with an
  empty database.
- Image optimization runs in the Lambda with `sharp` (declared as an optional
  dependency, so a platform without native binaries still installs). Derivatives
  are cached for 30 days.
- `/api/admin/upload` streams request bodies. Amplify's serverless functions
  accept bodies up to **6 MB** by default; the panel warns before that. Above that
  limit, raise the function's payload allowance, or switch the upload to a
  Supabase signed URL — the code already records the same metadata either way
  (see `src/app/api/admin/upload/route.ts`).
- Videos are never proxied through the app: they are served by Supabase Storage
  with a one-year immutable cache.

## 6. Post-deploy checks

Run these against the deployed URL:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/works
curl -s https://your-domain/api/mint
```

Then in a browser:

1. `/admin/login` → sign in with the administrator email → you land in `/admin`.
2. Create a project, upload an image, **Save draft**, press **Preview**: the
   unpublished work appears with the preview banner.
3. Press **Publish**, reload `/works`: it is live.
4. Open `/mint`, submit the form with a real email, then check the row in
   **Registrations** and export the CSV.
5. Open the site with DevTools → Network and confirm that **no video is
   downloaded** until a play button is pressed.
6. Confirm `/admin` redirects to `/admin/login` in a private window.

## 7. Troubleshooting

### `npm error Missing: @solana/... from lock file` (build fails in preBuild)

**What happened.** `npm ci` refuses to install when `package-lock.json` does not
contain every package its resolution needs. In this project the lockfile had been
generated and then rewritten while dependencies were still changing (`sharp` was
added after the first install), so the tree carried `@solana/*@5.5.1` while
transitive peers wanted `6.10.0` — and those entries were absent.

**Why it only appeared on Amplify.** `npm ci` validates the lockfile strictly, and
the Amplify image ran a different npm major than the machine that wrote the lock.
A local `npm install` tolerates the mismatch; `npm ci` does not.

**What was done.**

1. Regenerated the lockfile from scratch (`rm -rf node_modules package-lock.json
   && npm install`), so every transitive package — including `@solana/*` at both
   5.5.1 and 6.10.0 — is now pinned with its integrity hash.
2. Verified with a real `npm ci` against the regenerated lock: exit code 0, then
   `tsc --noEmit`, 16 tests and `next build` all pass on that clean install.
3. `amplify.yml` now uses `npm ci || npm install` so a future lockfile mismatch
   degrades instead of stopping the deploy, and prints `node -v` / `npm -v` for
   diagnosis. `.nvmrc` pins Node 22.

**Before you push a dependency change**, run the same thing Amplify will run:

```bash
npm install                 # updates package-lock.json
rm -rf node_modules
npm ci                      # must exit 0 — this is the gate
npm run build
```

### Other common failures

| Symptom | Cause |
| --- | --- |
| `next: not found` | `npm ci` failed earlier in the same phase; fix the install first. |
| Images 500 on Amplify but fine locally | `sharp` missing. It is an optional dependency; check the install log. |
| Sign-in redirects to `localhost` | `APP_ORIGIN` in the Amplify environment still points at localhost. |
| `/admin` redirects back to `/admin/login` | `ML_ADMIN_EMAILS` empty and no row in `ml_admin_roles` for that account. |
| `/admin` shows **"Demo mode. Supabase is not configured…"** | The `.env.production` step is missing from `amplify.yml`, or `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not set in the Amplify environment. This is the single most common deployment failure of this project. |
| Build fails with `FATAL: NEXT_PUBLIC_SUPABASE_URL is not set` | Working as intended: the build stops instead of deploying a site that silently runs in demo mode. |

## 8. Rollback

Amplify keeps previous deployments: **App settings → Build history → Redeploy**
on the last good build. Because the content lives in Supabase, redeploying the
previous build does not roll back published content — use the panel's **Revert**
for that.
