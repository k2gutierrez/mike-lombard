#!/usr/bin/env node
/**
 * Backend health check. Prints what is configured and what actually answers.
 *
 *   npm run check:backend
 *
 * Never prints keys — only whether they are present and what the server replied.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function loadEnvLocal() {
  try {
    const raw = await readFile(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key]) continue;
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

const ok = (label, detail = "") => console.log(`  \u2713 ${label}${detail ? `  ${detail}` : ""}`);
const bad = (label, detail = "") => console.log(`  \u2717 ${label}${detail ? `  ${detail}` : ""}`);

async function main() {
  await loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("\nEnvironment");
  url ? ok("NEXT_PUBLIC_SUPABASE_URL", url) : bad("NEXT_PUBLIC_SUPABASE_URL missing");
  anon ? ok("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY present") : bad("publishable key missing");
  service ? ok("SUPABASE_SERVICE_ROLE_KEY present (server only)") : bad("service-role key missing");
  process.env.ML_ADMIN_EMAILS
    ? ok("ML_ADMIN_EMAILS", process.env.ML_ADMIN_EMAILS)
    : bad("ML_ADMIN_EMAILS empty — no new admin can be onboarded from the allowlist");

  if (!url || !anon) {
    console.log("\nFill .env.local from .env.example and reload.\n");
    process.exit(1);
  }

  console.log("\nSchema (anonymous, publishable key — must succeed)");
  const publicClient = createClient(url, anon, { auth: { persistSession: false } });
  let schemaMissing = false;
  for (const table of ["ml_site", "ml_projects", "ml_media", "ml_timeline"]) {
    // NOTE: a HEAD request (`head: true`) returns 204 even for a missing table,
    // so this must fetch a row to be a real check.
    const { error } = await publicClient.from(table).select("id").limit(1);
    if (!error) {
      ok(`${table} readable through RLS`);
      continue;
    }
    // PGRST205 = the table is not in PostgREST's schema cache: it does not exist.
    if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
      schemaMissing = true;
      bad(`${table} does not exist yet`);
    } else {
      bad(`${table} unreachable`, `${error.code ?? ""} ${error.message}`);
    }
  }
  if (schemaMissing) {
    console.log("\n  → Apply the migration first:  SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply");
  }

  console.log("\nPrivate tables (anonymous — must be denied or empty)");
  for (const table of ["ml_mint_interest", "ml_admin_roles", "ml_audit_log", "ml_rate_limit"]) {
    const { error, count } = await publicClient
      .from(table)
      .select("*", { count: "exact" });
    if (error) {
      if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
        bad(`${table} does not exist yet`);
      } else {
        ok(`${table} denied to anonymous`, error.code ?? "");
      }
    } else if (!count) ok(`${table} returns no rows to anonymous`);
    else bad(`${table} LEAKS ${count} rows to anonymous!`);
  }

  if (service) {
    console.log("\nStorage (service role)");
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) bad("could not list buckets", error.message);
    else {
      const bucket = buckets?.find((item) => item.name === "ml-media");
      bucket
        ? ok("ml-media bucket", `public=${bucket.public} limit=${bucket.file_size_limit}`)
        : bad("ml-media bucket missing — run npm run db:apply");
    }

    const { count, error: mintError } = await admin
      .from("ml_mint_interest")
      .select("*", { count: "exact" });
    mintError ? bad("ml_mint_interest unreachable", mintError.message) : ok(`ml_mint_interest readable (${count ?? 0} rows)`);

    const { count: admins, error: adminError } = await admin
      .from("ml_admin_roles")
      .select("*", { count: "exact" });
    adminError ? bad("ml_admin_roles unreachable", adminError.message) : ok(`${admins ?? 0} administrator(s)`);
    if (!adminError && !admins) {
      bad("nobody can administer the panel yet — set ML_ADMIN_EMAILS and rerun npm run db:apply");
    }
  }

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
