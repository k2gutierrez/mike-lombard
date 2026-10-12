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
