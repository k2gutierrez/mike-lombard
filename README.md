# Mike Lombard — portfolio

Artist portfolio for **Mike Lombard**, art director of the new **Mingles** character
era. A dark, gallery-first site where the artwork is the loudest element and
everything else stays quiet, plus a real admin panel so Mike can publish without
touching code.

Stack: **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Motion · Canvas · Lucide · Supabase (Postgres + Auth + Storage) · wagmi +
RainbowKit · ApeChain**.

---

## 1. Quick start

```bash
npm ci
npm run dev          # http://localhost:3000
```

Without Supabase credentials the site runs on clearly labelled **provisional
content** and `/admin` works in **demo mode** (changes live in the browser
session only). Nothing breaks, nothing lies: the panel says "Demo mode" and every
placeholder page states that the text is pending the artist's review.

Node 22 is pinned in `.nvmrc` (Next.js 16 requires it).

```bash
npm run typecheck    # tsc --noEmit
npm test             # 16 tests: content rules + SQL/RLS against an embedded Postgres
npm run build        # production build
npm start            # serve the production build
npm run check:backend # what is configured and what actually answers
npm run db:apply     # apply supabase/migrations/*.sql (needs SUPABASE_ACCESS_TOKEN)
```

## 2. Connecting the real backend

The portfolio lives in the **same Supabase project as Mingles**, isolated by
prefix and never touching the Mingles CMS tables (`site_content`,
`website_drafts`, `admin_roles`, `media_assets`, …).

Read [docs/02-SUPABASE.md](docs/02-SUPABASE.md) for the step-by-step. Short
version:

```bash
cp .env.example .env.local     # fill in URL, publishable key, service-role key
# put the artist's email in ML_ADMIN_EMAILS
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply
```

Then open `/admin/login`, sign in, and press **Publish** once so the public
document exists.

## 3. What is included

**Public site**

| Route | Purpose |
| --- | --- |
| `/` | Landing: administrable hero (image or silent looping video), selected works, biography teaser, career preview, mint call to action |
| `/works` | Filterable gallery by category, all client-side |
| `/works/[slug]` | Project page: cover, story, ordered image/video gallery, lightbox viewer, related works, next work |
| `/biography` | Portrait, story, artistic vision, relationship with Mingles, key facts, links |
| `/career` | Editable timeline grouped by year (exhibitions, collaborations, milestones, press, residencies) |
| `/mint` | Mint interest registration with server-side validation and anti-spam |
| `?preview=1` | Draft preview on any page, for administrators only |

**Admin panel (`/admin`)** — Supabase Auth, restricted by an allowlist plus a
role table:

- Works: create, edit, save draft, publish, delete, drag-and-drop reorder.
- Media: multi-upload with **real progress bars**, drag-and-drop ordering,
  cover selection, alt text, captions, per-file year, delete (removes the object
  from Storage too).
- Landing: hero title/subtitle/CTAs, hero image or video, poster, selected works
  with explicit order, section copy.
- Biography, career timeline, mint copy, social links.
- Registrations: private list, filter, **CSV export**.
- **Publish** promotes every draft at once and invalidates the public cache;
  **Revert** restores the last published site document.
- Every write is audited (`ml_audit_log`).

**Design**

Dark neutral surfaces, one cold mineral-green accent used only for state and
interaction, `Space Grotesk` display + `Inter` text + `Instrument Serif` for
editorial asides + `JetBrains Mono` for metadata. Motion is content-first: a
scroll reveal, a small hero parallax, page transitions, a canvas ambient field
that reacts to the pointer, hover states on cards and media. Everything respects
`prefers-reduced-motion`, the whole site is keyboard navigable, and a skip link
is the first tab stop.

Deliberately absent: gradients, glows, bevels, rounded corners, generic crypto
UI. Media never competes with the interface.

## 4. Security posture

- The **service-role key only ever exists server-side**. `import "server-only"`
  in `src/lib/supabase/admin.ts` turns an accidental browser import into a build
  error.
- Public reads go through the **publishable key + RLS**. A draft row is
  unreachable for an anonymous visitor even if a request asks for it.
- There are **no public write policies**: the mint form writes from the server,
  so the validation and the rate limiter cannot be bypassed.
- `ml_mint_interest` is never publicly readable, and registrations contain no
  wallet proof: **a pasted or connected address is not evidence of ownership**
  and nothing is signed anywhere in this project.
- Admin routes re-check the session and the role on every request; the panel is
  never authorised by client state.
- Uploads are validated on the server by **magic bytes**, not by the declared
  MIME type or extension.
- CSV export neutralises spreadsheet formula injection.

## 5. Media limits and performance

| | Limit |
| --- | --- |
| Images | JPEG, PNG, WebP, AVIF, GIF · **20 MB** |
| Video | MP4, WebM, MOV (QuickTime) · **200 MB** |
| Bucket ceiling | 200 MB per object, enforced by Supabase Storage too |

Performance choices that matter for a portfolio with many files:

- Videos are fetched **only on play**. Before that the element has no `src`,
  just a poster, so opening a page with ten clips downloads zero video bytes.
- Every video gets a poster for free: a **Media Fragment URI** (`#t=1.2`) shows a
  frame as a still. When art direction matters, the panel extracts a real frame
  with canvas and uploads it as a WebP poster, which then takes over.
- Images go through `next/image` with explicit `sizes`, lazy loading, AVIF/WebP
  and a 30-day derivative cache. Enable Supabase Image Transformations
  (`NEXT_PUBLIC_ML_IMAGE_TRANSFORMS=1`) to have Storage resize the masters.
- Videos pause automatically when they scroll out of view.
- The canvas field caps DPR, stops when the tab is hidden, and pauses when
  off-screen.
- Wallet code (wagmi + RainbowKit, ~200 kB) loads **only** on `/mint`, and only
  when a WalletConnect project id is configured.

## 6. Project layout

```
src/
  app/
    (site)/            public pages (shared header/footer)
    (admin)/admin/     protected panel + sign-in
    api/
      mint/            public registration endpoint (validation + throttle)
      admin/           authenticated dispatcher, uploads, CSV export
      admin/login/     email allowlist check, one-time sign-in token
    auth/callback/     consumes the token and sets the session cookie
  components/          shell, media, gallery, effects, canvas, admin/*
  lib/                 config, types, validation, sanitize, media helpers
  lib/server/          server-only: auth, admin data, upload validation
  proxy.ts             session refresh (Next 16 renamed middleware → proxy)
supabase/migrations/   schema, RLS, storage bucket, seed
tests/                 content rules + SQL/RLS on PGlite
docs/                  setup, operations manual, deployment, decisions
```

## 7. Provisional content — read this

No biography, exhibition, collaboration or mint detail was invented. Every text
in the shipped seed is generic and self-labelling ("Provisional text — pending
review by the artist"), the landing page shows a provisional banner, and the site
sends `noindex` while `content.provisional` is true. The mint page states that
registration is interest only, guarantees no allocation, and that contract, price
and date are undefined. Uncheck the provisional flag in the admin panel only when
the artist has approved every text.

## 8. Handover notes

- Both migrations are **applied to the live Mingles Supabase project** and the
  administrator role exists for `minglesnft@gmail.com`.
- The complete flow was verified end to end against that live project: sign-in,
  draft, upload with progress, cover assignment, preview, publish, the public
  work page and its image, mint registration, duplicate handling, the
  registrations table and the CSV export. No console or server errors.
- The database is left at the seeded baseline: two **draft** placeholder works,
  two **draft** timeline entries, no media, no registrations. Nothing is public
  until the artist publishes.
- This folder is its own Git repository. `.env.local` is gitignored and present
  locally; only `.env.example` is ever tracked. The Supabase access token used
  during setup should be revoked at
  <https://supabase.com/dashboard/account/tokens>.
- Remaining before launch: the artist's real content, a domain, custom SMTP (if
  magic-link emails are preferred over the current one-time hand-off), and the
  Amplify deployment checklist in [docs/04-AMPLIFY.md](docs/04-AMPLIFY.md) §6.

## 9. Documentation

1. [Setup and Supabase](docs/02-SUPABASE.md) — project, migration, auth, storage.
2. [Admin manual for Mike](docs/03-ADMIN-MANUAL.md) — how to publish content.
3. [Deploy to AWS Amplify](docs/04-AMPLIFY.md) — build, variables, checks.
4. [Technical decisions](docs/05-DECISIONS.md) — why things are the way they are,
   and what is deliberately out of scope.
