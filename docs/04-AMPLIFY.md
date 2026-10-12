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
from `.env.example`. `NEXT_PUBLIC_*` values are baked in at build time, so they
must be present **before the first build**.

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | **secret**, server only |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` | no trailing slash |
| `APP_ORIGIN` | `https://your-domain` | used for the sign-in redirect |
| `ML_ADMIN_EMAILS` | artist email | optional once the role row exists |
| `ML_AUTH_MODE` | `handoff` | `email` once SMTP exists |
| `ML_HASH_SALT` | random string | throttle hash salt |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown project id | optional |

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

## 7. Rollback

Amplify keeps previous deployments: **App settings → Build history → Redeploy**
on the last good build. Because the content lives in Supabase, redeploying the
previous build does not roll back published content — use the panel's **Revert**
for that.
