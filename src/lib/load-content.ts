import "server-only";
import { SITE_ID, hasSupabasePublic } from "@/lib/config";
import { decorateMedia, sortMedia, type MediaItem } from "@/lib/media";
import {
  previewContent,
  previewMedia,
  previewProjects,
  previewTimeline,
} from "@/lib/preview-content";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "@/lib/config";
import type { Project, SiteContent, TimelineEntry } from "@/lib/types";

export type LoadMode = "live" | "preview";

export type LoadedSite = {
  content: SiteContent;
  projects: Project[];
  timeline: TimelineEntry[];
  siteMedia: MediaItem[];
  mode: LoadMode;
  /** Set when Supabase answered but with a problem we want to surface in logs. */
  warning?: string;
  fetchedAt: string;
};

/**
 * Cache tag used by the admin publish action to invalidate every public page at
 * once, so a publish is visible immediately instead of waiting for the window.
 */
export const CONTENT_TAG = "ml-content";
/** Safety net: content also refreshes on its own every 5 minutes. */
export const CONTENT_REVALIDATE = 300;

type Options = {
  /** Include rows still in draft (admin preview only). */
  includeDrafts?: boolean;
  /** Render the provisional document instead of touching Supabase. */
  preview?: boolean;
};

/**
 * Read-only anon client. The publishable key + RLS guarantee that a draft row is
 * never returned, even if this function asked for it.
 */
function anonClient() {
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Deep merge that keeps newly added fields working on older documents. */
function mergeContent(base: SiteContent, incoming: unknown): SiteContent {
  const source =
    incoming && typeof incoming === "object" ? (incoming as Partial<SiteContent>) : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(source)) {
    const fallback = (base as unknown as Record<string, unknown>)[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      fallback &&
      typeof fallback === "object" &&
      !Array.isArray(fallback)
    ) {
      out[key] = { ...(fallback as object), ...(value as object) };
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out as SiteContent;
}

function toProjects(
  rows: Record<string, unknown>[],
  mediaByProject: Map<string, MediaItem[]>,
): Project[] {
  return rows.map((row) => {
    const id = String(row.id);
    return {
      id,
      slug: String(row.slug),
      title: String(row.title),
      subtitle: (row.subtitle as string | null) ?? null,
      year: (row.year as number | null) ?? null,
      category: (row.category as string) ?? "work",
      excerpt: (row.excerpt as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      client: (row.client as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      externalUrl: (row.external_url as string | null) ?? null,
      status: (row.status as Project["status"]) ?? "draft",
      order: Number(row.display_order ?? 0),
      featured: Boolean(row.featured),
      featuredRank: (row.featured_rank as number | null) ?? null,
      publishedAt: (row.published_at as string | null) ?? null,
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
      coverMediaId: (row.cover_media_id as string | null) ?? null,
      media: sortMedia(mediaByProject.get(id) ?? []),
    };
  });
}

function toTimeline(
  rows: Record<string, unknown>[],
  mediaById: Map<string, MediaItem>,
): TimelineEntry[] {
  return rows.map((row) => ({
    id: String(row.id),
    yearLabel: String(row.year_label ?? ""),
    sortYear: (row.sort_year as number | null) ?? null,
    sortMonth: (row.sort_month as number | null) ?? null,
    title: String(row.title ?? ""),
    kind: (row.kind as TimelineEntry["kind"]) ?? "milestone",
    place: (row.place as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    linkUrl: (row.link_url as string | null) ?? null,
    mediaId: (row.media_id as string | null) ?? null,
    status: (row.status as TimelineEntry["status"]) ?? "draft",
    order: Number(row.display_order ?? 0),
    media: row.media_id ? (mediaById.get(String(row.media_id)) ?? null) : null,
  }));
}

async function readSite(options: Options): Promise<LoadedSite> {
  const supabase = anonClient();
  const includeDrafts = Boolean(options.includeDrafts);

  const [siteResult, projectResult, mediaResult, timelineResult] = await Promise.all([
    supabase.from("ml_site").select("published, draft").eq("id", SITE_ID).maybeSingle(),
    supabase.from("ml_projects").select("*").order("display_order", { ascending: true }),
    supabase.from("ml_media").select("*").order("display_order", { ascending: true }),
    supabase.from("ml_timeline").select("*").order("display_order", { ascending: true }),
  ]);

  const firstError =
    siteResult.error ?? projectResult.error ?? mediaResult.error ?? timelineResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const document = includeDrafts
    ? (siteResult.data?.draft ?? siteResult.data?.published)
    : siteResult.data?.published;

  const content = mergeContent(
    { ...previewContent, updatedAt: new Date().toISOString() },
    document ?? {},
  );

  const siteMedia = (mediaResult.data ?? [])
    .filter((row) => row.scope === "site" || row.project_id === null)
    .map((row) => decorateMedia(row));

  const siteMediaById = new Map(siteMedia.map((item) => [item.id, item]));

  const mediaByProject = new Map<string, MediaItem[]>();
  for (const row of mediaResult.data ?? []) {
    if (!row.project_id) continue;
    const key = String(row.project_id);
    const list = mediaByProject.get(key) ?? [];
    list.push(decorateMedia(row));
    mediaByProject.set(key, list);
  }

  return {
    content,
    projects: toProjects(projectResult.data ?? [], mediaByProject),
    timeline: toTimeline(timelineResult.data ?? [], siteMediaById),
    siteMedia,
    mode: "live",
    fetchedAt: new Date().toISOString(),
  };
}

function previewSite(): LoadedSite {
  return {
    content: { ...previewContent, updatedAt: new Date().toISOString() },
    projects: previewProjects,
    timeline: previewTimeline,
    siteMedia: previewMedia,
    mode: "preview",
    fetchedAt: new Date().toISOString(),
  };
}

/** Public read path. Falls back to the provisional document if Supabase is down. */
export async function loadSite(options: Options = {}): Promise<LoadedSite> {
  if (options.preview || !hasSupabasePublic) return previewSite();
  try {
    return await readSite(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[content] falling back to preview: ${message}`);
    return { ...previewSite(), warning: message };
  }
}

export async function loadProject(
  slug: string,
  options: Options = {},
): Promise<{ project: Project | null; site: LoadedSite }> {
  const site = await loadSite(options);
  const project = site.projects.find((item) => item.slug === slug) ?? null;
  return { project, site };
}

export function categoriesOf(site: LoadedSite): string[] {
  const fromProjects = site.projects.map((project) => project.category);
  const configured = site.content.works.categories ?? [];
  return [...new Set([...configured, ...fromProjects].filter(Boolean))].sort();
}

export function featuredProjects(site: LoadedSite): Project[] {
  const ids = site.content.featured.projectIds ?? [];
  const byId = ids
    .map((id) => site.projects.find((project) => project.id === id))
    .filter((project): project is Project => Boolean(project));
  if (byId.length) return byId;

  const ranked = site.projects
    .filter((project) => project.featured)
    .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999));
  if (ranked.length) return ranked;

  return site.projects.slice(0, 4);
}
