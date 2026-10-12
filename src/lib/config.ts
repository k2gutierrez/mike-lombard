/**
 * Environment access, centralised.
 *
 * Rule of the house: anything secret is read only from `src/lib/server/**` and
 * never re-exported towards a Client Component. `NEXT_PUBLIC_*` values reach the
 * browser by design and are protected by RLS at the database.
 */

/**
 * This module is imported by Client Components and by the test suite, so it must
 * stay free of `server-only` dependencies. Server secrets are read in
 * `src/lib/server/*`, which may prefer values baked into the build by
 * `scripts/generate-runtime-config.mjs`.
 */

/**
 * Reads an environment variable and repairs the mistakes that are easy to make
 * when pasting a value into a hosting console:
 *
 *  * wrapping quotes (`"eyJ..."` or `'eyJ...'`) — the console keeps them, and a
 *    quoted JWT is rejected by Supabase with a 401,
 *  * surrounding whitespace, including a pasted trailing newline,
 *  * a leading `export ` copied from a shell.
 *
 * A malformed key is worse than a missing one: the panel looks configured and
 * every Supabase call fails with "Unauthorized".
 */
function envValue(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";

  let value = raw.trim();
  if (value.startsWith("export ")) value = value.slice("export ".length).trim();

  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first) && value.length > 1) {
    value = value.slice(1, -1).trim();
  }

  // Newlines or spaces inside a pasted value would also corrupt the header.
  return value.replace(/\s+/g, "");
}

/** True when the value was present but needed cleaning, so we can warn about it. */
function wasQuoted(name: string): boolean {
  const raw = process.env[name];
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  return /^["']/.test(value) || value.startsWith("export ");
}

export const SITE_ID = process.env.ML_SITE_ID?.trim() || "mike-lombard";
export const MEDIA_BUCKET = process.env.ML_MEDIA_BUCKET?.trim() || "ml-media";
/** Path prefix inside the shared Supabase project, so the bucket can be reused. */
export const MEDIA_PREFIX = process.env.ML_MEDIA_PREFIX?.trim() || "mike-lombard";

export const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
export const supabasePublicKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const supabaseServiceKey = envValue("SUPABASE_SERVICE_ROLE_KEY");

export const siteUrl =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim().replace(/\/$/, "");

export const appOrigin =
  (process.env.APP_ORIGIN ?? "http://localhost:3000").trim().replace(/\/$/, "");

/**
 * Supabase Image Transformations are a paid-plan feature. When enabled we ask
 * the storage CDN for a right-sized derivative; otherwise Next.js resizes the
 * original. Either way the browser never downloads a 6000px master for a card.
 */
export const imageTransforms = envValue("NEXT_PUBLIC_ML_IMAGE_TRANSFORMS") === "1";

/** True when a real Supabase project is reachable from the server. */
export const hasSupabasePublic = Boolean(supabaseUrl && supabasePublicKey);
export const hasSupabaseService = Boolean(supabaseUrl && supabaseServiceKey);

export const walletConnectProjectId = envValue("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");

/** ApeChain mainnet — the chain Mingles lives on. */
export const APECHAIN_ID = 33139;
export const APECHAIN_RPC = envValue("APECHAIN_RPC_URL") || "https://rpc.apechain.com/http";

/** Upload ceilings. Mirrored in the API route and in the docs. */
export const LIMITS = {
  image: { bytes: 20 * 1024 * 1024, label: "20 MB" },
  video: { bytes: 200 * 1024 * 1024, label: "200 MB" },
  poster: { bytes: 8 * 1024 * 1024, label: "8 MB" },
} as const;

export const IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const VIDEO_MIME = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type EnvIssue = {
  level: "fatal" | "warning";
  variable: string;
  message: string;
};

/**
 * Server-side configuration check, surfaced in the admin UI. A misconfigured
 * deployment should say what is wrong instead of silently falling back to demo
 * mode or blaming the visitor with a bare "Unauthorized".
 */
export function inspectEnvironment(overrides: Record<string, string> = {}): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const valueOf = (name: string, fallback: string) => overrides[name] || fallback;

  const serviceKey = valueOf("SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey);
  const publicKey = valueOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabasePublicKey);
  const projectUrl = valueOf("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);

  const required: Array<[string, string]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", projectUrl],
    [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      valueOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabasePublicKey),
    ],
    ["SUPABASE_SERVICE_ROLE_KEY", valueOf("SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey)],
  ];
  for (const [variable, value] of required) {
    if (!value) {
      issues.push({ level: "fatal", variable, message: "is not set in this environment." });
    }
  }

  if (projectUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl)) {
    issues.push({
      level: "warning",
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      message: `does not look like a Supabase project URL (got "${projectUrl}").`,
    });
  }

  // The publishable key and the service key are different secrets. Pasted into
  // the wrong variable, the server authenticates as the wrong role and Supabase
  // answers 401 — which the panel then shows as "Unauthorized".
  if (serviceKey && serviceKey === publicKey) {
    issues.push({
      level: "fatal",
      variable: "SUPABASE_SERVICE_ROLE_KEY",
      message: "is identical to the publishable key. They must be different.",
    });
  }
  if (serviceKey && serviceKey.startsWith("sb_publishable_")) {
    issues.push({
      level: "fatal",
      variable: "SUPABASE_SERVICE_ROLE_KEY",
      message: "holds a publishable key. It needs the service_role key.",
    });
  }

  for (const variable of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]) {
    if (process.env[variable] && wasQuoted(variable)) {
      issues.push({
        level: "warning",
        variable,
        message: "arrived with surrounding quotes or whitespace; it was cleaned up automatically.",
      });
    }
  }

  if (!process.env.ML_ADMIN_EMAILS?.trim()) {
    issues.push({
      level: "warning",
      variable: "ML_ADMIN_EMAILS",
      message:
        "is empty, so no new administrator can be onboarded. Existing rows in ml_admin_roles still work.",
    });
  }

  if (/localhost|127\.0\.0\.1/.test(appOrigin)) {
    issues.push({
      level: "warning",
      variable: "APP_ORIGIN",
      message: `points at ${appOrigin}. Sign-in redirects will leave the deployed site.`,
    });
  }

  return issues;
}
