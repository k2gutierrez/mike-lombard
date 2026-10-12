import { isAddress, getAddress } from "viem";

/**
 * Pure validation helpers — imported by both the browser form and the server
 * route, so the rules can never drift apart. No `server-only` import here on
 * purpose: the API route re-runs every one of these checks.
 */

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function validateEmail(input: string): string | null {
  const email = normalizeEmail(input);
  if (!email) return "Enter your email address.";
  if (email.length > 254) return "That email address is too long.";
  if (!EMAIL_RE.test(email)) return "That email address does not look valid.";
  const [local, domain] = email.split("@");
  if (local.length > 64) return "That email address is too long.";
  if (domain.includes("..")) return "That email address does not look valid.";
  return null;
}

/**
 * EVM address validation. A valid checksum is respected; an all-lowercase or
 * all-uppercase address is accepted and normalised to its checksum form.
 *
 * NOTE: a syntactically valid address proves nothing about ownership. Nothing
 * in this project treats a typed or connected address as verified.
 */
export function normalizeEvmAddress(
  input: string,
): { ok: true; address: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter a wallet address." };
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return { ok: false, error: "An EVM address is 0x followed by 40 hex characters." };
  }
  if (!isAddress(raw, { strict: true })) {
    return {
      ok: false,
      error: "That address has an invalid checksum. Paste it again, all lowercase.",
    };
  }
  try {
    return { ok: true, address: getAddress(raw).toLowerCase() };
  } catch {
    return { ok: false, error: "That address could not be normalised." };
  }
}

/** Cheap bot heuristics. The server-side rate limit is the real control. */
export function looksLikeSpam(payload: {
  honeypot?: string;
  elapsedMs?: number | null;
  email?: string;
}): string | null {
  if (payload.honeypot && payload.honeypot.trim().length > 0) {
    return "Submission rejected.";
  }
  if (payload.elapsedMs != null && payload.elapsedMs < 1200) {
    return "That was too fast — take a second and try again.";
  }
  const email = payload.email ?? "";
  if (/(.)\1{7,}/.test(email)) return "That email address does not look valid.";
  return null;
}

/** Trims, collapses blank lines and caps the length of user-entered text. */
export function cleanText(input: unknown, max = 2000): string {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function cleanOptionalText(input: unknown, max = 2000): string | null {
  const value = cleanText(input, max);
  return value.length ? value : null;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Internal path or absolute http(s) link. Anything else (`javascript:`,
 * `data:`, protocol-relative) is rejected, so no href in the content document
 * can smuggle a script or an off-site redirect past the sanitiser.
 */
export function cleanHref(input: unknown, fallback = "/"): string {
  const value = cleanText(input, 300);
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return cleanUrl(value) ?? fallback;
}

/** Only http(s) links are allowed anywhere in the content. */
export function cleanUrl(input: unknown): string | null {
  const value = cleanText(input, 500);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
