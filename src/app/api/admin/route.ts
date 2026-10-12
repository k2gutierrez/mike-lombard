import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/load-content";
import {
  UnauthorizedError,
  recordAudit,
  requireAdmin,
} from "@/lib/server/auth";
import {
  deleteMedia,
  deleteProject,
  deleteTimelineEntry,
  publishAll,
  reorderMedia,
  reorderProjects,
  reorderTimeline,
  revertToPublished,
  saveProject,
  saveSiteContent,
  saveTimelineEntry,
  setProjectCover,
  updateMedia,
} from "@/lib/server/admin-data";
import { cleanOptionalText, cleanText } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single write endpoint for the admin panel.
 *
 * Every action re-checks the session and the `ml_admin_roles` membership on the
 * server. The browser never receives the service key, and RLS denies mutations
 * to `authenticated`, so this dispatcher is the only write path.
 */

type Action =
  | "save-content"
  | "save-project"
  | "delete-project"
  | "reorder-projects"
  | "set-cover"
  | "save-timeline"
  | "delete-timeline"
  | "reorder-timeline"
  | "update-media"
  | "delete-media"
  | "reorder-media"
  | "publish"
  | "revert";

const ACTIONS: Action[] = [
  "save-content",
  "save-project",
  "delete-project",
  "reorder-projects",
  "set-cover",
  "save-timeline",
  "delete-timeline",
  "reorder-timeline",
  "update-media",
  "delete-media",
  "reorder-media",
  "publish",
  "revert",
];

/**
 * Public pages are cached (ISR). `revalidateTag` marks the cached entries from
 * `loadSite` stale; `revalidatePath("/", "layout")` covers every route under the
 * site layout, so a publish is visible on the next request without a redeploy.
 */
function revalidatePublic() {
  revalidateTag(CONTENT_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

function fail(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error("[admin]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function idList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string").slice(0, 500);
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return fail(error);
  }

  let body: { action?: string; payload?: unknown };
  try {
    body = (await request.json()) as { action?: string; payload?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const action = body.action as Action | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const payload = (body.payload ?? {}) as Record<string, unknown>;

  try {
    switch (action) {
      case "save-content": {
        const content = await saveSiteContent(payload.content ?? payload);
        await recordAudit({ actor: admin, action, entity: "ml_site", entityId: "mike-lombard" });
        return NextResponse.json({ ok: true, content });
      }
      case "save-project": {
        const project = await saveProject(payload.project ?? payload);
        await recordAudit({
          actor: admin,
          action,
          entity: "ml_projects",
          entityId: project.id,
          detail: { slug: project.slug, status: project.status },
        });
        return NextResponse.json({ ok: true, project });
      }
      case "delete-project": {
        const id = cleanText(payload.id, 60);
        if (!id) throw new Error("Missing project id.");
        await deleteProject(id);
        await recordAudit({ actor: admin, action, entity: "ml_projects", entityId: id });
        revalidatePublic();
        return NextResponse.json({ ok: true });
      }
      case "reorder-projects": {
        const ids = idList(payload.ids);
        if (!ids.length) throw new Error("Nothing to reorder.");
        await reorderProjects(ids);
        await recordAudit({ actor: admin, action, entity: "ml_projects" });
        return NextResponse.json({ ok: true });
      }
      case "set-cover": {
        const projectId = cleanText(payload.projectId, 60);
        const mediaId = cleanOptionalText(payload.mediaId, 60);
        if (!projectId) throw new Error("Missing project id.");
        await setProjectCover(projectId, mediaId);
        await recordAudit({ actor: admin, action, entity: "ml_projects", entityId: projectId });
        return NextResponse.json({ ok: true });
      }
      case "save-timeline": {
        const entry = await saveTimelineEntry(payload.entry ?? payload);
        await recordAudit({ actor: admin, action, entity: "ml_timeline" });
        return NextResponse.json({ ok: true, entry });
      }
      case "delete-timeline": {
        const id = cleanText(payload.id, 60);
        if (!id) throw new Error("Missing entry id.");
        await deleteTimelineEntry(id);
        await recordAudit({ actor: admin, action, entity: "ml_timeline", entityId: id });
        revalidatePublic();
        return NextResponse.json({ ok: true });
      }
      case "reorder-timeline": {
        const ids = idList(payload.ids);
        if (!ids.length) throw new Error("Nothing to reorder.");
        await reorderTimeline(ids);
        await recordAudit({ actor: admin, action, entity: "ml_timeline" });
        return NextResponse.json({ ok: true });
      }
      case "update-media": {
        const id = cleanText(payload.id, 60);
        if (!id) throw new Error("Missing media id.");
        const year = Number(payload.year);
        await updateMedia(id, {
          alt: cleanText(payload.alt, 300),
          caption: cleanOptionalText(payload.caption, 400),
          year: Number.isFinite(year) && year > 1800 && year < 2200 ? Math.round(year) : null,
        });
        await recordAudit({ actor: admin, action, entity: "ml_media", entityId: id });
        return NextResponse.json({ ok: true });
      }
      case "delete-media": {
        const id = cleanText(payload.id, 60);
        if (!id) throw new Error("Missing media id.");
        await deleteMedia(id);
        await recordAudit({ actor: admin, action, entity: "ml_media", entityId: id });
        revalidatePublic();
        return NextResponse.json({ ok: true });
      }
      case "reorder-media": {
        const ids = idList(payload.ids);
        if (!ids.length) throw new Error("Nothing to reorder.");
        await reorderMedia(ids);
        await recordAudit({ actor: admin, action, entity: "ml_media" });
        return NextResponse.json({ ok: true });
      }
      case "publish": {
        const result = await publishAll();
        await recordAudit({
          actor: admin,
          action,
          entity: "ml_site",
          entityId: "mike-lombard",
          detail: result,
        });
        // Public pages are cached; invalidate so a publish is visible at once.
        revalidatePublic();
        return NextResponse.json({ ok: true, ...result });
      }
      case "revert": {
        const reverted = await revertToPublished();
        await recordAudit({ actor: admin, action, entity: "ml_site", entityId: "mike-lombard" });
        revalidatePublic();
        return NextResponse.json({ ok: true, reverted });
      }
      default:
        return NextResponse.json({ ok: false, error: "Unhandled action." }, { status: 400 });
    }
  } catch (error) {
    return fail(error);
  }
}
