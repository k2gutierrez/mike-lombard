import {
  IMAGE_MIME,
  MEDIA_BUCKET,
  VIDEO_MIME,
  imageTransforms,
  supabaseUrl,
} from "@/lib/config";
import type { MediaItem, MediaKind } from "@/lib/types";

export type { MediaItem, MediaKind };

/** Extension → MIME map for the formats we accept on upload. */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extensionFor(mime: string, fallbackName?: string): string {
  const known = EXT_BY_MIME[mime];
  if (known) return known;
  const fromName = fallbackName?.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : "bin";
}

/**
 * Media Fragment URI: appending `#t=2.5` to a video URL makes the browser show
 * that frame as the static poster until playback starts. It gives every video a
 * poster with **zero extra bytes and zero transcoding**, which is the whole
 * point for a portfolio with many files. Mike can override it with his own
 * uploaded poster when he wants exact art direction.
 */
export function withPosterFragment(url: string, posterTime: number | null | undefined) {
  if (posterTime == null || Number.isNaN(posterTime)) return url;
  return `${url}#t=${Math.max(0, posterTime).toFixed(2)}`;
}

/**
 * Public URL for a stored object. When Supabase Image Transformations are
 * enabled we request a right-sized derivative instead of the master file.
 */
export function publicMediaUrl(
  path: string,
  options?: { width?: number; quality?: number; bucket?: string; transforms?: boolean },
): string {
  const bucket = options?.bucket ?? MEDIA_BUCKET;
  const base = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  const wantsTransform = options?.transforms ?? imageTransforms;
  if (!wantsTransform || !options?.width) return base;
  const params = new URLSearchParams({
    width: String(Math.round(options.width)),
    quality: String(options.quality ?? 78),
    resize: "contain",
  });
  return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}?${params}`;
}

export function isImageMime(mime: string) {
  return (IMAGE_MIME as readonly string[]).includes(mime);
}

export function isVideoMime(mime: string) {
  return (VIDEO_MIME as readonly string[]).includes(mime);
}

export function kindForMime(mime: string): MediaKind | null {
  if (isImageMime(mime)) return "image";
  if (isVideoMime(mime)) return "video";
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Aspect ratio as a CSS `aspect-ratio` value, with a sane fallback. */
export function aspectRatio(media: Pick<MediaItem, "width" | "height" | "kind">): string {
  if (media.width && media.height) return `${media.width} / ${media.height}`;
  return media.kind === "video" ? "16 / 9" : "4 / 5";
}

/**
 * The cover of a project: an explicitly chosen media row, otherwise the first
 * image, otherwise the first video.
 */
export function coverOf(
  media: MediaItem[],
  coverMediaId?: string | null,
): MediaItem | undefined {
  if (coverMediaId) {
    const explicit = media.find((m) => m.id === coverMediaId);
    if (explicit) return explicit;
  }
  return media.find((m) => m.kind === "image") ?? media[0];
}

/** Rewrites storage paths into absolute URLs and sorts by `display_order`. */
export function decorateMedia(
  row: Record<string, unknown>,
  options?: { bucket?: string },
): MediaItem {
  const path = String(row.path ?? "");
  const posterPath = (row.poster_path as string | null) ?? null;
  const bucket = (row.bucket as string) ?? options?.bucket ?? MEDIA_BUCKET;
  return {
    id: String(row.id),
    projectId: (row.project_id as string | null) ?? null,
    scope: (row.scope as MediaItem["scope"]) ?? "project",
    kind: (row.kind as MediaKind) ?? "image",
    bucket,
    path,
    posterPath,
    posterTime: row.poster_time == null ? null : Number(row.poster_time),
    alt: (row.alt as string) ?? "",
    caption: (row.caption as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    durationS: row.duration_s == null ? null : Number(row.duration_s),
    bytes: row.bytes == null ? null : Number(row.bytes),
    mime: (row.mime as string | null) ?? null,
    order: Number(row.display_order ?? 0),
    url: path ? publicMediaUrl(path, { bucket }) : "",
    posterUrl: posterPath ? publicMediaUrl(posterPath, { bucket }) : null,
  };
}

export function sortMedia(media: MediaItem[]): MediaItem[] {
  return [...media].sort((a, b) => a.order - b.order);
}

/**
 * The still shown before playback: an uploaded poster wins, otherwise the
 * fragment offset, otherwise nothing (the video element then shows its own
 * first frame once metadata loads).
 */
export function posterSrc(media: MediaItem): string | null {
  if (media.posterUrl) return media.posterUrl;
  if (media.kind === "video" && media.posterTime != null && media.url) {
    return withPosterFragment(media.url, media.posterTime);
  }
  return null;
}
