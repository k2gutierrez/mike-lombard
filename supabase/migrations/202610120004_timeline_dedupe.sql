-- =============================================================================
-- Mike Lombard portfolio · 0004 — remove duplicated timeline seed
-- =============================================================================
-- `202610120001_...` inserted the seeded timeline entries with a bare INSERT and
-- no unique constraint to conflict on, so every re-application added another
-- copy. Two applications produced two copies of each row.
--
-- This deletes duplicates, keeping the earliest row of each (title, year_label)
-- pair, and then the guard added to 0001 prevents it from happening again.
-- =============================================================================

delete from public.ml_timeline t
 using public.ml_timeline keep
 where t.title = keep.title
   and t.year_label = keep.year_label
   and t.created_at > keep.created_at;

-- Belt and braces: give the table a uniqueness rule so a duplicate cannot be
-- inserted by the seed path ever again.
create unique index if not exists ml_timeline_seed_unique
  on public.ml_timeline (title, year_label);
