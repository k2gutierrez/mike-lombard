import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "@/lib/config";

/**
 * Cookie-bound Supabase client for Server Components, Server Actions and Route
 * Handlers. Uses the publishable key, so every query is still filtered by RLS.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Supabase also reports HTTP cache headers here. They must NOT be turned
        // into cookies (`Set-Cookie: Cache-Control=…` is invalid and can make a
        // browser drop the whole cookie batch). They are applied by `proxy.ts`
        // and by the auth callback, which own a real Response object.
        try {
          for (const { name, value, options } of cookiesToSet) {
            if (!/^[A-Za-z0-9._-]+$/.test(name)) continue;
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render: cookies are read-only there.
          // Session refresh happens in `proxy.ts`, so this is safe to ignore.
        }
      },
    },
  });
}
