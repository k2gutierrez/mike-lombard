#!/usr/bin/env node
/**
 * Applies the SQL migrations in `supabase/migrations` to the Supabase project
 * referenced by NEXT_PUBLIC_SUPABASE_URL.
 *
 * Uses the Supabase Management API, so it needs a Personal Access Token:
 *   https://supabase.com/dashboard/account/tokens
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply
 *
 * The token is only read from the environment (or `.env.local`, which is
 * gitignored). It is never written to disk by this script and never sent
 * anywhere except api.supabase.com.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function loadEnvLocal() {
  try {
    const raw = await readFile(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local is optional.
  }
}

function projectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const ref = new URL(url).hostname.split(".")[0];
  if (!ref) throw new Error(`Could not read the project ref from ${url}`);
  return ref;
}

async function runSql(ref, token, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? payload.message
        : text;
    throw new Error(`SQL failed (${response.status}): ${message}`);
  }
  return payload;
}

async function main() {
  await loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(`
Missing SUPABASE_ACCESS_TOKEN.

  1. Open https://supabase.com/dashboard/account/tokens
  2. Create a token named "mike-lombard-setup" (1 day is enough)
  3. Run:  SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply

Alternatively paste supabase/migrations/*.sql into the project's SQL editor.
`);
    process.exit(2);
  }

  const ref = projectRef();
  const dir = path.join(root, "supabase/migrations");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();

  if (!files.length) {
    console.error("No migrations found in supabase/migrations");
    process.exit(2);
  }

  console.log(`Project: ${ref}`);
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), "utf8");
    process.stdout.write(`→ ${file} (${(sql.length / 1024).toFixed(1)} kB) … `);
    await runSql(ref, token, sql);
    console.log("ok");
  }

  // Verify the objects we expect actually exist.
  const check = await runSql(
    ref,
    token,
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'ml\\_%' order by table_name`,
  );
  const tables = (Array.isArray(check) ? check : []).map((row) => row.table_name);
  console.log(`\nTables: ${tables.join(", ") || "(none)"}`);

  const bucket = await runSql(
    ref,
    token,
    `select id, public, file_size_limit from storage.buckets where id = 'ml-media'`,
  );
  console.log("Bucket:", Array.isArray(bucket) && bucket[0] ? bucket[0] : "(missing)");

  const policies = await runSql(
    ref,
    token,
    `select tablename, count(*)::int as policies from pg_policies
      where schemaname in ('public','storage') and (tablename like 'ml\\_%' or tablename = 'objects')
      group by tablename order by tablename`,
  );
  console.log("RLS policies:", policies);

  // Promote every configured administrator email that already has an account.
  const emails = (process.env.ML_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length) {
    const list = emails.map((email) => `'${email.replace(/'/g, "''")}'`).join(", ");
    const promoted = await runSql(
      ref,
      token,
      `insert into public.ml_admin_roles (user_id, role)
       select id, 'owner' from auth.users where lower(email) in (${list})
       on conflict (user_id) do nothing
       returning user_id`,
    );
    console.log(
      `Admin roles: ${Array.isArray(promoted) ? promoted.length : 0} grant(s) for ${emails.join(", ")}`,
    );
  } else {
    console.log(
      "Admin roles: ML_ADMIN_EMAILS is empty. Set it to the artist's email and rerun, or insert the row manually.",
    );
  }

  console.log(`
Done. Next:
  1. Sign in at /admin/login with the administrator email.
  2. Publish once so the public document exists.
  3. Revoke the access token at https://supabase.com/dashboard/account/tokens
`);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
