import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_ID, hasSupabaseService } from "@/lib/config";
import { decorateMedia, sortMedia, type MediaItem } from "@/lib/media";
import {
  previewContent,
  previewMedia,
  previewProjects,
  previewTimeline,
} from "@/lib/preview-content";
import { sanitizeSiteContent, sanitizeProject, sanitizeTimeline } from "@/lib/sanitize";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/validation";
import type {
  MintInterestRecord,
  Project,
  SiteContent,
  TimelineEntry,
} from "@/lib/types";

/**
 * Local-only store used when Supabase is not configured. It keeps the admin
 * panel explorable without credentials; nothing here is ever trusted in
 * production, and the UI says so explicitly.
 */
const demoStore = {
  content: { ...previewContent, updatedAt: new Date().toISOString() } as SiteContent,
  published: null as SiteContent | null,
  projects: [...previewProjects],
  timeline: [...previewTimeline],
  media: [...previewMedia] as MediaItem[],
  mint: [] as MintInterestRecord[],
};

export type AdminDocument = {
  content: SiteContent;
  published: SiteContent | null;
  projects: Project[];
  timeline: TimelineEntry[];
  media: MediaItem[];
  publishedAt: string | null;
  mode: "live" | "demo";
};

function client(): SupabaseClient | null {
  if (!hasSupabaseService) return null;
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

export function hasLiveBackend(): boolean {
  return client() !== null;
}

export async function loadAdminDocument(): Promise<AdminDocument> {
  const supabase = client();
  if (!supabase) {
    return {
      content: demoStore.content,
      published: demoStore.published,
      projects: demoStore.projects,
      timeline: demoStore.timeline,
      media: demoStore.media,
      publishedAt: null,
      mode: "demo",
    };
  }

  const [site, projects, media, timeline] = await Promise.all([
    supabase.from("ml_site").select("draft, published, published_at").eq("id", SITE_ID).maybeSingle(),
    supabase.from("ml_projects").select("*").order("display_order", { ascending: true }),
    supabase.from("ml_media").select("*").order("display_order", { ascending: true }),
    supabase.from("ml_timeline").select("*").order("display_order", { ascending: true }),
  ]);

  if (site.error) throw new Error(site.error.message);
  if (projects.error) throw new Error(projects.error.message);
  if (media.error) throw new Error(media.error.message);
  if (timeline.error) throw new Error(timeline.error.message);

  const allMedia = (media.data ?? []).map((row) => decorateMedia(row));
  const siteMedia = allMedia.filter((item) => item.scope === "site" || !item.projectId);

  const byProject = new Map<string, MediaItem[]>();
  for (const item of allMedia) {
    if (!item.projectId) continue;
    const list = byProject.get(item.projectId) ?? [];
    list.push(item);
    byProject.set(item.projectId, list);
  }

  const projectRows: Project[] = (projects.data ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: (row.subtitle as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    category: String(row.category ?? "work"),
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
    media: sortMedia(byProject.get(String(row.id)) ?? []),
  }));

  const mediaById = new Map(siteMedia.map((item) => [item.id, item]));

  const timelineRows: TimelineEntry[] = (timeline.data ?? []).map((row) => ({
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

  const draft = site.data?.draft ?? null;
  const content = draft
    ? sanitizeSiteContent(draft)
    : { ...previewContent, updatedAt: new Date().toISOString() };

  return {
    content,
    published: site.data?.published ? sanitizeSiteContent(site.data.published) : null,
    projects: projectRows,
    timeline: timelineRows,
    media: allMedia,
    publishedAt: (site.data?.published_at as string | null) ?? null,
    mode: "live",
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function ensureUniqueSlug(
  supabase: SupabaseClient,
  desired: string,
  currentId: string | null,
): Promise<string> {
  const base = slugify(desired) || `work-${Date.now().toString(36)}`;
  let candidate = base;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const query = supabase.from("ml_projects").select("id").eq("slug", candidate).limit(1);
    const { data } = await query;
    const taken = (data ?? []).some((row) => String(row.id) !== currentId);
    if (!taken) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function saveSiteContent(input: unknown): Promise<SiteContent> {
  const content = sanitizeSiteContent(input);
  const supabase = client();
  if (!supabase) {
    demoStore.content = content;
    return content;
  }
  const { error } = await supabase.from("ml_site").upsert(
    {
      id: SITE_ID,
      draft: content,
      draft_rev: Date.now(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  return content;
}

export async function saveProject(input: unknown): Promise<Project> {
  const parsed = sanitizeProject(input);
  if (!parsed.title) throw new Error("A project needs a title.");
  const supabase = client();

  if (!supabase) {
    const existing = demoStore.projects.find((item) => item.id === parsed.id);
    const project: Project = {
      ...parsed,
      id: parsed.id || `demo-${Date.now().toString(36)}`,
      slug: slugify(parsed.slug || parsed.title),
      publishedAt: existing?.publishedAt ?? null,
      updatedAt: new Date().toISOString(),
      media: existing?.media ?? [],
    };
    demoStore.projects = existing
      ? demoStore.projects.map((item) => (item.id === existing.id ? project : item))
      : [...demoStore.projects, project];
    return project;
  }

  const id = parsed.id || null;
  const slug = await ensureUniqueSlug(supabase, parsed.slug || parsed.title, id);

  const payload = {
    slug,
    title: parsed.title,
    subtitle: parsed.subtitle,
    year: parsed.year,
    category: parsed.category,
    excerpt: parsed.excerpt,
    description: parsed.description,
    client: parsed.client,
    location: parsed.location,
    external_url: parsed.externalUrl,
    status: parsed.status,
    display_order: parsed.order,
    featured: parsed.featured,
    featured_rank: parsed.featuredRank,
    cover_media_id: parsed.coverMediaId,
    ...(parsed.status === "published" ? { published_at: new Date().toISOString() } : {}),
  };

  const query = id
    ? supabase.from("ml_projects").update(payload).eq("id", id).select("*").single()
    : supabase.from("ml_projects").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const mediaQuery = await supabase
    .from("ml_media")
    .select("*")
    .eq("project_id", data.id)
    .order("display_order", { ascending: true });

  return {
    id: String(data.id),
    slug: String(data.slug),
    title: String(data.title),
    subtitle: (data.subtitle as string | null) ?? null,
    year: (data.year as number | null) ?? null,
    category: String(data.category ?? "work"),
    excerpt: (data.excerpt as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    client: (data.client as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    externalUrl: (data.external_url as string | null) ?? null,
    status: (data.status as Project["status"]) ?? "draft",
    order: Number(data.display_order ?? 0),
    featured: Boolean(data.featured),
    featuredRank: (data.featured_rank as number | null) ?? null,
    publishedAt: (data.published_at as string | null) ?? null,
    updatedAt: String(data.updated_at ?? new Date().toISOString()),
    coverMediaId: (data.cover_media_id as string | null) ?? null,
    media: (mediaQuery.data ?? []).map((row) => decorateMedia(row)),
  };
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.projects = demoStore.projects.filter((item) => item.id !== id);
    return;
  }
  // Storage cleanup first: a failed DB delete is recoverable, orphan objects are not.
  const { data: media } = await supabase
    .from("ml_media")
    .select("bucket, path, poster_path")
    .eq("project_id", id);

  const paths = (media ?? []).flatMap((row) =>
    [row.path as string, row.poster_path as string | null].filter(Boolean) as string[],
  );
  if (paths.length) {
    await supabase.storage.from("ml-media").remove(paths);
  }

  const { error } = await supabase.from("ml_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderProjects(ids: string[]): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.projects = demoStore.projects
      .map((project) => {
        const index = ids.indexOf(project.id);
        return index === -1 ? project : { ...project, order: (index + 1) * 10 };
      })
      .sort((a, b) => a.order - b.order);
    return;
  }
  await Promise.all(
    ids.map((id, index) =>
      supabase.from("ml_projects").update({ display_order: (index + 1) * 10 }).eq("id", id),
    ),
  );
}

export async function saveTimelineEntry(input: unknown) {
  const parsed = sanitizeTimeline(input);
  if (!parsed.title) throw new Error("A timeline entry needs a title.");
  const supabase = client();
  if (!supabase) {
    const existing = demoStore.timeline.find((item) => item.id === parsed.id);
    const entry: TimelineEntry = {
      ...parsed,
      id: parsed.id || `demo-t-${Date.now().toString(36)}`,
      media: existing?.media ?? null,
    };
    demoStore.timeline = existing
      ? demoStore.timeline.map((item) => (item.id === existing.id ? entry : item))
      : [...demoStore.timeline, entry];
    return entry;
  }

  const payload = {
    year_label: parsed.yearLabel,
    sort_year: parsed.sortYear,
    sort_month: parsed.sortMonth,
    title: parsed.title,
    kind: parsed.kind,
    place: parsed.place,
    description: parsed.description,
    link_url: parsed.linkUrl,
    media_id: parsed.mediaId,
    status: parsed.status,
    display_order: parsed.order,
  };

  const query = parsed.id
    ? supabase.from("ml_timeline").update(payload).eq("id", parsed.id).select("*").single()
    : supabase.from("ml_timeline").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTimelineEntry(id: string): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.timeline = demoStore.timeline.filter((item) => item.id !== id);
    return;
  }
  const { error } = await supabase.from("ml_timeline").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderTimeline(ids: string[]): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.timeline = demoStore.timeline
      .map((entry) => {
        const index = ids.indexOf(entry.id);
        return index === -1 ? entry : { ...entry, order: (index + 1) * 10 };
      })
      .sort((a, b) => a.order - b.order);
    return;
  }
  await Promise.all(
    ids.map((id, index) =>
      supabase.from("ml_timeline").update({ display_order: (index + 1) * 10 }).eq("id", id),
    ),
  );
}

export async function deleteMedia(id: string): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.media = demoStore.media.filter((item) => item.id !== id);
    return;
  }
  const { data: row } = await supabase
    .from("ml_media")
    .select("bucket, path, poster_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("ml_media").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (row) {
    const paths = [row.path as string, row.poster_path as string | null].filter(
      Boolean,
    ) as string[];
    if (paths.length) await supabase.storage.from("ml-media").remove(paths);
  }
}

export async function updateMedia(
  id: string,
  patch: { alt?: string; caption?: string | null; year?: number | null },
): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.media = demoStore.media.map((item) =>
      item.id === id
        ? {
            ...item,
            alt: patch.alt ?? item.alt,
            caption: patch.caption === undefined ? item.caption : patch.caption,
            year: patch.year === undefined ? item.year : patch.year,
          }
        : item,
    );
    return;
  }
  const { error } = await supabase
    .from("ml_media")
    .update({
      ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.year !== undefined ? { year: patch.year } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderMedia(ids: string[]): Promise<void> {
  const supabase = client();
  if (!supabase) {
    demoStore.media = demoStore.media.map((item) => {
      const index = ids.indexOf(item.id);
      return index === -1 ? item : { ...item, order: (index + 1) * 10 };
    });
    return;
  }
  await Promise.all(
    ids.map((id, index) =>
      supabase.from("ml_media").update({ display_order: (index + 1) * 10 }).eq("id", id),
    ),
  );
}

export async function setProjectCover(projectId: string, mediaId: string | null) {
  const supabase = client();
  if (!supabase) {
    demoStore.projects = demoStore.projects.map((project) =>
      project.id === projectId ? { ...project, coverMediaId: mediaId } : project,
    );
    return;
  }
  const { error } = await supabase
    .from("ml_projects")
    .update({ cover_media_id: mediaId })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/**
 * Publish: promotes every draft row, snapshots the site document and stamps the
 * release time. Stays server-side so the browser can never publish by itself.
 */
export async function publishAll(): Promise<{ publishedAt: string }> {
  const supabase = client();
  const stamp = new Date().toISOString();
  if (!supabase) {
    demoStore.published = { ...demoStore.content };
    demoStore.projects = demoStore.projects.map((project) => ({
      ...project,
      status: "published",
      publishedAt: stamp,
    }));
    demoStore.timeline = demoStore.timeline.map((entry) => ({
      ...entry,
      status: "published",
    }));
    return { publishedAt: stamp };
  }

  const site = await supabase.from("ml_site").select("draft").eq("id", SITE_ID).maybeSingle();
  const { error: siteError } = await supabase
    .from("ml_site")
    .update({ published: site.data?.draft ?? {}, published_at: stamp })
    .eq("id", SITE_ID);
  if (siteError) throw new Error(siteError.message);

  const [projects, timeline] = await Promise.all([
    supabase
      .from("ml_projects")
      .update({ status: "published", published_at: stamp })
      .eq("status", "draft")
      .select("id"),
    supabase.from("ml_timeline").update({ status: "published" }).eq("status", "draft"),
  ]);
  if (projects.error) throw new Error(projects.error.message);
  if (timeline.error) throw new Error(timeline.error.message);

  return { publishedAt: stamp };
}

/**
 * Revert every unpublished change: published rows go back to draft (except the
 * ones that were already live), and the site document is restored from the
 * published snapshot. Explicit, non-destructive: nothing is deleted.
 */
export async function revertToPublished(): Promise<boolean> {
  const supabase = client();
  if (!supabase) {
    if (!demoStore.published) return false;
    demoStore.content = { ...demoStore.published };
    return true;
  }
  const site = await supabase.from("ml_site").select("published").eq("id", SITE_ID).maybeSingle();
  if (!site.data?.published) return false;
  const { error } = await supabase
    .from("ml_site")
    .update({ draft: site.data.published })
    .eq("id", SITE_ID);
  if (error) throw new Error(error.message);
  return true;
}

export async function listMintInterest(): Promise<MintInterestRecord[]> {
  const supabase = client();
  if (!supabase) return demoStore.mint;
  const { data, error } = await supabase
    .from("ml_mint_interest")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    walletAddress: (row.wallet_address as string | null) ?? null,
    walletChainId: (row.wallet_chain_id as number | null) ?? null,
    walletSource: (row.wallet_source as string | null) ?? null,
    consent: Boolean(row.consent),
    consentAt: String(row.consent_at ?? row.created_at),
    source: (row.source as string | null) ?? null,
    createdAt: String(row.created_at),
    note: (row.note as string | null) ?? null,
  }));
}

export async function recordMintInterest(
  payload: Record<string, unknown>,
): Promise<{ duplicate: boolean }> {
  const supabase = client();
  if (!supabase) {
    const email = String(payload.email ?? "");
    const duplicate = demoStore.mint.some((row) => row.email === email);
    if (!duplicate) {
      demoStore.mint = [
        {
          id: `demo-${Date.now().toString(36)}`,
          email,
          walletAddress: (payload.wallet_address as string | null) ?? null,
          walletChainId: (payload.wallet_chain_id as number | null) ?? null,
          walletSource: (payload.wallet_source as string | null) ?? null,
          consent: Boolean(payload.consent),
          consentAt: String(payload.consent_at ?? new Date().toISOString()),
          source: (payload.source as string | null) ?? null,
          createdAt: new Date().toISOString(),
          note: null,
        },
        ...demoStore.mint,
      ];
    }
    return { duplicate };
  }

  const { error } = await supabase.from("ml_mint_interest").insert(payload);
  if (!error) return { duplicate: false };
  if (error.code === "23505") return { duplicate: true };
  throw new Error(error.message);
}

export async function hitRateLimit(input: {
  bucket: string;
  subject: string;
  windowSeconds: number;
  max: number;
}): Promise<boolean> {
  const supabase = client();
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("ml_rate_limit_hit", {
    p_bucket: input.bucket,
    p_subject_hash: input.subject,
    p_window_seconds: input.windowSeconds,
    p_max_hits: input.max,
  });
  if (error || !data) {
    // The throttle itself is missing (migration not applied). Fail *closed*:
    // without a throttle the public endpoint must not accept writes.
    const missing = error?.code === "PGRST202" || error?.code === "PGRST205";
    console.error(`[rate-limit] ${error?.code ?? "no data"}: ${error?.message ?? "empty result"}`);
    return !missing;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.allowed);
}
