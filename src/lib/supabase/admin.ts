import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl as publicUrl } from "@/lib/config";
import { inlinedValue } from "@/lib/server/runtime-config";

/**
 * Configuration for server-side Supabase access.
 *
 * The inlined copies win: on Amplify the SSR runtime is a packaged Lambda and an
 * environment file written during the build does not reliably survive into the
 * runtime working directory. That is exactly how the service-role key went
 * missing in production while being present at build time.
 */
const supabaseUrl = inlinedValue("NEXT_PUBLIC_SUPABASE_URL") ?? publicUrl;
function serviceKey(): string {
  return inlinedValue("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}
export const hasServiceKey = Boolean(supabaseUrl && serviceKey());

/**
 * Service-role client. BYPASSES RLS — never import this from a Client Component
 * and never return raw rows to the browser without shaping them first.
 *
 * `import "server-only"` makes an accidental client import a build error.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  // A key pasted with quotes or a trailing newline is rejected by Supabase with
  // a 401 "Unauthorized"; lib/config strips those before they get here.
  const key = serviceKey();
  if (!supabaseUrl || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  cached ??= createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
