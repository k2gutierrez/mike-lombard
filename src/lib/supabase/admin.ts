import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "@/lib/config";

/**
 * Service-role client. BYPASSES RLS — never import this from a Client Component
 * and never return raw rows to the browser without shaping them first.
 *
 * `import "server-only"` makes an accidental client import a build error.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  // Read through the sanitiser in lib/config: a key pasted with quotes or a
  // trailing newline is rejected by Supabase with a 401 "Unauthorized".
  const key = supabaseServiceKey;
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
