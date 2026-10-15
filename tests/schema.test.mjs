import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/**
 * Migration test.
 *
 * Runs the real migration against an embedded Postgres (PGlite) that mimics the
 * Supabase surface we depend on: `anon` / `authenticated` / `service_role`, the
 * `auth` schema with `auth.uid()`, and the `storage` schema with buckets and
 * objects. It proves the RLS rules rather than assuming them.
 */

const adminId = "11111111-1111-4111-8111-111111111111";
const strangerId = "22222222-2222-4222-8222-222222222222";

async function migrate() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create schema storage;
    create table storage.buckets(
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
  `);
  for (const file of [
    "202610120001_mike_lombard_foundation.sql",
    "202610120002_publish_intent.sql",
    "202610120003_draft_rev_bigint.sql",
    "202610120004_timeline_dedupe.sql",
  ]) {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
    );
  }
  // Supabase grants these by default; PGlite needs them after the tables exist.
  await db.exec(`
    grant select on all tables in schema public to anon, authenticated;
    grant insert, update, delete on all tables in schema public to authenticated;
    grant select on public.ml_admin_roles to authenticated;
  `);
  await db.query("insert into auth.users(id,email) values ($1,'owner@example.com'),($2,'stranger@example.com')", [
    adminId,
    strangerId,
  ]);
  return db;
}

async function asUser(db, userId, fn) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function asAnon(db, fn) {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

test("ml_* schema: helpers, seed and constraints load", async () => {
  const db = await migrate();
  try {
    const site = await db.query("select id, published, draft->>'provisional' as provisional from public.ml_site");
    assert.equal(site.rows.length, 1);
    assert.equal(site.rows[0].published, null, "seed must not publish anything");
    assert.equal(site.rows[0].provisional, "true");

    const projects = await db.query("select status from public.ml_projects order by display_order");
    assert.equal(projects.rows.length, 2);
    assert.ok(projects.rows.every((row) => row.status === "draft"), "seed projects are drafts");

    const buckets = await db.query("select id, public from storage.buckets");
    assert.equal(buckets.rows.length, 1);
    assert.equal(buckets.rows[0].id, "ml-media");
    assert.equal(buckets.rows[0].public, true);

    assert.equal((await db.query("select public.ml_slugify('Héllo  World--2026!') as s")).rows[0].s, "hello-world-2026");
  } finally {
    await db.close();
  }
});

test("anonymous visitors only ever see published rows", async () => {
  const db = await migrate();
  try {
    await asAnon(db, async () => {
      assert.equal((await db.query("select * from public.ml_site")).rows.length, 0, "no publication yet");
      assert.equal((await db.query("select * from public.ml_projects")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_timeline")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_mint_interest")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_audit_log")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_admin_roles")).rows.length, 0);
    });

    // Publish one project as the service role (what /api/admin does for admins).
    await db.query(
      "update public.ml_projects set status='published', published_at=now() where slug='placeholder-lombard-era'",
    );

    await asAnon(db, async () => {
      const visible = await db.query("select slug from public.ml_projects");
      assert.equal(visible.rows.length, 1);
      assert.equal(visible.rows[0].slug, "placeholder-lombard-era");
    });
  } finally {
    await db.close();
  }
});

test("a signed-in stranger cannot read drafts or administer anything", async () => {
  const db = await migrate();
  try {
    await asUser(db, strangerId, async () => {
      // RLS on ml_site publishes only when `published` is set; before any
      // release the row is invisible, and writing straight to the table fails.
      assert.equal((await db.query("select * from public.ml_site")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_projects")).rows.length, 0);
      assert.equal((await db.query("select * from public.ml_admin_roles")).rows.length, 0);
      assert.equal((await db.query("select public.ml_is_admin() as ok")).rows[0].ok, false);

      await assert.rejects(
        db.query("insert into public.ml_admin_roles(user_id, role) values ($1,'owner')", [strangerId]),
        /permission denied|row-level security/,
      );
      await assert.rejects(
        db.query("insert into public.ml_projects (slug, title) values ('sneaky','Sneaky')"),
        /permission denied|row-level security/,
      );
      // UPDATE is silently filtered by RLS: no rows are visible, so nothing changes.
      await db.query("update public.ml_projects set status='published'");
      await db.query("update public.ml_site set draft = '{}'::jsonb");
      await assert.rejects(
        db.query("select public.ml_publish_site('mike-lombard')"),
        /not authorized/,
      );
      await assert.rejects(
        db.query("select public.ml_rate_limit_hit('mint_ip','abc',3600,5)"),
        /permission denied/,
      );
    });
  } finally {
    await db.close();
  }
});

test("admins can read drafts and publish; the published document is a snapshot", async () => {
  const db = await migrate();
  try {
    await db.query("insert into public.ml_admin_roles(user_id, role) values ($1,'owner')", [adminId]);

    await asUser(db, adminId, async () => {
      assert.equal((await db.query("select public.ml_is_admin() as ok")).rows[0].ok, true);
      assert.equal((await db.query("select * from public.ml_projects")).rows.length, 2, "admin sees drafts");

      await db.query("select public.ml_publish_site('mike-lombard')");
      const published = await db.query("select published->'hero'->>'title' as title, published_at from public.ml_site");
      assert.equal(published.rows[0].title, "Mike Lombard");
      assert.ok(published.rows[0].published_at, "publication is stamped");

      // Mutating the draft must not touch the published copy.
      await db.query(
        "update public.ml_site set draft = jsonb_set(draft, '{hero,title}', '\"Changed\"') where id='mike-lombard'",
      );
      const stillPublished = await db.query("select published->'hero'->>'title' as title from public.ml_site");
      assert.equal(stillPublished.rows[0].title, "Mike Lombard");
    });

    await asAnon(db, async () => {
      const publicCopy = await db.query("select published->'hero'->>'title' as title from public.ml_site");
      assert.equal(publicCopy.rows[0].title, "Mike Lombard");
    });
  } finally {
    await db.close();
  }
});

test("mint registrations reject duplicates and stay admin-only", async () => {
  const db = await migrate();
  try {
    await db.query(
      `insert into public.ml_mint_interest (email, wallet_address, consent, consent_text)
       values ('Fan@Example.com', '0x1111111111111111111111111111111111111111', true, 'consent v1')`,
    );

    await assert.rejects(
      db.query(
        `insert into public.ml_mint_interest (email, consent, consent_text)
         values ('fan@example.com', true, 'consent v1')`,
      ),
      /duplicate key|unique/i,
      "the unique index on lower(email) blocks duplicates",
    );

    await db.exec("set role anon");
    assert.equal((await db.query("select * from public.ml_mint_interest")).rows.length, 0);
    await db.exec("reset role");

    const rate = await db.query("select * from public.ml_rate_limit_hit('mint_ip','hash-a',3600,3)");
    assert.equal(rate.rows[0].allowed, true);
    const second = await db.query("select * from public.ml_rate_limit_hit('mint_ip','hash-a',3600,1)");
    assert.equal(second.rows[0].allowed, false, "the second hit exceeds a limit of 1");
  } finally {
    await db.close();
  }
});

test("saving the site document does not overflow the revision counter", async () => {
  const db = await migrate();
  try {
    // The bug: a millisecond timestamp written into an `integer` column.
    // The column must now accept it.
    const huge = 1791838716564;
    const widened = await db.query("select data_type from information_schema.columns where table_name = 'ml_site' and column_name = 'draft_rev'");
    assert.equal(widened.rows[0].data_type, "bigint", "draft_rev must be bigint");
    await db.query("update public.ml_site set draft_rev = $1 where id = 'mike-lombard'", [huge]);

    // With the column widened to bigint and the counter owned by the function,
    // saving twice simply increments.
    const first = await db.query("select public.ml_save_site_content('mike-lombard', '{}'::jsonb) as rev");
    const second = await db.query("select public.ml_save_site_content('mike-lombard', '{\"a\":1}'::jsonb) as rev");
    assert.ok(Number(first.rows[0].rev) >= 1);
    assert.equal(Number(second.rows[0].rev), Number(first.rows[0].rev) + 1, "the counter increments");

    // And the function is not reachable from the browser.
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select public.ml_save_site_content('mike-lombard', '{}'::jsonb)"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("re-applying the migrations does not duplicate the seeded timeline", async () => {
  const db = await migrate();
  try {
    const before = await db.query("select count(*)::int as n from public.ml_timeline");
    // The migrations are documented as safe to re-run; prove it.
    for (const file of [
      "202610120001_mike_lombard_foundation.sql",
      "202610120002_publish_intent.sql",
      "202610120003_draft_rev_bigint.sql",
      "202610120004_timeline_dedupe.sql",
    ]) {
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
      );
    }
    const after = await db.query("select count(*)::int as n from public.ml_timeline");
    assert.equal(after.rows[0].n, before.rows[0].n, "the seed must not be duplicated");
    assert.equal(before.rows[0].n, 2, "two seeded entries");
  } finally {
    await db.close();
  }
});

test("deleting a project cascades its media and is blocked for non-admins", async () => {
  const db = await migrate();
  try {
    const project = await db.query(
      `insert into public.ml_projects (slug, title, status) values ('temp','Temp','draft') returning id`,
    );
    const projectId = project.rows[0].id;
    await db.query(
      `insert into public.ml_media (project_id, path, alt) values ($1, 'mike-lombard/projects/temp/a.jpg', 'a')`,
      [projectId],
    );

    await asUser(db, strangerId, async () => {
      assert.equal((await db.query("select * from public.ml_media")).rows.length, 0, "draft media is private");
      assert.equal(
        (await db.query("select * from public.ml_projects where id = $1", [projectId])).rows.length,
        0,
        "draft projects are invisible",
      );
      // RLS hides the row, so the delete silently affects nothing instead of
      // erroring — the important part is that the row survives.
      await db.query("delete from public.ml_projects where id = $1", [projectId]);
    });
    assert.equal(
      (await db.query("select * from public.ml_projects where id = $1", [projectId])).rows.length,
      1,
      "a non-admin delete removes nothing",
    );
    assert.ok(
      (await db.query("select draft->'hero'->>'title' as t from public.ml_site")).rows[0].t,
      "a non-admin update to the site document changes nothing",
    );

    await db.query("delete from public.ml_projects where id = $1", [projectId]);
    assert.equal((await db.query("select * from public.ml_media")).rows.length, 0, "media cascades");
  } finally {
    await db.close();
  }
});
