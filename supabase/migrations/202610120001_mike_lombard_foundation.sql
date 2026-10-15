-- =============================================================================
-- Mike Lombard — artist portfolio · Supabase foundation
-- =============================================================================
-- Project: the Mingles Supabase project (shared instance, isolated namespace).
-- Every object here is prefixed `ml_` and never touches the Mingles CMS tables
-- (`site_content`, `website_drafts`, `admin_roles`, `media_assets`, ...).
--
-- Model
--   ml_site           one row per locale: draft + published JSON document with
--                     the editable site copy (hero, bio, career intro, mint
--                     copy, socials, featured selection, hero media).
--   ml_projects       one row per work/project. Has its own draft/published
--                     status so Mike can stage a single project.
--   ml_media          ordered images/videos. Project galleries AND site hero.
--   ml_timeline       career line: exhibitions, collaborations, milestones.
--   ml_mint_interest  mint registrations (private: never publicly readable).
--   ml_rate_limit     server-side throttle counters for the public form.
--   ml_audit_log      append-only trail of admin actions.
--   ml_admin_roles    who may administer this portfolio.
--
-- Security posture
--   * Public (anon) can SELECT published content only, and only through RLS.
--   * No public INSERT/UPDATE/DELETE anywhere: the mint form writes from the
--     server with the service key, so the throttle and validation cannot be
--     bypassed from the browser.
--   * Admin writes go through the server with the service key AFTER verifying
--     the caller's session and `ml_admin_roles` membership. RLS therefore
--     denies mutations to `authenticated` on purpose — defence in depth.
--   * `ml_mint_interest` is readable by admins only (never by anon).
-- =============================================================================

-- `gen_random_uuid()` is built into Postgres 13+, so no extension is required.
-- Kept explicit for older instances that still need pgcrypto for it.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'gen_random_uuid') then
    create extension if not exists "pgcrypto";
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.ml_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- URL-safe slug. Accents are folded with `translate` (no extension needed) so
-- the SQL helper matches `slugify()` in TypeScript, which uses NFKD.
create or replace function public.ml_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(
    both '-' from
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            coalesce(input, ''),
            'áàâäãåéèêëíìîïóòôöõúùûüñçýÿÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇÝ',
            'aaaaaaeeeeiiiiooooouuuuncyyAAAAAAEEEEIIIIOOOOOUUUUNCY'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. Admin roles
-- -----------------------------------------------------------------------------
create table if not exists public.ml_admin_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

comment on table public.ml_admin_roles is
  'Membership list for the Mike Lombard portfolio admin. Never assign roles from the browser.';

-- Session-bound check used by RLS. SECURITY DEFINER so the policy can read the
-- table without granting the caller broad SELECT rights on it.
create or replace function public.ml_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ml_admin_roles r where r.user_id = auth.uid()
  );
$$;

revoke all on function public.ml_is_admin() from public;
grant execute on function public.ml_is_admin() to anon, authenticated;

alter table public.ml_admin_roles enable row level security;

drop policy if exists "ml admins read own role" on public.ml_admin_roles;
create policy "ml admins read own role"
  on public.ml_admin_roles for select
  to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. Site document (copy, hero, mint settings, featured, socials)
-- -----------------------------------------------------------------------------
create table if not exists public.ml_site (
  id          text primary key,
  draft       jsonb not null default '{}'::jsonb,
  published   jsonb,
  draft_rev   integer not null default 0,
  published_at timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.ml_site is
  'Single-row-per-locale site document. `published` is the only document the public API exposes.';

drop trigger if exists ml_site_touch on public.ml_site;
create trigger ml_site_touch
  before update on public.ml_site
  for each row execute function public.ml_set_updated_at();

alter table public.ml_site enable row level security;

drop policy if exists "ml site public read" on public.ml_site;
create policy "ml site public read"
  on public.ml_site for select
  to anon, authenticated
  using (published is not null);

drop policy if exists "ml site admin read" on public.ml_site;
create policy "ml site admin read"
  on public.ml_site for select
  to authenticated
  using (public.ml_is_admin());

-- -----------------------------------------------------------------------------
-- 3. Projects (works)
-- -----------------------------------------------------------------------------
create table if not exists public.ml_projects (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  subtitle      text,
  year          integer,
  category      text not null default 'work',
  excerpt       text,
  description   text,
  client        text,
  location      text,
  external_url  text,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  display_order integer not null default 0,
  featured      boolean not null default false,
  featured_rank integer,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Added after `ml_media` exists, so the cover can be enforced as a real FK.
alter table public.ml_projects
  add column if not exists cover_media_id uuid;

comment on table public.ml_projects is
  'Works/projects. A row is publicly visible only when status = published.';

create index if not exists ml_projects_order_idx
  on public.ml_projects (display_order, published_at desc nulls last);
create index if not exists ml_projects_category_idx
  on public.ml_projects (category);
create index if not exists ml_projects_status_idx
  on public.ml_projects (status);

drop trigger if exists ml_projects_touch on public.ml_projects;
create trigger ml_projects_touch
  before update on public.ml_projects
  for each row execute function public.ml_set_updated_at();

alter table public.ml_projects enable row level security;

drop policy if exists "ml projects public read" on public.ml_projects;
create policy "ml projects public read"
  on public.ml_projects for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "ml projects admin read" on public.ml_projects;
create policy "ml projects admin read"
  on public.ml_projects for select
  to authenticated
  using (public.ml_is_admin());

-- -----------------------------------------------------------------------------
-- 4. Media (ordered gallery items + covers + hero)
-- -----------------------------------------------------------------------------
create table if not exists public.ml_media (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.ml_projects (id) on delete cascade,
  scope         text not null default 'project' check (scope in ('project', 'site')),
  kind          text not null default 'image' check (kind in ('image', 'video')),
  bucket        text not null default 'ml-media',
  path          text not null,
  poster_path   text,
  poster_time   numeric(6, 2),
  alt           text not null default '',
  caption       text,
  year          integer,
  width         integer,
  height        integer,
  duration_s    numeric(8, 2),
  bytes         bigint,
  mime          text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ml_media is
  'Ordered media. scope=project attaches to a project gallery, scope=site is reusable site media (hero, bio portrait).';
comment on column public.ml_media.poster_path is
  'Optional uploaded poster image (Storage path).';
comment on column public.ml_media.poster_time is
  'Video poster as seconds offset (Media Fragment URI). Costs no extra bytes.';

create index if not exists ml_media_project_idx
  on public.ml_media (project_id, display_order);
create index if not exists ml_media_scope_idx
  on public.ml_media (scope, display_order);

drop trigger if exists ml_media_touch on public.ml_media;
create trigger ml_media_touch
  before update on public.ml_media
  for each row execute function public.ml_set_updated_at();

alter table public.ml_media enable row level security;

-- A site-scoped asset is public when the site has been published at least once.
-- A project asset is public when its project is published.
drop policy if exists "ml media public read" on public.ml_media;
create policy "ml media public read"
  on public.ml_media for select
  to anon, authenticated
  using (
    case
      when project_id is not null then exists (
        select 1 from public.ml_projects p
        where p.id = ml_media.project_id and p.status = 'published'
      )
      else exists (
        select 1 from public.ml_site s where s.published is not null
      )
    end
  );

drop policy if exists "ml media admin read" on public.ml_media;
create policy "ml media admin read"
  on public.ml_media for select
  to authenticated
  using (public.ml_is_admin());

-- Cover FK: deleting a media row clears the cover instead of blocking the delete.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ml_projects_cover_media_fk'
  ) then
    alter table public.ml_projects
      add constraint ml_projects_cover_media_fk
      foreign key (cover_media_id) references public.ml_media (id)
      on delete set null;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Career timeline
-- -----------------------------------------------------------------------------
create table if not exists public.ml_timeline (
  id            uuid primary key default gen_random_uuid(),
  year_label    text not null,
  sort_year     integer,
  sort_month    integer,
  title         text not null,
  kind          text not null default 'milestone'
                check (kind in ('exhibition', 'collaboration', 'milestone', 'press', 'residency')),
  place         text,
  description   text,
  link_url      text,
  media_id      uuid references public.ml_media (id) on delete set null,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ml_timeline is
  'Editable career line. Rows start as draft until Mike confirms they are real.';

create index if not exists ml_timeline_order_idx
  on public.ml_timeline (display_order, sort_year desc nulls last);

drop trigger if exists ml_timeline_touch on public.ml_timeline;
create trigger ml_timeline_touch
  before update on public.ml_timeline
  for each row execute function public.ml_set_updated_at();

alter table public.ml_timeline enable row level security;

drop policy if exists "ml timeline public read" on public.ml_timeline;
create policy "ml timeline public read"
  on public.ml_timeline for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "ml timeline admin read" on public.ml_timeline;
create policy "ml timeline admin read"
  on public.ml_timeline for select
  to authenticated
  using (public.ml_is_admin());

-- -----------------------------------------------------------------------------
-- 6. Mint interest registrations (private)
-- -----------------------------------------------------------------------------
create table if not exists public.ml_mint_interest (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  wallet_address  text,
  wallet_chain_id integer,
  wallet_source   text check (wallet_source in ('manual', 'walletconnect', 'injected')),
  consent         boolean not null default false,
  consent_text    text not null,
  consent_at      timestamptz not null default now(),
  locale          text,
  source          text,
  referrer        text,
  ip_hash         text,
  user_agent      text,
  note            text,
  created_at      timestamptz not null default now()
);

comment on table public.ml_mint_interest is
  'Mint interest sign-ups. Recording an address is NOT proof of ownership. Admin-readable only.';

create unique index if not exists ml_mint_interest_email_key
  on public.ml_mint_interest (lower(email));
create index if not exists ml_mint_interest_wallet_idx
  on public.ml_mint_interest (lower(wallet_address));
create index if not exists ml_mint_interest_created_idx
  on public.ml_mint_interest (created_at desc);

alter table public.ml_mint_interest enable row level security;

-- Explicitly no anon policies. Admins read through the service role, and this
-- policy keeps a signed-in but non-admin user out as well.
drop policy if exists "ml mint interest admin read" on public.ml_mint_interest;
create policy "ml mint interest admin read"
  on public.ml_mint_interest for select
  to authenticated
  using (public.ml_is_admin());

-- -----------------------------------------------------------------------------
-- 7. Rate limiting for the public form
-- -----------------------------------------------------------------------------
create table if not exists public.ml_rate_limit (
  bucket       text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, subject_hash, window_start)
);

comment on table public.ml_rate_limit is
  'Fixed-window counters. Written only by the server with the service key.';

alter table public.ml_rate_limit enable row level security;
-- No policies at all: only the service role touches this table.

create or replace function public.ml_rate_limit_hit(
  p_bucket text,
  p_subject_hash text,
  p_window_seconds integer,
  p_max_hits integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.ml_rate_limit (bucket, subject_hash, window_start, hits)
  values (p_bucket, p_subject_hash, v_window, 1)
  on conflict (bucket, subject_hash, window_start)
    do update set hits = public.ml_rate_limit.hits + 1
  returning hits into v_hits;

  return query
    select
      v_hits <= p_max_hits,
      greatest(p_max_hits - v_hits, 0),
      v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.ml_rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Audit log
-- -----------------------------------------------------------------------------
create table if not exists public.ml_audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  actor_email text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

alter table public.ml_audit_log enable row level security;

drop policy if exists "ml audit admin read" on public.ml_audit_log;
create policy "ml audit admin read"
  on public.ml_audit_log for select
  to authenticated
  using (public.ml_is_admin());

-- -----------------------------------------------------------------------------
-- 9. Publish RPC — atomic draft → published promotion
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because the `ml_site` table intentionally has no UPDATE
-- policy: RLS alone cannot express "only through this audited path". The first
-- statement is the authorisation gate, so a non-admin session that reaches
-- PostgREST is rejected before any row is touched.
create or replace function public.ml_publish_site(p_site_id text default 'mike-lombard')
returns public.ml_site
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ml_site;
begin
  if not public.ml_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Serialize concurrent publishes.
  perform pg_advisory_xact_lock(hashtext('ml_publish:' || p_site_id));

  update public.ml_site
     set published = coalesce(draft, '{}'::jsonb),
         published_at = now()
   where id = p_site_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'site % not found', p_site_id;
  end if;

  insert into public.ml_audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'publish_site', 'ml_site', p_site_id);

  return v_row;
end;
$$;

revoke all on function public.ml_publish_site(text) from public, anon;
grant execute on function public.ml_publish_site(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Storage bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ml-media',
  'ml-media',
  true,
  209715200, -- 200 MB hard ceiling; per-kind limits are enforced by the API.
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket: anyone may read objects (paths are unguessable UUIDs and the
-- site only links published rows). Mutations happen exclusively on the server
-- with the service key, which bypasses RLS — so only SELECT is granted here.
drop policy if exists "ml media storage public read" on storage.objects;
create policy "ml media storage public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ml-media');

-- -----------------------------------------------------------------------------
-- 11. Seed (provisional, clearly marked, safe to edit from /admin)
-- -----------------------------------------------------------------------------
insert into public.ml_site (id, draft, published, published_at)
values (
  'mike-lombard',
  jsonb_build_object(
    'provisional', true,
    'meta', jsonb_build_object(
      'siteTitle', 'Mike Lombard',
      'tagline', 'Art direction for Mingles',
      'description', 'Portfolio of Mike Lombard. Text content is provisional and pending the artist''s review.'
    ),
    'hero', jsonb_build_object(
      'eyebrow', 'Art direction / Mingles',
      'title', 'Mike Lombard',
      'subtitle', 'Artist and art director. Author of the new Mingles character era.',
      'ctaPrimaryLabel', 'View works',
      'ctaPrimaryHref', '/works',
      'ctaSecondaryLabel', 'Register for the mint',
      'ctaSecondaryHref', '/mint',
      'mediaId', null,
      'posterMediaId', null,
      'studioLabel', 'Studio'
    ),
    'featured', jsonb_build_object(
      'title', 'Selected works',
      'intro', 'A selection of recent paintings.',
      'projectIds', '[]'::jsonb
    ),
    'works', jsonb_build_object(
      'title', 'Works and projects',
      'intro', 'Browse the full catalogue by category.',
      'categories', jsonb_build_array()
    ),
    'bio', jsonb_build_object(
      'title', 'Biography',
      'portraitMediaId', null,
      'artworkMediaId', null,
      'intro', 'Provisional text — pending review by the artist.',
      'body', 'This biography is a placeholder. Mike Lombard is the artist behind the new Mingles character art direction, but no verified biography has been supplied yet, so this space is intentionally generic and fully editable from the admin panel.\n\nNothing on this page should be quoted until the artist has replaced it with his own words.',
      'visionTitle', 'Artistic vision',
      'vision', 'Placeholder: describe the visual language, references and process. This text was not written by the artist.',
      'minglesTitle', 'Collaborations',
      'mingles', 'Placeholder: collaborations and projects the artist chooses to describe.',
      'facts', jsonb_build_array(),
      'socials', jsonb_build_array()
    ),
    'nfts', jsonb_build_object(
      'title', 'NFTs',
      'eyebrow', 'On chain',
      'intro', 'Digital pieces. Add each one with its image and its story from the admin panel.',
      'note', 'Provenance and links are added by the artist only when they are real.',
      'items', '[]'::jsonb
    ),
    'career', jsonb_build_object(
      'title', 'Career',
      'intro', 'Provisional timeline. Every entry is editable and must be confirmed before launch.',
      'emptyNote', 'No verified exhibitions or collaborations have been supplied yet.'
    ),
    'mint', jsonb_build_object(
      'title', 'Mint registration',
      'eyebrow', 'Register interest',
      'intro', 'Register your interest in the next Mike Lombard mint.',
      'body', 'This form registers interest only. It is not a reservation and it does not guarantee an allocation. No payment, no token approval and no transaction is requested anywhere on this site.',
      'disclaimer', 'Registering interest does not guarantee an allocation. Contract, price and date are not defined yet and will be announced when they are real.',
      'consentText', 'I agree to receive information about this mint by email.',
      'open', true,
      'closedMessage', 'Registration is currently closed.'
    ),
    'footer', jsonb_build_object(
      'note', 'Provisional portfolio.',
      'socials', jsonb_build_array()
    ),
    'updatedAt', now()
  ),
  null,
  null
)
on conflict (id) do nothing;

-- Seed projects (drafts) so the admin panel is never empty on first login.
insert into public.ml_projects (slug, title, subtitle, year, category, excerpt, description, status, display_order, featured, featured_rank)
values
  ('placeholder-lombard-era', 'Lombard era — provisional', 'Character study', null, 'illustration',
   'Provisional placeholder project. Replace with a real work.',
   'This is a placeholder work created during setup so the gallery and the admin panel have something to show. Delete it from /admin and add real projects.',
   'draft', 10, false, null),
  ('placeholder-sketchbook', 'Sketchbook — provisional', 'Process', null, 'process',
   'Provisional placeholder for process material.',
   'Placeholder for sketches, process shots and studio material. Not a real work by the artist until he says so.',
   'draft', 20, false, null)
on conflict (slug) do nothing;

-- Guarded by a NOT EXISTS on the title: `on conflict do nothing` needs a unique
-- constraint, and this table has none. Without this guard, re-applying the
-- migration inserted a second copy of every seeded entry (it happened).
insert into public.ml_timeline (year_label, sort_year, title, kind, place, description, status, display_order)
select * from (values
  ('2026', 2026, 'Mingles — new art direction (provisional)', 'collaboration', null::text,
   'Placeholder milestone. Confirm details with the artist before publishing.', 'draft', 10),
  ('—', null::integer, 'Add exhibitions, collaborations and milestones', 'milestone', null::text,
   'Every entry in this line is written by the artist. Nothing here is invented by the site.', 'draft', 20)
) as seed(year_label, sort_year, title, kind, place, description, status, display_order)
where not exists (
  select 1 from public.ml_timeline t where t.title = seed.title
);
