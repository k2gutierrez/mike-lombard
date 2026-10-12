-- =============================================================================
-- Mike Lombard portfolio · 0002 — explicit publication intent
-- =============================================================================
-- Problem this fixes
--   `ml_projects` and `ml_timeline` rows started as drafts, and "Publish"
--   promoted *every* draft row. The seeded placeholder entries were therefore
--   pushed live on the first publish, contradicting the documented rule that
--   nothing the artist has not explicitly approved is publicly visible.
--
-- Solution
--   Publication is now opt-in per row. Saving an item as a draft with the intent
--   to release it marks `publish_pending`; the publish action promotes only rows
--   that carry that flag. Editing a placeholder never publishes it by accident.
-- =============================================================================

alter table public.ml_projects
  add column if not exists publish_pending boolean not null default false;

alter table public.ml_timeline
  add column if not exists publish_pending boolean not null default false;

comment on column public.ml_projects.publish_pending is
  'Set when an editor explicitly saves this item as "ready to publish". Only rows with this flag are promoted by the publish action.';
comment on column public.ml_timeline.publish_pending is
  'Set when an editor explicitly saves this entry as "ready to publish". Only rows with this flag are promoted by the publish action.';

create index if not exists ml_projects_pending_idx
  on public.ml_projects (publish_pending) where publish_pending;

create index if not exists ml_timeline_pending_idx
  on public.ml_timeline (publish_pending) where publish_pending;

-- Reset the state that the previous behaviour produced: the seeded placeholders
-- must go back to being invisible, and nothing should be queued for release.
update public.ml_projects
   set status = 'draft',
       published_at = null,
       publish_pending = false
 where slug in ('placeholder-lombard-era', 'placeholder-sketchbook');

update public.ml_timeline
   set status = 'draft',
       publish_pending = false
 where publish_pending;
