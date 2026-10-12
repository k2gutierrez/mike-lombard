import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { appOrigin, hasSupabaseService } from "@/lib/config";
import { recordMintInterest, hitRateLimit } from "@/lib/server/admin-data";
import {
  cleanOptionalText,
  looksLikeSpam,
  normalizeEmail,
  normalizeEvmAddress,
  validateEmail,
} from "@/lib/validation";
import type { MintInterestInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public mint-interest endpoint.
 *
 * Design notes:
 *  - The browser can never insert into `ml_mint_interest` (no RLS policy), so
 *    every submission passes through this validation and the rate limiter.
 *  - Duplicates are reported as success: the form is idempotent and the message
 *    never discloses whether an address was already registered.
 *  - No payment, token approval or transaction is requested anywhere.
 */

const WINDOW_SECONDS = 60 * 60;
const MAX_PER_IP = 5;
const MAX_PER_EMAIL = 3;

function hash(value: string): string {
  return createHash("sha256")
    .update(`${process.env.ML_HASH_SALT ?? "ml-portfolio"}:${value}`)
    .digest("hex")
    .slice(0, 40);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasSupabaseService) {
    return json(
      {
        ok: false,
        error:
          "Registration is not available on this environment yet: the server has no Supabase connection. Try again once the deployment is configured.",
      },
      503,
    );
  }

  let body: Partial<MintInterestInput>;
  try {
    body = (await request.json()) as Partial<MintInterestInput>;
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const emailError = validateEmail(email);
  if (emailError) return json({ ok: false, field: "email", error: emailError }, 400);

  const consent = body.consent === true;
  if (!consent) {
    return json(
      {
        ok: false,
        field: "consent",
        error: "We need your explicit consent to email you about this mint.",
      },
      400,
    );
  }

  let wallet: string | null = null;
  const rawWallet = String(body.walletAddress ?? "").trim();
  if (rawWallet) {
    const parsed = normalizeEvmAddress(rawWallet);
    if (!parsed.ok) return json({ ok: false, field: "wallet", error: parsed.error }, 400);
    wallet = parsed.address;
  }

  const spam = looksLikeSpam({
    honeypot: String(body.honeypot ?? ""),
    elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : null,
    email,
  });
  if (spam) return json({ ok: false, error: spam }, 400);

  const ip = clientIp(request);
  const ipHash = hash(`ip:${ip}`);
  const emailHash = hash(`email:${email}`);

  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      hitRateLimit({
        bucket: "mint_ip",
        subject: ipHash,
        windowSeconds: WINDOW_SECONDS,
        max: MAX_PER_IP,
      }),
      hitRateLimit({
        bucket: "mint_email",
        subject: emailHash,
        windowSeconds: WINDOW_SECONDS,
        max: MAX_PER_EMAIL,
      }),
    ]);

    if (!ipAllowed || !emailAllowed) {
      return json(
        {
          ok: false,
          error: "Too many attempts from this connection. Please try again in an hour.",
        },
        429,
      );
    }

    const { duplicate } = await recordMintInterest({
      email,
      wallet_address: wallet,
      wallet_chain_id: body.walletChainId ?? null,
      wallet_source: wallet ? (body.walletSource ?? "manual") : null,
      consent: true,
      consent_text: cleanOptionalText(body.consentText, 240) ?? "consent-given",
      consent_at: new Date().toISOString(),
      locale: cleanOptionalText(body.locale, 12),
      source: cleanOptionalText(body.source, 60) ?? "mint-page",
      referrer: cleanOptionalText(body.referrer, 300),
      ip_hash: ipHash,
      user_agent: cleanOptionalText(request.headers.get("user-agent"), 300),
      note: null,
    });

    return json({
      ok: true,
      duplicate,
      message: duplicate
        ? "You were already on the list. Nothing else to do."
        : "You are on the list. We will only email you about this mint.",
    });
  } catch (error) {
    console.error("[mint] registration failed", error);
    return json(
      { ok: false, error: "Something failed on our side. Please try again." },
      500,
    );
  }
}

/** Small helper used by the client to log the origin it posted from. */
export function GET() {
  return json({ ok: true, origin: appOrigin, supabase: hasSupabaseService });
}
