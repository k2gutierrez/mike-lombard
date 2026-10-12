import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appOrigin as publicOrigin, hasSupabaseService } from "@/lib/config";
import { inlinedValue } from "@/lib/server/runtime-config";

const appOrigin = inlinedValue("APP_ORIGIN") ?? publicOrigin;
import { isAdminEmail } from "@/lib/server/auth";
import { hitRateLimit } from "@/lib/server/admin-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail, validateEmail } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin sign-in.
 *
 * The email is checked against `ml_admin_roles` (and the `ML_ADMIN_EMAILS`
 * allowlist for first-time onboarding) BEFORE anything is sent. That matters:
 * the shared Supabase project has open sign-up, so without this gate anybody
 * could create an account. Creating an account still grants nothing — RLS and
 * every write endpoint re-check the role — but we do not hand out sessions to
 * strangers either.
 *
 * `generateLink` returns the action link directly, so sign-in works even before
 * custom SMTP is configured. To switch to real magic-link emails, set
 * `ML_AUTH_MODE=email` (see docs/03-SUPABASE-SETUP.md).
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 6;

function hash(value: string): string {
  return createHash("sha256")
    .update(`${process.env.ML_HASH_SALT ?? "ml-portfolio"}:${value}`)
    .digest("hex")
    .slice(0, 40);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasSupabaseService) {
    return json(
      {
        ok: false,
        error:
          "Sign-in needs Supabase. Configure the project URL and the service-role key, then reload.",
      },
      503,
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const error = validateEmail(email);
  if (error) return json({ ok: false, field: "email", error }, 400);

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : (request.headers.get("x-real-ip") ?? "unknown");
  const allowed = await hitRateLimit({
    bucket: "admin_login",
    subject: hash(`ip:${ip}`),
    windowSeconds: WINDOW_SECONDS,
    max: MAX_ATTEMPTS,
  });
  if (!allowed) {
    return json({ ok: false, error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  const admin = createSupabaseAdminClient();

  // 1. Is this email actually an administrator of this portfolio?
  let authorised = isAdminEmail(email);
  if (!authorised) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = users?.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) {
      const { data: role } = await admin
        .from("ml_admin_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      authorised = Boolean(role);
    }
  }

  // Same response either way: never disclose whether an email is registered.
  if (!authorised) {
    return json({
      ok: true,
      mode: "sent",
      message:
        "If that email has access, a sign-in link is on its way. Check the inbox and the spam folder.",
    });
  }

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appOrigin}/admin` },
  });

  if (linkError || !data) {
    console.error("[auth] generateLink failed", linkError?.message);
    return json({ ok: false, error: "Could not create the sign-in link. Try again." }, 502);
  }

  const actionLink = data.properties?.action_link;
  const hashedToken = data.properties?.hashed_token;

  const wantsEmail = process.env.ML_AUTH_MODE === "email";

  // Optionally send the real email through Supabase's mailer.
  if (wantsEmail) {
    const { error: otpError } = await admin.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${appOrigin}/admin` },
    });
    if (otpError) console.error("[auth] signInWithOtp failed", otpError.message);
    return json({
      ok: true,
      mode: "sent",
      message: "Check your inbox for the sign-in link.",
    });
  }

  // Direct hand-off: no email infrastructure required. The token is one-time and
  // is consumed immediately by /auth/callback.
  return json({
    ok: true,
    mode: "handoff",
    url: hashedToken
      ? `/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`
      : actionLink,
    message: "Signing you in…",
  });
}
