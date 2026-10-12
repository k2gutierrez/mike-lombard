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
