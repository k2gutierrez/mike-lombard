import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl as publicUrl } from "@/lib/config";
import { inlinedValue } from "@/lib/server/runtime-config";

const supabaseUrl = inlinedValue("NEXT_PUBLIC_SUPABASE_URL") ?? publicUrl;

/**
 * Completes a Supabase email sign-in.
 *
 * Why this does not use the `cookies()` adapter: @supabase/ssr hands back a
 * second argument of HTTP *response headers* (`Cache-Control`, `Pragma`,
 * `Expires`) alongside the auth cookies. Writing those through `cookies().set()`
 * produces `Set-Cookie: Cache-Control=…`, which is invalid and can make a browser
 * discard the whole `Set-Cookie` batch — including the session. Here the cookies
 * go on the response object exactly as Supabase specifies them, and the headers
 * are set as real headers on the same response.
 *
 * Returns the redirect target when a session was established, otherwise null.
 */
export async function completeEmailSignIn(
  request: NextRequest,
  params: { code?: string | null; tokenHash?: string | null; type?: string | null },
): Promise<{ response: NextResponse; ok: boolean }> {
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "");
      },
      setAll(cookiesToSet, headers) {
        // Strip anything that is not a cookie; only `name=value` pairs belong in
        // a Set-Cookie header.
        for (const cookie of cookiesToSet) {
          if (!/^[A-Za-z0-9._-]+$/.test(cookie.name)) continue;
          pendingCookies.push(cookie);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          if (key.toLowerCase() === "set-cookie") continue;
          pendingHeaders[key] = value;
        }
      },
    },
  });

  let ok = false;
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    ok = !error;
    if (error) console.error("[auth] exchangeCodeForSession:", error.message);
  } else if (params.tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: (params.type ?? "magiclink") as "magiclink" | "email",
      token_hash: params.tokenHash,
    });
    ok = !error;
    if (error) console.error("[auth] verifyOtp:", error.message);
  }

  /**
   * Redirect to the origin the request actually came in on, not to a configured
   * one. `APP_ORIGIN` is the production domain, so using it here bounced a local
   * sign-in to the deployed site and came back as `?error=expired` — the token
   * had already been consumed. The origin of the request is always correct:
   * localhost locally, the real domain in production.
   */
  const url = new URL(request.url);
  const target = new URL(ok ? "/admin" : "/admin/login", url.origin);
  if (!ok) target.searchParams.set("error", "expired");

  const response = NextResponse.redirect(target);
  for (const { name, value, options } of pendingCookies) {
    response.headers.append("set-cookie", serializeCookieHeader(name, value, options));
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    response.headers.set(key, value);
  }

  return { response, ok };
}
