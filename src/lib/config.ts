/**
 * Environment access, centralised.
 *
 * Rule of the house: anything secret is read only from `src/lib/server/**` and
 * never re-exported towards a Client Component. `NEXT_PUBLIC_*` values reach the
 * browser by design and are protected by RLS at the database.
 */

export const SITE_ID = process.env.ML_SITE_ID ?? "mike-lombard";
export const MEDIA_BUCKET = process.env.ML_MEDIA_BUCKET ?? "ml-media";
/** Path prefix inside the shared Supabase project, so the bucket can be reused. */
export const MEDIA_PREFIX = process.env.ML_MEDIA_PREFIX ?? "mike-lombard";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export const appOrigin =
  process.env.APP_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3000";

/**
 * Supabase Image Transformations are a paid-plan feature. When enabled we ask
 * the storage CDN for a right-sized derivative; otherwise Next.js resizes the
 * original. Either way the browser never downloads a 6000px master for a card.
 */
export const imageTransforms = process.env.NEXT_PUBLIC_ML_IMAGE_TRANSFORMS === "1";

/** True when a real Supabase project is reachable from the server. */
export const hasSupabasePublic = Boolean(supabaseUrl && supabasePublicKey);
export const hasSupabaseService = Boolean(
  supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/** ApeChain mainnet — the chain Mingles lives on. */
export const APECHAIN_ID = 33139;
export const APECHAIN_RPC =
  process.env.APECHAIN_RPC_URL ?? "https://rpc.apechain.com/http";

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
