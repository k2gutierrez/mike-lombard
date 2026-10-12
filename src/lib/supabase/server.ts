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
      setAll(cookiesToSet, headers) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            if (key.toLowerCase() === "set-cookie") continue;
            cookieStore.set(key, value);
          }
        } catch {
          // Called from a Server Component render: cookies are read-only there.
          // Session refresh happens in `proxy.ts`, so this is safe to ignore.
        }
      },
    },
  });
}
