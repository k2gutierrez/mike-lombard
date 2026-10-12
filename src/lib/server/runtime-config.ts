import "server-only";
import { runtimeConfig } from "@/lib/server/runtime-config.generated";

/**
 * Configuration values baked into the deployment at build time.
 *
 * Why this indirection exists: `src/lib/config.ts` is imported by Client
 * Components too, so it cannot import the generated file directly — the
 * `server-only` guard would fail the build (which is the point of the guard).
 * Keeping the inlined values behind a server-only module means the secret is
 * reachable from the server and structurally unreachable from the browser.
 *
 * `scripts/generate-runtime-config.mjs` writes the generated file during the
 * build. When nothing was inlined (local development, tests), this returns
 * undefined and callers fall back to `process.env`, which Next.js loads from
 * `.env.local`.
 */
export function inlinedValue(name: string): string | undefined {
  const value = runtimeConfig[name];
  return typeof value === "string" && value.length ? value : undefined;
}

/**
 * Configuration values for the server, honouring the build-time copies.
 *
 * These exist because `src/lib/config.ts` is universal and can only see
 * `process.env`. Anything that runs on the server should read them from here.
 */
export const serverConfig = {
  supabaseUrl: inlinedValue("NEXT_PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublicKey:
    inlinedValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "",
  supabaseServiceKey:
    inlinedValue("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appOrigin: inlinedValue("APP_ORIGIN") ?? process.env.APP_ORIGIN ?? "",
  siteUrl: inlinedValue("NEXT_PUBLIC_SITE_URL") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "",
} as const;

/** True when the server can talk to Supabase with full privileges. */
export function serverHasSupabase(): boolean {
  return Boolean(serverConfig.supabaseUrl && serverConfig.supabaseServiceKey);
}

/**
 * Names-only diagnostic. Answers the question that is otherwise invisible from
 * outside the deployment: did the build bake the value in, and does the running
 * process also see it in its environment? No value is ever returned.
 */
export function configurationReport() {
  const probe = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_ORIGIN",
    "NEXT_PUBLIC_SITE_URL",
    "ML_ADMIN_EMAILS",
    "ML_AUTH_MODE",
    "ML_HASH_SALT",
  ] as const;

  const inlined: string[] = [];
  const environment: string[] = [];
  for (const name of probe) {
    if (inlinedValue(name)) inlined.push(name);
    if (process.env[name]) environment.push(name);
  }

  // Every other variable this process can see. Amplify always injects a large
  // set of its own (AWS_*, _HANDLER, LAMBDA_*…), so the list is grouped and
  // capped. Names only — a typo like "SUPABASE_SERVICE_ROLE_KEY " or
  // "SUPABASE_SERVICE_KEY" is invisible unless the names are listed.
  const interesting = Object.keys(process.env)
    .filter((key) => /SUPABASE|ML_|APP_ORIGIN|SITE_URL/i.test(key))
    .filter((key) => !probe.includes(key as (typeof probe)[number]))
    .sort()
    .slice(0, 30);

  return {
    inlinedKeys: inlined,
    environmentKeys: environment,
    /** Config-looking variables whose names we do not expect. Suspect typos. */
    unexpectedConfigKeys: interesting,
    /** Where the service-role key was found, if anywhere. */
    serviceKeySource: inlinedValue("SUPABASE_SERVICE_ROLE_KEY")
      ? "build"
      : process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "runtime-env"
        : "missing",
  };
}
