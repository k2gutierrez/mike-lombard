#!/usr/bin/env node
/**
 * Bakes the server-side secrets into the deployment at build time.
 *
 * Why this exists
 * ---------------
 * Next.js loads `.env.production` at *runtime* on a normal server. On Amplify
 * Hosting the SSR compute is a packaged Lambda, and a file written to the build
 * workspace does not necessarily exist in the runtime's working directory — which
 * is exactly what happened: the variable was present during the build, the file
 * was written, and the deployed server still reported it missing.
 *
 * Inlining is the mechanism that cannot be lost: the value is written into a
 * generated module that Next.js bundles for the server, so it is part of the
 * deployment artifact itself.
 *
 * Safety
 * ------
 *  * The generated file is gitignored (`src/lib/server/runtime-config.generated.ts`).
 *  * Nothing here is printed to the log — only variable *names*, never values.
 *  * The module is imported exclusively from server-only code, and the generated
 *    file itself starts with `import "server-only"`, so it becomes a build error
 *    if a Client Component ever imports it.
 *  * Set `ML_RUNTIME_INLINE=0` to skip generation (the app then falls back to
 *    reading `process.env` at runtime).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, "src/lib/server/runtime-config.generated.ts");

/** Same normalisation the app applies: quotes, `export ` and stray whitespace. */
function clean(raw) {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (value.startsWith("export ")) value = value.slice("export ".length).trim();
  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first) && value.length > 1) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/\s+/g, "");
}

const INLINE_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "APP_ORIGIN",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
];

if (process.env.ML_RUNTIME_INLINE === "0") {
  console.log("[runtime-config] ML_RUNTIME_INLINE=0, skipping generation");
  process.exit(0);
}

const entries = [];
const present = [];
const missing = [];

for (const key of INLINE_KEYS) {
  const value = clean(process.env[key]);
  if (value) {
    entries.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
    present.push(key);
  } else {
    missing.push(key);
  }
}

const source = `// GENERATED FILE — do not edit, do not commit.
// Produced by scripts/generate-runtime-config.mjs during the build so that the
// packaged SSR runtime has the configuration even when an environment file does
// not survive packaging. Regenerated on every build.
import "server-only";

export const runtimeConfig: Record<string, string> = {
${entries.join("\n")}
};
`;

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, source, "utf8");

console.log(`[runtime-config] wrote ${present.length} value(s) to ${path.relative(root, target)}`);
console.log(`[runtime-config] inlined: ${present.join(", ") || "(none)"}`);
if (missing.length) {
  console.log(`[runtime-config] not set in this build: ${missing.join(", ")}`);
}
