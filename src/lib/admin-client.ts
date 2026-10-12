"use client";

/**
 * Client-side upload helper.
 *
 * Uses `XMLHttpRequest` on purpose: it is the only browser API that reports real
 * upload progress, which is what the admin progress bars are driven by. Files go
 * to our own route handler, which validates and then writes to Supabase Storage —
 * the service key never reaches the browser.
 */

export type UploadKind = "image" | "video";

export type UploadResult =
  | { ok: true; media: UploadedMedia }
  | { ok: false; error: string };

export type UploadedMedia = {
  id: string;
  kind: UploadKind;
  path: string;
  poster_path: string | null;
  poster_time: number | null;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  bytes: number | null;
  mime: string | null;
  display_order: number;
  project_id: string | null;
  scope: string;
  bucket: string;
};

export type UploadOptions = {
  file: File;
  kind: UploadKind;
  scope: "project" | "site";
  projectId?: string | null;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  duration?: number;
  posterTime?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/** Video poster moment, in seconds. Long enough to skip a black first frame. */
export const POSTER_TIME = 1.2;

export function uploadMedia(options: UploadOptions): Promise<UploadResult> {
  const params = new URLSearchParams({
    expect: options.kind,
    scope: options.scope,
    filename: options.file.name,
    mime: options.file.type || "application/octet-stream",
  });
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.alt) params.set("alt", options.alt);
  if (options.caption) params.set("caption", options.caption);
  if (options.width) params.set("width", String(Math.round(options.width)));
  if (options.height) params.set("height", String(Math.round(options.height)));
  if (options.duration) params.set("duration", String(options.duration));
  if (options.posterTime && options.kind === "video") {
    params.set("posterTime", String(options.posterTime));
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/upload?${params.toString()}`);
    xhr.responseType = "json";
    xhr.setRequestHeader(
      "content-type",
      options.file.type || "application/octet-stream",
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      const payload = (xhr.response ?? {}) as { ok?: boolean; media?: UploadedMedia; error?: string };
      options.onProgress?.(100);
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.media) {
        resolve({ ok: true, media: payload.media });
      } else {
        resolve({ ok: false, error: payload.error ?? `Upload failed (${xhr.status}).` });
      }
    };

    xhr.onerror = () => resolve({ ok: false, error: "Network error during upload." });
    xhr.onabort = () => resolve({ ok: false, error: "Upload cancelled." });

    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(options.file);
  });
}

/** Reads intrinsic dimensions in the browser; the server stores what we report. */
export function readImageSize(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

/** Reads duration for the video metadata badge and the upload list. */
export function readVideoMeta(
  file: File | Blob,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ width: 0, height: 0, duration: 0 });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

/**
 * Grabs a frame with canvas so a video has a real poster image when the artist
 * wants art-directed control instead of the free Media Fragment poster.
 */
export async function captureVideoFrame(file: File, atSecond = POSTER_TIME): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video error"));
      video.src = url;
    });

    const seekTo = Math.min(atSecond, Math.max(0.1, (video.duration || 2) / 4));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek error"));
      video.currentTime = seekTo;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 1280, 1920);
    canvas.height = Math.round(
      (canvas.width / (video.videoWidth || 1280)) * (video.videoHeight || 720),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.85),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function uploadPoster(mediaId: string, blob: Blob): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    mediaId,
    filename: "poster.webp",
    mime: blob.type || "image/webp",
  });
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", `/api/admin/upload?${params.toString()}`);
    xhr.responseType = "json";
    xhr.setRequestHeader("content-type", blob.type || "image/webp");
    xhr.onload = () => {
      const payload = (xhr.response ?? {}) as { ok?: boolean; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok) resolve({ ok: true });
      else resolve({ ok: false, error: payload.error ?? `Poster failed (${xhr.status}).` });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error." });
    xhr.send(blob);
  });
}

/** One call per admin action; all writes funnel through the same endpoint. */
export async function adminAction<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || !data.ok) {
      if (response.status === 401) {
        return {
          ok: false,
          error:
            "Your session is not authorised for this panel. Sign in again at /admin/login — and check that your email has an administrator role.",
        };
      }
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : `Request failed (${response.status}).`,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
