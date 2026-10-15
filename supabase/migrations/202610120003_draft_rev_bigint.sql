-- =============================================================================
-- Mike Lombard portfolio · 0003 — draft revision overflow
-- =============================================================================
-- Problem this fixes
--   `saveSiteContent` wrote `Date.now()` (a millisecond epoch, ~1.79e12) into
--   `ml_site.draft_rev`, which was declared `integer` (max 2,147,483,647). Every
--   save of the site copy failed with:
--
--     value "1791838716564" is out of range for type integer
--
--   The panel reported it in red and nothing was saved, so edits appeared to be
--   ignored.
--
-- Solution
--   Widen the column to `bigint` and let the database own the counter, so the
--   value can never depend on application units again.
-- =============================================================================

alter table public.ml_site
  alter column draft_rev type bigint;

comment on column public.ml_site.draft_rev is
  'Monotonic revision counter, incremented by the server on every draft save.';

-- Saving the site document goes through this function so the revision counter is
-- owned by the database and can never be given the wrong units again.
create or replace function public.ml_save_site_content(
  p_site_id text,
  p_document jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev bigint;
begin
  insert into public.ml_site (id, draft, draft_rev, updated_at)
  values (p_site_id, p_document, 1, now())
  on conflict (id) do update
    set draft = excluded.draft,
        draft_rev = public.ml_site.draft_rev + 1,
        updated_at = now()
  returning draft_rev into v_rev;

  return v_rev;
end;
$$;

revoke all on function public.ml_save_site_content(text, jsonb) from public, anon, authenticated;
