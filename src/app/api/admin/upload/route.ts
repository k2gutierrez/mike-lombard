import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { MEDIA_BUCKET, MEDIA_PREFIX, hasSupabaseService } from "@/lib/config";
import { extensionFor } from "@/lib/media";
import { UnauthorizedError, recordAudit, requireAdmin } from "@/lib/server/auth";
import { validateUpload } from "@/lib/server/files";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanOptionalText, cleanText, slugify } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw-body upload endpoint.
 *
 * Why raw bytes and query params instead of multipart: the browser can report
 * real upload progress with `xhr.upload.onprogress`, and the server can sniff
 * magic bytes without buffering a multipart parser. The body is streamed through
 * `arrayBuffer()` once — for the 20 MB image limit that is trivial, and for video
 * the ceiling is enforced before any bytes are stored.
 */

const MAX_BYTES = 200 * 1024 * 1024;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function safeName(input: string | null): string {
  const base = slugify(input ?? "") || "file";
  return base.slice(0, 48);
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) return bad("Not authorized.", 401);
    return bad("Not authorized.", 401);
  }

  if (!hasSupabaseService) {
    return bad(
      "Uploads need Supabase Storage. Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      503,
    );
  }

  const url = new URL(request.url);
  const expect = url.searchParams.get("expect") === "video" ? "video" : "image";
  const scope = url.searchParams.get("scope") === "site" ? "site" : "project";
  const projectId = cleanOptionalText(url.searchParams.get("projectId"), 60);
  const filename = url.searchParams.get("filename");
  const declaredMime = cleanText(url.searchParams.get("mime"), 80);
  const lengthHeader = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(lengthHeader) && lengthHeader > MAX_BYTES) {
    return bad("That file is larger than the 200 MB ceiling.", 413);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return bad("The upload was interrupted.");
  }

  if (bytes.byteLength > MAX_BYTES) return bad("That file is larger than the 200 MB ceiling.", 413);

  const validation = await validateUpload({
    head: bytes.subarray(0, 32),
    declaredMime,
    size: bytes.byteLength,
    expect,
  });
  if (!validation.ok) return bad(validation.error, 415);

  const supabase = createSupabaseAdminClient();
  const ext = extensionFor(validation.file.mime, filename ?? undefined);
  const folder = projectId ? `projects/${projectId}` : "site";
  const path = `${MEDIA_PREFIX}/${folder}/${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, {
      contentType: validation.file.mime,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error("[upload] storage error", uploadError.message);
    return bad(`Storage rejected the file: ${uploadError.message}`, 502);
  }

  const width = Number(url.searchParams.get("width"));
  const height = Number(url.searchParams.get("height"));
  const duration = Number(url.searchParams.get("duration"));
  const posterTime = Number(url.searchParams.get("posterTime"));
  const alt = cleanText(url.searchParams.get("alt"), 300);
  const caption = cleanOptionalText(url.searchParams.get("caption"), 400);

  const { data: last } = await supabase
    .from("ml_media")
    .select("display_order")
    .eq(projectId ? "project_id" : "scope", projectId ?? "site")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row, error: insertError } = await supabase
    .from("ml_media")
    .insert({
      project_id: projectId,
      scope,
      kind: validation.file.kind,
      bucket: MEDIA_BUCKET,
      path,
      poster_path: null,
      poster_time: Number.isFinite(posterTime) ? posterTime : null,
      alt: alt || safeName(filename),
      caption,
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
      duration_s: Number.isFinite(duration) && duration > 0 ? duration : null,
      bytes: validation.file.bytes,
      mime: validation.file.mime,
      display_order: (Number(last?.display_order ?? 0) || 0) + 10,
    })
    .select("*")
    .single();

  if (insertError) {
    // Never leave an orphan object behind.
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return bad(`Could not save the media record: ${insertError.message}`, 500);
  }

  // First image of a project becomes its cover automatically (Mike can change it).
  if (projectId && validation.file.kind === "image") {
    const { data: project } = await supabase
      .from("ml_projects")
      .select("cover_media_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project?.cover_media_id) {
      await supabase.from("ml_projects").update({ cover_media_id: row.id }).eq("id", projectId);
    }
  }

  await recordAudit({
    actor: admin,
    action: "upload-media",
    entity: "ml_media",
    entityId: String(row.id),
    detail: { path, kind: validation.file.kind, bytes: validation.file.bytes },
  });

  return NextResponse.json({ ok: true, media: row });
}

/** Uploading a poster is the same validation path, scoped to images only. */
export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return bad("Not authorized.", 401);
  }
  if (!hasSupabaseService) return bad("Uploads need Supabase Storage.", 503);

  const url = new URL(request.url);
  const mediaId = cleanText(url.searchParams.get("mediaId"), 60);
  const filename = url.searchParams.get("filename");
  if (!mediaId) return bad("Missing media id.");

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return bad("The upload was interrupted.");
  }

  const validation = await validateUpload({
    head: bytes.subarray(0, 32),
    declaredMime: cleanText(url.searchParams.get("mime"), 80),
    size: bytes.byteLength,
    expect: "image",
  });
  if (!validation.ok) return bad(validation.error, 415);

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("ml_media")
    .select("id, path, project_id")
    .eq("id", mediaId)
    .maybeSingle();
  if (!existing) return bad("That media row no longer exists.", 404);

  const ext = extensionFor(validation.file.mime, filename ?? undefined);
  const posterPath = `${existing.path.replace(/\.[a-z0-9]+$/i, "")}-poster.${ext}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(posterPath, bytes, {
      contentType: validation.file.mime,
      cacheControl: "31536000",
      upsert: true,
    });
  if (error) return bad(`Storage rejected the poster: ${error.message}`, 502);

  const { error: updateError } = await supabase
    .from("ml_media")
    .update({ poster_path: posterPath, poster_time: null })
    .eq("id", mediaId);
  if (updateError) return bad(updateError.message, 500);

  await recordAudit({ actor: admin, action: "upload-poster", entity: "ml_media", entityId: mediaId });
  return NextResponse.json({ ok: true, posterPath });
}
