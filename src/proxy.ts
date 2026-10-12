import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl } from "@/lib/config";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`.
 *
 * Its single job here is refreshing the Supabase session cookie before a render
 * touches it, so an admin session does not expire mid-edit. Authorisation is NOT
 * decided here — every page and route re-checks the role on the server.
 */
export async function proxy(request: NextRequest) {
  if (!supabaseUrl || !supabasePublicKey) return NextResponse.next();

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "");
      },
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet);
        Object.assign(pendingHeaders, headers ?? {});
      },
    },
  });

  // Triggers the refresh when the access token is close to expiring.
  await supabase.auth.getClaims();

  const response = NextResponse.next({ request });

  for (const { name, value, options } of pendingCookies) {
    response.headers.append("set-cookie", serializeCookieHeader(name, value, options));
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    if (key.toLowerCase() === "set-cookie") continue;
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  // Skip static assets and images: only pages and API routes need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|mp4|webm)$).*)"],
};
