"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  Send,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaManager } from "@/components/admin/media-manager";
import { adminAction } from "@/lib/admin-client";
import { sortMedia } from "@/lib/media";
import { slugify } from "@/lib/validation";
import type { AdminDocument } from "@/lib/server/admin-data";
import type { AdminIdentity } from "@/lib/server/auth";
import type {
  MediaItem,
  NftItem,
  Project,
  SiteContent,
  TimelineEntry,
  TimelineKind,
} from "@/lib/types";

type Tab = "projects" | "site" | "bio" | "career" | "nfts" | "mint" | "people";

const TABS: { id: Tab; label: string }[] = [
  { id: "projects", label: "Works" },
  { id: "site", label: "Landing & featured" },
  { id: "bio", label: "Biography" },
  { id: "career", label: "Career" },
  { id: "nfts", label: "NFTs" },
  { id: "mint", label: "Mint" },
  { id: "people", label: "Registrations" },
];

const CATEGORY_SUGGESTIONS = ["illustration", "character", "process", "collaboration", "commission"];
const TIMELINE_KINDS: TimelineKind[] = [
  "exhibition",
  "collaboration",
  "milestone",
  "press",
  "residency",
];

/** Media can be reported by both an upload and a save; never show it twice. */
function dedupeMedia(media: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const unique: MediaItem[] = [];
  for (const item of sortMedia(media)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function emptyProject(order: number): Project {
  return {
    id: "",
    slug: "",
    title: "",
    subtitle: null,
    year: new Date().getFullYear(),
    category: "illustration",
    excerpt: null,
    description: null,
    client: null,
    location: null,
    externalUrl: null,
    status: "draft",
    order,
    featured: false,
    featuredRank: null,
    publishedAt: null,
    updatedAt: new Date().toISOString(),
    coverMediaId: null,
    media: [],
  };
}

function emptyTimeline(order: number): TimelineEntry {
  return {
    id: "",
    yearLabel: String(new Date().getFullYear()),
    sortYear: new Date().getFullYear(),
    sortMonth: null,
    title: "",
    kind: "milestone",
    place: null,
    description: null,
    linkUrl: null,
    mediaId: null,
    status: "draft",
    order,
    media: null,
  };
}

export function AdminApp({
  document,
  admin,
  previewOnly,
}: {
  document: AdminDocument;
  admin: AdminIdentity | null;
  previewOnly: boolean;
}) {
  const [tab, setTab] = useState<Tab>("projects");
  const [content, setContent] = useState<SiteContent>(document.content);
  const [projects, setProjects] = useState<Project[]>(document.projects);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(document.timeline);
  const [siteMedia, setSiteMedia] = useState<MediaItem[]>(
    document.media.filter((item) => item.scope === "site" || !item.projectId),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    document.projects[0]?.id ?? null,
  );
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const run = useCallback(
    async <T,>(
      key: string,
      action: string,
      payload: Record<string, unknown>,
      onDone?: (data: T) => void,
    ) => {
      setBusy(key);
      const result = await adminAction<T>(action, payload);
      setBusy(null);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error });
        return null;
      }
      onDone?.(result.data);
      return result.data;
    },
    [],
  );

  const saveContent = async (next: SiteContent = content) => {
    const data = await run<{ content: SiteContent }>("content", "save-content", { content: next });
    if (data) {
      setContent(data.content);
      setDirty(false);
      setNotice({ tone: "ok", text: "Draft saved. Publish to make it public." });
    }
  };

  const publish = async () => {
    const data = await run<{ publishedAt: string }>("publish", "publish", {});
    if (data) {
      setProjects((current) =>
        current.map((project) => ({
          ...project,
          status: "published",
          publishedAt: project.publishedAt ?? data.publishedAt,
        })),
      );
      setTimeline((current) => current.map((entry) => ({ ...entry, status: "published" })));
      setDirty(false);
      setNotice({ tone: "ok", text: "Published. The public site is updated." });
    }
  };

  const revert = async () => {
    if (!confirm("Discard unpublished edits and restore the last published version?")) return;
    const data = await run("revert", "revert", {});
    if (data) {
      setNotice({
        tone: "ok",
        text: "Draft restored from the published version. Reloading…",
      });
      setTimeout(() => window.location.reload(), 700);
    }
  };

  const publishState = {
    drafts:
      projects.filter((project) => project.status === "draft").length +
      timeline.filter((entry) => entry.status === "draft").length,
    published: projects.filter((project) => project.status === "published").length,
    publishedAt: document.publishedAt,
  };

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------------- header */}
      <header className="sticky top-0 z-40 border-b border-edge bg-void/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-display text-sm font-medium tracking-tight hover:text-accent"
            >
              Mike Lombard
            </Link>
            <span className="hidden font-mono text-[0.5625rem] tracking-[0.18em] text-bone-faint uppercase sm:inline">
              Content studio
            </span>
            <span
              className={`chip ${previewOnly ? "chip-draft" : "chip-live"}`}
              title={
                previewOnly
                  ? "Supabase is not configured: changes stay in this browser session"
                  : "Connected to Supabase"
              }
            >
              {previewOnly ? "Demo mode" : "Live backend"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden font-mono text-[0.5625rem] tracking-[0.14em] text-bone-faint uppercase lg:inline">
              {publishState.drafts} unpublished · {publishState.published} live
            </span>
            <Link href="/" target="_blank" className="btn px-3 py-2">
              <ExternalLink size={13} aria-hidden="true" /> Site
            </Link>
            <Link href="/works?preview=1" target="_blank" className="btn px-3 py-2">
              Preview works
            </Link>
            <Link href="/?preview=1" target="_blank" className="btn px-3 py-2">
              Preview
            </Link>
            <button type="button" onClick={revert} className="btn px-3 py-2">
              <RotateCcw size={13} aria-hidden="true" /> Revert
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={busy === "publish"}
              className="btn btn-primary px-3 py-2"
            >
              {busy === "publish" ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={13} aria-hidden="true" />
              )}
              Publish
            </button>
            {admin ? (
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/admin/logout", { method: "POST" });
                  window.location.href = "/admin/login";
                }}
                className="btn px-3 py-2"
                title={admin.email}
              >
                <LogOut size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1600px] flex-wrap gap-1 px-4 pb-2 sm:px-6">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              data-active={tab === item.id}
              className="tab"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {previewOnly ? (
          <p className="mb-6 flex items-start gap-3 border border-alert/40 bg-alert/5 px-4 py-3 text-sm text-bone">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Demo mode.</strong> Supabase is not configured,
              so edits live in this browser session only and are lost on reload. Add the
              Supabase variables to <code className="font-mono">.env.local</code> and sign in to
              save and publish for real.
            </span>
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className={`mb-6 flex items-center gap-2 border px-4 py-3 text-sm ${
              notice.tone === "ok"
                ? "border-accent/40 text-accent"
                : "border-alert/40 text-alert"
            }`}
          >
            {notice.tone === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />}
            {notice.text}
          </p>
        ) : null}

        {tab === "projects" ? (
          <ProjectsTab
            projects={projects}
            setProjects={setProjects}
            selected={selected}
            setSelectedId={setSelectedId}
            setDirty={setDirty}
            run={run}
            busy={busy}
            setNotice={setNotice}
          />
        ) : null}

        {tab === "site" ? (
          <SiteTab
            content={content}
            setContent={(next) => {
              setContent(next);
              setDirty(true);
            }}
            projects={projects}
            siteMedia={siteMedia}
            setSiteMedia={setSiteMedia}
            onSave={() => saveContent()}
            busy={busy}
          />
        ) : null}

        {tab === "bio" ? (
          <BioTab
            content={content}
            setContent={(next) => {
              setContent(next);
              setDirty(true);
            }}
            siteMedia={siteMedia}
            setSiteMedia={setSiteMedia}
            onSave={() => saveContent()}
            busy={busy}
          />
        ) : null}

        {tab === "career" ? (
          <CareerTab
            content={content}
            setContent={(next) => {
              setContent(next);
              setDirty(true);
            }}
            timeline={timeline}
            setTimeline={(next) => {
              setTimeline(next);
              setDirty(true);
            }}
            siteMedia={siteMedia}
            run={run}
            busy={busy}
            onSave={() => saveContent()}
          />
        ) : null}

        {tab === "nfts" ? (
          <NftsTab
            content={content}
            setContent={(next) => {
              setContent(next);
              setDirty(true);
            }}
            siteMedia={siteMedia}
            setSiteMedia={setSiteMedia}
            onSave={() => saveContent()}
            busy={busy}
          />
        ) : null}

        {tab === "mint" ? (
          <MintTab
            content={content}
            setContent={(next) => {
              setContent(next);
              setDirty(true);
            }}
            onSave={() => saveContent()}
            busy={busy}
          />
        ) : null}

        {tab === "people" ? <RegistrationsTab /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Works                                                                     */
/* ------------------------------------------------------------------------- */

function ProjectsTab({
  projects,
  setProjects,
  selected,
  setSelectedId,
  setDirty,
  run,
  busy,
  setNotice,
}: {
  projects: Project[];
  setProjects: (next: Project[]) => void;
  selected: Project | null;
  setSelectedId: (id: string | null) => void;
  setDirty: (value: boolean) => void;
  run: <T>(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    onDone?: (data: T) => void,
  ) => Promise<T | null>;
  busy: string | null;
  setNotice: (value: { tone: "ok" | "error"; text: string } | null) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = useMemo(
    () => [...projects].sort((a, b) => a.order - b.order),
    [projects],
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((project) => project.id === active.id);
    const newIndex = ordered.findIndex((project) => project.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex).map((project, index) => ({
      ...project,
      order: (index + 1) * 10,
    }));
    setProjects(next);
    const result = await adminAction("reorder-projects", { ids: next.map((p) => p.id) });
    if (!result.ok) setNotice({ tone: "error", text: result.error });
  };

  const addProject = () => {
    const draft = emptyProject((ordered.length + 1) * 10);
    setProjects([...projects, draft]);
    setSelectedId(null);
    setDirty(true);
    setNotice({ tone: "ok", text: "New draft project. Fill the fields and save." });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="admin-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Works ({projects.length})</p>
          <button type="button" onClick={addProject} className="btn px-3 py-2">
            <Plus size={13} aria-hidden="true" /> New
          </button>
        </div>

        <DndContext
          id="ml-projects"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ordered.map((project) => project.id || `new-${project.slug}`)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 flex flex-col gap-2">
              {ordered.map((project) => (
                <ProjectRow
                  key={project.id || `new-${project.title}`}
                  project={project}
                  active={selected?.id === project.id && Boolean(project.id)}
                  onSelect={() => setSelectedId(project.id || null)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {!projects.length ? (
          <p className="mt-4 border border-dashed border-edge px-3 py-6 text-center text-xs text-bone-faint">
            No projects yet.
          </p>
        ) : null}
      </div>

      <div>
        {selected || projects.some((project) => !project.id) ? (
          <ProjectEditor
            key={selected?.id ?? "new"}
            project={selected ?? projects.find((project) => !project.id)!}
            projects={projects}
            setProjects={setProjects}
            setDirty={setDirty}
            run={run}
            busy={busy}
            setNotice={setNotice}
            setSelectedId={setSelectedId}
          />
        ) : (
          <p className="admin-panel px-5 py-10 text-sm text-bone-faint">
            Select a work on the left, or create a new one.
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  active,
  onSelect,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id || `new-${project.title}`,
    disabled: !project.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 border px-2 py-2 ${
        active ? "border-accent/60 bg-slate-ink" : "border-edge"
      } ${isDragging ? "dragging" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!project.id}
        aria-label="Drag to reorder"
        className="drag-handle grid size-6 shrink-0 place-items-center text-bone-faint disabled:opacity-30"
      >
        ⋮⋮
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm text-bone">{project.title || "Untitled"}</span>
          {project.featured ? (
            <Star size={11} className="shrink-0 text-accent" aria-label="Featured" />
          ) : null}
        </span>
        <span className="mt-0.5 block font-mono text-[0.5625rem] tracking-[0.12em] text-bone-faint uppercase">
          {project.status} · {project.category}
          {project.year ? ` · ${project.year}` : ""}
        </span>
      </button>
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          project.status === "published" ? "bg-accent" : "bg-edge-soft"
        }`}
        aria-hidden="true"
      />
    </li>
  );
}

function ProjectEditor({
  project,
  projects,
  setProjects,
  setDirty,
  run,
  busy,
  setNotice,
  setSelectedId,
}: {
  project: Project;
  projects: Project[];
  setProjects: (next: Project[]) => void;
  setDirty: (value: boolean) => void;
  run: <T>(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    onDone?: (data: T) => void,
  ) => Promise<T | null>;
  busy: string | null;
  setNotice: (value: { tone: "ok" | "error"; text: string } | null) => void;
  setSelectedId: (id: string | null) => void;
}) {
  /**
   * ONE state object for the work being edited, media included.
   *
   * It used to be two (`draft` + a separate `media` list). That split broke the
   * gallery: any parent re-render carrying a newer project prop (assigning a
   * cover does exactly that) replaced `media` with `project.media`, which is the
   * snapshot the save returned — empty right after a fresh upload. The uploaded
   * images vanished from the panel even though the row and the file were stored.
   */
  const [draft, setDraft] = useState<Project>(() => ({
    ...project,
    media: dedupeMedia(project.media),
  }));

  /**
   * Reset only when a *different* work is opened. Syncing on every `project`
   * prop change would push the parent's snapshot over local edits — the gallery
   * was losing freshly uploaded files exactly that way.
   */
  const loadedId = useRef(project.id);
  useEffect(() => {
    if (loadedId.current === project.id) return;
    loadedId.current = project.id;
    setDraft({ ...project, media: dedupeMedia(project.media) });
  }, [project]);

  const setMedia = (next: MediaItem[]) => {
    setDraft((current) => ({ ...current, media: dedupeMedia(next) }));
  };

  const update = (changes: Partial<Project>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
  };

  const save = async (override?: Partial<Project>) => {
    const payload = { ...draft, ...override };
    // Keep whatever is already loaded locally: the save response carries the
    // server's media snapshot, and replacing the gallery with it is only correct
    // when the two agree.
    const knownMedia = draft.media;
    if (!payload.title.trim()) {
      setNotice({ tone: "error", text: "A project needs a title." });
      return;
    }
    const data = await run<{ project: Project }>("save-project", "save-project", {
      project: {
        ...payload,
        slug: payload.slug || slugify(payload.title),
        order: payload.order || (projects.length + 1) * 10,
      },
    });
    if (data?.project) {
      const merged: Project = {
        ...data.project,
        media: dedupeMedia(data.project.media.length ? data.project.media : knownMedia),
      };
      setDraft(merged);
      const exists = projects.some((item) => item.id === data.project.id);
      setProjects(
        exists
          ? projects.map((item) => (item.id === merged.id ? merged : item))
          : [...projects.filter((item) => item.id), merged],
      );
      setSelectedId(data.project.id);
      setDirty(false);
      setNotice({
        tone: "ok",
        text:
          data.project.status === "published"
            ? "Saved. Remember to publish to push it live."
            : "Draft saved.",
      });
    }
  };

  const remove = async () => {
    if (!draft.id) {
      setProjects(projects.filter((item) => item.id));
      return;
    }
    if (!confirm(`Delete "${draft.title}" and all of its media? This cannot be undone.`)) return;
    const data = await run("delete-project", "delete-project", { id: draft.id });
    if (data !== null) {
      setProjects(projects.filter((item) => item.id !== draft.id));
      setSelectedId(null);
      setNotice({ tone: "ok", text: "Project deleted." });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{draft.id ? "Edit work" : "New work"}</p>
            <p className="mt-1 font-mono text-[0.5625rem] tracking-[0.12em] text-bone-faint uppercase">
              {draft.status} · /works/{draft.slug || slugify(draft.title) || "…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save({ status: "draft" })} className="btn px-3 py-2">
              <Save size={13} aria-hidden="true" /> Save draft
            </button>
            <button
              type="button"
              onClick={() => void save({ status: "published" })}
              className="btn btn-primary px-3 py-2"
              disabled={busy === "save-project"}
            >
              {busy === "save-project" ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={13} aria-hidden="true" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={remove}
              className="btn px-3 py-2 text-alert"
              title="Delete project"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              className="field"
              placeholder="Work title"
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              value={draft.slug}
              onChange={(event) => update({ slug: event.target.value })}
              onBlur={() => {
                if (!draft.slug && draft.title) update({ slug: slugify(draft.title) });
              }}
              className="field font-mono text-sm"
              placeholder="work-slug"
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={draft.subtitle ?? ""}
              onChange={(event) => update({ subtitle: event.target.value })}
              className="field"
              placeholder="Series, medium…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Year">
              <input
                type="number"
                value={draft.year ?? ""}
                onChange={(event) =>
                  update({ year: event.target.value ? Number(event.target.value) : null })
                }
                className="field"
              />
            </Field>
            <Field label="Category">
              <input
                value={draft.category}
                onChange={(event) => update({ category: event.target.value.toLowerCase() })}
                className="field"
                list="ml-categories"
                placeholder="illustration"
              />
              <datalist id="ml-categories">
                {CATEGORY_SUGGESTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Client">
            <input
              value={draft.client ?? ""}
              onChange={(event) => update({ client: event.target.value })}
              className="field"
            />
          </Field>
          <Field label="Location">
            <input
              value={draft.location ?? ""}
              onChange={(event) => update({ location: event.target.value })}
              className="field"
            />
          </Field>
          <Field label="External link" hint="https:// only">
            <input
              value={draft.externalUrl ?? ""}
              onChange={(event) => update({ externalUrl: event.target.value })}
              className="field"
              placeholder="https://"
            />
          </Field>
          <Field label="Featured">
            <label className="flex items-center gap-3 text-sm text-bone-dim">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(event) => update({ featured: event.target.checked })}
                className="size-4 appearance-none border border-edge-soft bg-void checked:border-accent checked:bg-accent"
              />
              Show in the selected works grid
            </label>
          </Field>
        </div>

        <div className="mt-4 grid gap-4">
          <Field label="Short excerpt" hint="One line, used on cards and previews">
            <textarea
              value={draft.excerpt ?? ""}
              onChange={(event) => update({ excerpt: event.target.value })}
              rows={2}
              className="field resize-none"
            />
          </Field>
          <Field label="Description" hint="Blank line between paragraphs">
            <textarea
              value={draft.description ?? ""}
              onChange={(event) => update({ description: event.target.value })}
              rows={8}
              className="field"
            />
          </Field>
        </div>
      </div>

      <div className="admin-panel p-5">
        {draft.id ? (
          <MediaManager
            items={draft.media}
            scope="project"
            projectId={draft.id}
            coverMediaId={draft.coverMediaId}
            onChange={setMedia}
            onCoverChange={(mediaId) => {
              setDraft((current) => ({ ...current, coverMediaId: mediaId }));
              setProjects(
                projects.map((item) =>
                  item.id === draft.id ? { ...item, coverMediaId: mediaId } : item,
                ),
              );
            }}
          />
        ) : (
          <p className="text-sm text-bone-faint">
            Save the project first, then upload images and video.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-bone-faint">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Landing & featured                                                        */
/* ------------------------------------------------------------------------- */

function SiteTab({
  content,
  setContent,
  projects,
  siteMedia,
  setSiteMedia,
  onSave,
  busy,
}: {
  content: SiteContent;
  setContent: (next: SiteContent) => void;
  projects: Project[];
  siteMedia: MediaItem[];
  setSiteMedia: (next: MediaItem[]) => void;
  onSave: () => void;
  busy: string | null;
}) {
  const [uploadScope, setUploadScope] = useState<"hero" | "identity">("hero");
  const published = projects.filter((project) => project.status === "published");
  const selected = content.featured.projectIds;

  const patch = (partial: Partial<SiteContent>) => setContent({ ...content, ...partial });

  return (
    <div className="flex flex-col gap-6">
      <section className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Hero & meta</p>
          <SaveButton onSave={onSave} busy={busy === "content"} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Site title">
            <input
              value={content.meta.siteTitle}
              onChange={(event) => patch({ meta: { ...content.meta, siteTitle: event.target.value } })}
              className="field"
            />
          </Field>
          <Field label="Tagline">
            <input
              value={content.meta.tagline}
              onChange={(event) => patch({ meta: { ...content.meta, tagline: event.target.value } })}
              className="field"
            />
          </Field>
          <Field label="Eyebrow">
            <input
              value={content.hero.eyebrow}
              onChange={(event) => patch({ hero: { ...content.hero, eyebrow: event.target.value } })}
              className="field"
            />
          </Field>
          <Field label="Hero title">
            <input
              value={content.hero.title}
              onChange={(event) => patch({ hero: { ...content.hero, title: event.target.value } })}
              className="field"
            />
          </Field>
          <Field label="Studio (hero stat)" hint="Leave empty to hide this stat">
            <input
              value={content.hero.studioLabel}
              onChange={(event) =>
                patch({ hero: { ...content.hero, studioLabel: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Hero subtitle">
            <textarea
              value={content.hero.subtitle}
              onChange={(event) => patch({ hero: { ...content.hero, subtitle: event.target.value } })}
              rows={3}
              className="field resize-none"
            />
          </Field>
          <Field label="Meta description" hint="Used by search engines and link previews">
            <textarea
              value={content.meta.description}
              onChange={(event) =>
                patch({ meta: { ...content.meta, description: event.target.value } })
              }
              rows={3}
              className="field resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary CTA label">
              <input
                value={content.hero.ctaPrimaryLabel}
                onChange={(event) =>
                  patch({ hero: { ...content.hero, ctaPrimaryLabel: event.target.value } })
                }
                className="field"
              />
            </Field>
            <Field label="Primary CTA link">
              <input
                value={content.hero.ctaPrimaryHref}
                onChange={(event) =>
                  patch({ hero: { ...content.hero, ctaPrimaryHref: event.target.value } })
                }
                className="field font-mono text-sm"
              />
            </Field>
            <Field label="Secondary CTA label">
              <input
                value={content.hero.ctaSecondaryLabel}
                onChange={(event) =>
                  patch({ hero: { ...content.hero, ctaSecondaryLabel: event.target.value } })
                }
                className="field"
              />
            </Field>
            <Field label="Secondary CTA link">
              <input
                value={content.hero.ctaSecondaryHref}
                onChange={(event) =>
                  patch({ hero: { ...content.hero, ctaSecondaryHref: event.target.value } })
                }
                className="field font-mono text-sm"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="admin-panel p-5">
        <p className="eyebrow">Hero artwork</p>
        <p className="mt-2 text-xs text-bone-faint">
          Upload an image (poster) and optionally a video. Video plays muted and loops, so it
          must not rely on sound.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setUploadScope("hero")}
            data-active={uploadScope === "hero"}
            className="tab"
          >
            Hero
          </button>
          <button
            type="button"
            onClick={() => setUploadScope("identity")}
            data-active={uploadScope === "identity"}
            className="tab"
          >
            Portrait & extra media
          </button>
        </div>

        <div className="mt-5">
          <MediaManager
            items={siteMedia}
            scope="site"
            coverMediaId={content.hero.posterMediaId}
            onChange={setSiteMedia}
            onCoverChange={(mediaId) =>
              patch({
                hero: {
                  ...content.hero,
                  posterMediaId: mediaId,
                  ...(mediaId ? {} : { mediaId: null }),
                },
              })
            }
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Hero media" hint="Image or video shown large on the landing">
            <select
              value={content.hero.mediaId ?? ""}
              onChange={(event) =>
                patch({ hero: { ...content.hero, mediaId: event.target.value || null } })
              }
              className="field"
            >
              <option value="">None (placeholder frame)</option>
              {siteMedia.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.kind} — {item.alt || item.path}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hero poster" hint="Still shown before the video plays">
            <select
              value={content.hero.posterMediaId ?? ""}
              onChange={(event) =>
                patch({ hero: { ...content.hero, posterMediaId: event.target.value || null } })
              }
              className="field"
            >
              <option value="">None</option>
              {siteMedia
                .filter((item) => item.kind === "image")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.alt || item.path}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="admin-panel p-5">
        <p className="eyebrow">Selected works</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Section title">
            <input
              value={content.featured.title}
              onChange={(event) =>
                patch({ featured: { ...content.featured, title: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Section intro">
            <input
              value={content.featured.intro}
              onChange={(event) =>
                patch({ featured: { ...content.featured, intro: event.target.value } })
              }
              className="field"
            />
          </Field>
        </div>

        <p className="mt-6 text-xs text-bone-faint">
          Pick up to 4 works. The order here is the order on the landing page.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {published.map((project) => {
            const index = selected.indexOf(project.id);
            const isSelected = index >= 0;
            return (
              <li
                key={project.id}
                className="flex items-center gap-3 border border-edge px-3 py-2"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, project.id].slice(0, 4)
                        : selected.filter((id) => id !== project.id);
                      patch({ featured: { ...content.featured, projectIds: next } });
                    }}
                    className="size-4 shrink-0 appearance-none border border-edge-soft bg-void checked:border-accent checked:bg-accent"
                  />
                  <span className="truncate">{project.title}</span>
                  <span className="shrink-0 font-mono text-[0.5625rem] tracking-[0.12em] text-bone-faint uppercase">
                    {project.category}
                  </span>
                </label>
                {isSelected ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="chip"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...selected];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        patch({ featured: { ...content.featured, projectIds: next } });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="chip"
                      disabled={index === selected.length - 1}
                      onClick={() => {
                        const next = [...selected];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        patch({ featured: { ...content.featured, projectIds: next } });
                      }}
                    >
                      ↓
                    </button>
                    <span className="chip chip-live">#{index + 1}</span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!published.length ? (
          <p className="mt-4 border border-dashed border-edge px-4 py-6 text-xs text-bone-faint">
            Publish a work first, then select it here.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <SaveButton onSave={onSave} busy={busy === "content"} />
        </div>
      </section>

      <section className="admin-panel p-5">
        <p className="eyebrow">Works index copy</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input
              value={content.works.title}
              onChange={(event) =>
                patch({ works: { ...content.works, title: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Intro">
            <input
              value={content.works.intro}
              onChange={(event) =>
                patch({ works: { ...content.works, intro: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Filter categories" hint="Comma separated, lowercase">
            <input
              value={content.works.categories.join(", ")}
              onChange={(event) =>
                patch({
                  works: {
                    ...content.works,
                    categories: event.target.value
                      .split(",")
                      .map((value) => value.trim().toLowerCase())
                      .filter(Boolean),
                  },
                })
              }
              className="field font-mono text-sm"
            />
          </Field>
          <Field label="Footer note">
            <input
              value={content.footer.note}
              onChange={(event) =>
                patch({ footer: { ...content.footer, note: event.target.value } })
              }
              className="field"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end">
          <SaveButton onSave={onSave} busy={busy === "content"} />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Biography                                                                 */
/* ------------------------------------------------------------------------- */

function BioTab({
  content,
  setContent,
  siteMedia,
  setSiteMedia,
  onSave,
  busy,
}: {
  content: SiteContent;
  setContent: (next: SiteContent) => void;
  siteMedia: MediaItem[];
  setSiteMedia: (next: MediaItem[]) => void;
  onSave: () => void;
  busy: string | null;
}) {
  const bio = content.bio;
  const patch = (partial: Partial<SiteContent["bio"]>) =>
    setContent({ ...content, bio: { ...bio, ...partial } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-6">
        <section className="admin-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Biography</p>
            <SaveButton onSave={onSave} busy={busy === "content"} />
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Page title">
                <input
                  value={bio.title}
                  onChange={(event) => patch({ title: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Lead line" hint="Shown in italic under the title">
                <input
                  value={bio.intro}
                  onChange={(event) => patch({ intro: event.target.value })}
                  className="field"
                />
              </Field>
            </div>
            <Field label="Story" hint="Blank line between paragraphs. Nothing is invented here — write only what is true.">
              <textarea
                value={bio.body}
                onChange={(event) => patch({ body: event.target.value })}
                rows={12}
                className="field"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Second section title">
                <input
                  value={bio.visionTitle}
                  onChange={(event) => patch({ visionTitle: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Second section text">
                <textarea
                  value={bio.vision}
                  onChange={(event) => patch({ vision: event.target.value })}
                  rows={6}
                  className="field resize-none"
                />
              </Field>
              <Field label="Third section title">
                <input
                  value={bio.collabTitle}
                  onChange={(event) => patch({ collabTitle: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Third section text">
                <textarea
                  value={bio.collab}
                  onChange={(event) => patch({ collab: event.target.value })}
                  rows={6}
                  className="field resize-none"
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="admin-panel p-5">
          <p className="eyebrow">Key facts</p>
          <p className="mt-2 text-xs text-bone-faint">
            Only add facts you can stand behind. Leave the list empty if there is nothing
            verified yet.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {bio.facts.map((fact, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                <input
                  value={fact.label}
                  placeholder="Label (e.g. Based in)"
                  onChange={(event) => {
                    const next = [...bio.facts];
                    next[index] = { ...fact, label: event.target.value };
                    patch({ facts: next });
                  }}
                  className="field"
                />
                <input
                  value={fact.value}
                  placeholder="Value"
                  onChange={(event) => {
                    const next = [...bio.facts];
                    next[index] = { ...fact, value: event.target.value };
                    patch({ facts: next });
                  }}
                  className="field"
                />
                <button
                  type="button"
                  onClick={() => patch({ facts: bio.facts.filter((_, i) => i !== index) })}
                  className="btn px-3 py-2 text-alert"
                  aria-label="Remove fact"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => patch({ facts: [...bio.facts, { label: "", value: "" }] })}
            className="btn mt-3 px-3 py-2"
          >
            <Plus size={13} aria-hidden="true" /> Add fact
          </button>
        </section>

        <section className="admin-panel p-5">
          <p className="eyebrow">Links</p>
          <ul className="mt-4 flex flex-col gap-2">
            {bio.socials.map((social, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                <input
                  value={social.label}
                  placeholder="Label"
                  onChange={(event) => {
                    const next = [...bio.socials];
                    next[index] = { ...social, label: event.target.value };
                    patch({ socials: next });
                  }}
                  className="field"
                />
                <input
                  value={social.href}
                  placeholder="https://"
                  onChange={(event) => {
                    const next = [...bio.socials];
                    next[index] = { ...social, href: event.target.value };
                    patch({ socials: next });
                  }}
                  className="field font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => patch({ socials: bio.socials.filter((_, i) => i !== index) })}
                  className="btn px-3 py-2 text-alert"
                  aria-label="Remove link"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patch({ socials: [...bio.socials, { label: "", href: "" }] })}
              className="btn px-3 py-2"
            >
              <Plus size={13} aria-hidden="true" /> Add biography link
            </button>
            <button
              type="button"
              onClick={() =>
                setContent({
                  ...content,
                  footer: {
                    ...content.footer,
                    socials: content.footer.socials.length ? content.footer.socials : bio.socials,
                  },
                })
              }
              className="btn px-3 py-2"
            >
              Copy to footer
            </button>
          </div>
          <div className="mt-6 flex justify-end">
            <SaveButton onSave={onSave} busy={busy === "content"} />
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <section className="admin-panel p-5">
          <p className="eyebrow">Portrait</p>
          <div className="mt-5">
            <MediaManager
              items={siteMedia}
              scope="site"
              coverMediaId={bio.portraitMediaId}
              onChange={setSiteMedia}
              onCoverChange={(mediaId) => patch({ portraitMediaId: mediaId })}
            />
          </div>
          <Field label="Photo of the artist" hint="Shown first, next to his work">
            <select
              value={bio.portraitMediaId ?? ""}
              onChange={(event) => patch({ portraitMediaId: event.target.value || null })}
              className="field mt-4"
            >
              <option value="">None</option>
              {siteMedia.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.alt || item.path}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="One of his works"
            hint="Shown next to the photo, so the page has both the person and the painting"
          >
            <select
              value={bio.artworkMediaId ?? ""}
              onChange={(event) => patch({ artworkMediaId: event.target.value || null })}
              className="field mt-4"
            >
              <option value="">None</option>
              {siteMedia
                .filter((item) => item.id !== bio.portraitMediaId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.alt || item.path}
                  </option>
                ))}
            </select>
          </Field>
        </section>

        <section className="admin-panel p-5">
          <p className="eyebrow">Provisional flag</p>
          <label className="mt-4 flex items-start gap-3 text-sm text-bone-dim">
            <input
              type="checkbox"
              checked={content.provisional}
              onChange={(event) => setContent({ ...content, provisional: event.target.checked })}
              className="mt-0.5 size-4 appearance-none border border-edge-soft bg-void checked:border-accent checked:bg-accent"
            />
            Mark all content as provisional (banner on the home page, noindex for search
            engines). Uncheck only when the artist has approved every text.
          </label>
          <div className="mt-5 flex justify-end">
            <SaveButton onSave={onSave} busy={busy === "content"} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Career                                                                    */
/* ------------------------------------------------------------------------- */

function CareerTab({
  content,
  setContent,
  timeline,
  setTimeline,
  siteMedia,
  run,
  busy,
  onSave,
}: {
  content: SiteContent;
  setContent: (next: SiteContent) => void;
  timeline: TimelineEntry[];
  setTimeline: (next: TimelineEntry[]) => void;
  siteMedia: MediaItem[];
  run: <T>(
    key: string,
    action: string,
    payload: Record<string, unknown>,
    onDone?: (data: T) => void,
  ) => Promise<T | null>;
  busy: string | null;
  onSave: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = useMemo(() => [...timeline].sort((a, b) => a.order - b.order), [timeline]);

  const upsert = async (entry: TimelineEntry) => {
    const data = await run<{ entry: TimelineEntry }>("save-timeline", "save-timeline", { entry });
    if (data?.entry) {
      const saved = data.entry as TimelineEntry;
      const exists = timeline.some((item) => item.id === saved.id);
      setTimeline(
        exists
          ? timeline.map((item) => (item.id === saved.id ? saved : item))
          : [...timeline, saved],
      );
      setOpenId(saved.id);
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((item) => item.id === active.id);
    const newIndex = ordered.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order: (index + 1) * 10,
    }));
    setTimeline(next);
    await adminAction("reorder-timeline", { ids: next.map((item) => item.id) });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Page copy</p>
          <SaveButton onSave={onSave} busy={busy === "content"} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input
              value={content.career.title}
              onChange={(event) =>
                setContent({ ...content, career: { ...content.career, title: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Intro">
            <input
              value={content.career.intro}
              onChange={(event) =>
                setContent({ ...content, career: { ...content.career, intro: event.target.value } })
              }
              className="field"
            />
          </Field>
          <Field label="Empty-state note">
            <input
              value={content.career.emptyNote}
              onChange={(event) =>
                setContent({
                  ...content,
                  career: { ...content.career, emptyNote: event.target.value },
                })
              }
              className="field"
            />
          </Field>
        </div>
      </section>

      <section className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Timeline ({timeline.length})</p>
            <p className="mt-1 text-xs text-bone-faint">
              Drag to reorder. Only entries marked published appear on the site.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const entry = emptyTimeline((ordered.length + 1) * 10);
              const temp: TimelineEntry = { ...entry, id: `new-${Date.now()}` };
              setTimeline([...timeline, temp]);
              setOpenId(temp.id);
            }}
            className="btn px-3 py-2"
          >
            <Plus size={13} aria-hidden="true" /> New entry
          </button>
        </div>

        <DndContext
          id="ml-timeline"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ordered.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 flex flex-col gap-2">
              {ordered.map((entry) => (
                <TimelineRow
                  key={entry.id}
                  entry={entry}
                  open={openId === entry.id}
                  onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
                  onSave={upsert}
                  onDelete={async () => {
                    if (entry.id.startsWith("new-")) {
                      setTimeline(timeline.filter((item) => item.id !== entry.id));
                      return;
                    }
                    if (!confirm(`Delete "${entry.title}"?`)) return;
                    const data = await run("delete-timeline", "delete-timeline", { id: entry.id });
                    if (data !== null) {
                      setTimeline(timeline.filter((item) => item.id !== entry.id));
                    }
                  }}
                  onChange={(next) =>
                    setTimeline(timeline.map((item) => (item.id === entry.id ? next : item)))
                  }
                  siteMedia={siteMedia}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {!timeline.length ? (
          <p className="mt-4 border border-dashed border-edge px-4 py-8 text-center text-xs text-bone-faint">
            No entries yet. Add only what actually happened.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function TimelineRow({
  entry,
  open,
  onToggle,
  onSave,
  onDelete,
  onChange,
  siteMedia,
}: {
  entry: TimelineEntry;
  open: boolean;
  onToggle: () => void;
  onSave: (entry: TimelineEntry) => void;
  onDelete: () => void;
  onChange: (entry: TimelineEntry) => void;
  siteMedia: MediaItem[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border border-edge ${isDragging ? "dragging" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="drag-handle grid size-6 place-items-center text-bone-faint"
        >
          ⋮⋮
        </button>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-[0.625rem] tracking-[0.14em] text-bone-faint">
              {entry.yearLabel || "—"}
            </span>
            <span className="truncate text-sm text-bone">{entry.title || "Untitled entry"}</span>
          </span>
          <span className="mt-0.5 block font-mono text-[0.5625rem] tracking-[0.12em] text-bone-faint uppercase">
            {entry.kind} · {entry.status}
          </span>
        </button>
        <button type="button" onClick={onToggle} className="chip">
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="border-t border-edge p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Year label">
              <input
                value={entry.yearLabel}
                onChange={(event) => onChange({ ...entry, yearLabel: event.target.value })}
                className="field"
                placeholder="2026 or 2026-04"
              />
            </Field>
            <Field label="Sort year" hint="Numeric, for ordering">
              <input
                type="number"
                value={entry.sortYear ?? ""}
                onChange={(event) =>
                  onChange({
                    ...entry,
                    sortYear: event.target.value ? Number(event.target.value) : null,
                  })
                }
                className="field"
              />
            </Field>
            <Field label="Kind">
              <select
                value={entry.kind}
                onChange={(event) =>
                  onChange({ ...entry, kind: event.target.value as TimelineKind })
                }
                className="field"
              >
                {TIMELINE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                value={entry.title}
                onChange={(event) => onChange({ ...entry, title: event.target.value })}
                className="field md:col-span-2"
              />
            </Field>
            <Field label="Place">
              <input
                value={entry.place ?? ""}
                onChange={(event) => onChange({ ...entry, place: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={entry.description ?? ""}
                onChange={(event) => onChange({ ...entry, description: event.target.value })}
                rows={3}
                className="field resize-none md:col-span-2"
              />
            </Field>
            <Field label="Reference link">
              <input
                value={entry.linkUrl ?? ""}
                onChange={(event) => onChange({ ...entry, linkUrl: event.target.value })}
                className="field font-mono text-sm"
                placeholder="https://"
              />
            </Field>
            <Field label="Image (optional)">
              <select
                value={entry.mediaId ?? ""}
                onChange={(event) => onChange({ ...entry, mediaId: event.target.value || null })}
                className="field"
              >
                <option value="">None</option>
                {siteMedia.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.alt || item.path}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Visibility">
              <select
                value={entry.status}
                onChange={(event) =>
                  onChange({ ...entry, status: event.target.value as "draft" | "published" })
                }
                className="field"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onDelete} className="btn px-3 py-2 text-alert">
              <Trash2 size={13} aria-hidden="true" /> Delete
            </button>
            <button
              type="button"
              onClick={() => onSave(entry)}
              className="btn btn-primary px-3 py-2"
            >
              <Save size={13} aria-hidden="true" /> Save entry
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------------- */
/* NFTs                                                                      */
/* ------------------------------------------------------------------------- */

function emptyNft(index: number): NftItem {
  return {
    id: `nft-${Date.now().toString(36)}-${index}`,
    title: "",
    description: null,
    mediaId: null,
    year: new Date().getFullYear(),
    edition: null,
    linkUrl: null,
  };
}

/**
 * Editor for the NFT section.
 *
 * Each piece is title + image + optional story, edition and link. Nothing about
 * a contract, a price or a date is assumed or required: the artist writes what
 * is true and leaves the rest empty.
 */
function NftsTab({
  content,
  setContent,
  siteMedia,
  setSiteMedia,
  onSave,
  busy,
}: {
  content: SiteContent;
  setContent: (next: SiteContent) => void;
  siteMedia: MediaItem[];
  setSiteMedia: (next: MediaItem[]) => void;
  onSave: () => void;
  busy: string | null;
}) {
  const nfts = content.nfts;
  const patch = (partial: Partial<SiteContent["nfts"]>) =>
    setContent({ ...content, nfts: { ...nfts, ...partial } });

  const patchItem = (id: string, changes: Partial<NftItem>) =>
    patch({ items: nfts.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) });

  const move = (index: number, delta: number) => {
    const next = [...nfts.items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ items: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">NFT section</p>
          <SaveButton onSave={onSave} busy={busy === "content"} />
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-bone-faint">
          Appears on the landing page and on its own page at <span className="font-mono">/nfts</span>.
          Do not add a price, a contract address or a mint date unless they are real.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Eyebrow">
            <input value={nfts.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} className="field" />
          </Field>
          <Field label="Title">
            <input value={nfts.title} onChange={(e) => patch({ title: e.target.value })} className="field" />
          </Field>
          <Field label="Intro">
            <textarea value={nfts.intro} onChange={(e) => patch({ intro: e.target.value })} rows={3} className="field resize-none" />
          </Field>
          <Field label="Note under the grid" hint="Provenance or context, in the artist's words">
            <textarea value={nfts.note} onChange={(e) => patch({ note: e.target.value })} rows={3} className="field resize-none" />
          </Field>
        </div>
      </section>

      <section className="admin-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Pieces ({nfts.items.length})</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patch({ items: [...nfts.items, emptyNft(nfts.items.length + 1)] })}
              className="btn px-3 py-2"
            >
              <Plus size={13} aria-hidden="true" /> Add piece
            </button>
            <SaveButton onSave={onSave} busy={busy === "content"} />
          </div>
        </div>

        <ul className="mt-5 flex flex-col gap-3">
          {nfts.items.map((item, index) => {
            const media = siteMedia.find((m) => m.id === item.mediaId);
            return (
              <li key={item.id} className="border border-edge p-4">
                <div className="flex items-start gap-4">
                  <div className="relative hidden size-24 shrink-0 overflow-hidden border border-edge bg-pit sm:block">
                    {media?.url ? (
                      <Image src={media.url} alt={media.alt} fill sizes="96px" className="object-cover" unoptimized />
                    ) : (
                      <span className="grid h-full place-items-center px-1 text-center font-mono text-[0.5rem] text-bone-faint uppercase">
                        No image
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 grid gap-3 md:grid-cols-2">
                    <Field label="Title">
                      <input
                        value={item.title}
                        onChange={(e) => patchItem(item.id, { title: e.target.value })}
                        className="field"
                        placeholder="Piece title"
                      />
                    </Field>
                    <Field label="Image">
                      <select
                        value={item.mediaId ?? ""}
                        onChange={(e) => patchItem(item.id, { mediaId: e.target.value || null })}
                        className="field"
                      >
                        <option value="">None</option>
                        {siteMedia.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.alt || m.path}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Description">
                      <textarea
                        value={item.description ?? ""}
                        onChange={(e) => patchItem(item.id, { description: e.target.value })}
                        rows={2}
                        className="field resize-none"
                        placeholder="What the piece is, in one or two sentences"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Year">
                        <input
                          type="number"
                          value={item.year ?? ""}
                          onChange={(e) => patchItem(item.id, { year: e.target.value ? Number(e.target.value) : null })}
                          className="field"
                        />
                      </Field>
                      <Field label="Edition">
                        <input
                          value={item.edition ?? ""}
                          onChange={(e) => patchItem(item.id, { edition: e.target.value })}
                          className="field"
                          placeholder="1/1"
                        />
                      </Field>
                    </div>
                    <Field label="Link" hint="https:// only. Leave empty if there is none">
                      <input
                        value={item.linkUrl ?? ""}
                        onChange={(e) => patchItem(item.id, { linkUrl: e.target.value })}
                        className="field font-mono text-sm"
                        placeholder="https://"
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn px-3 py-2">
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === nfts.items.length - 1}
                        className="btn px-3 py-2"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => patch({ items: nfts.items.filter((n) => n.id !== item.id) })}
                        className="btn px-3 py-2 text-alert"
                      >
                        <Trash2 size={13} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {!nfts.items.length ? (
          <p className="mt-4 border border-dashed border-edge px-4 py-8 text-center text-xs text-bone-faint">
            No pieces yet. Use “Add piece” and pick an image.
          </p>
        ) : null}
      </section>

      <section className="admin-panel p-5">
        <p className="eyebrow">Images for the NFT section</p>
        <p className="mt-2 text-xs text-bone-faint">
          Upload here, then choose each image in the piece above.
        </p>
        <div className="mt-5">
          <MediaManager items={siteMedia} scope="site" onChange={setSiteMedia} />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Mint                                                                      */
/* ------------------------------------------------------------------------- */

function MintTab({
  content,
  setContent,
  onSave,
  busy,
}: {
  content: SiteContent;
  setContent: (next: SiteContent) => void;
  onSave: () => void;
  busy: string | null;
}) {
  const mint = content.mint;
  const patch = (partial: Partial<SiteContent["mint"]>) =>
    setContent({ ...content, mint: { ...mint, ...partial } });

  return (
    <div className="admin-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">Mint registration page</p>
        <SaveButton onSave={onSave} busy={busy === "content"} />
      </div>

      <p className="mt-4 border border-edge px-4 py-3 text-xs leading-relaxed text-bone-faint">
        Do not add a price, a contract address or a date unless they are real and approved.
        The form registers interest only.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Eyebrow">
          <input
            value={mint.eyebrow}
            onChange={(event) => patch({ eyebrow: event.target.value })}
            className="field"
          />
        </Field>
        <Field label="Title">
          <input
            value={mint.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="field"
          />
        </Field>
        <Field label="Intro">
          <textarea
            value={mint.intro}
            onChange={(event) => patch({ intro: event.target.value })}
            rows={3}
            className="field resize-none"
          />
        </Field>
        <Field label="Body" hint="Blank line between paragraphs">
          <textarea
            value={mint.body}
            onChange={(event) => patch({ body: event.target.value })}
            rows={6}
            className="field"
          />
        </Field>
        <Field label="Disclaimer" hint="Always visible above the form">
          <textarea
            value={mint.disclaimer}
            onChange={(event) => patch({ disclaimer: event.target.value })}
            rows={4}
            className="field resize-none"
          />
        </Field>
        <Field label="Consent text" hint="The exact sentence stored with each registration">
          <textarea
            value={mint.consentText}
            onChange={(event) => patch({ consentText: event.target.value })}
            rows={3}
            className="field resize-none"
          />
        </Field>
        <Field label="Registration state">
          <label className="flex items-center gap-3 text-sm text-bone-dim">
            <input
              type="checkbox"
              checked={mint.open}
              onChange={(event) => patch({ open: event.target.checked })}
              className="size-4 appearance-none border border-edge-soft bg-void checked:border-accent checked:bg-accent"
            />
            Form open
          </label>
        </Field>
        <Field label="Closed message">
          <input
            value={mint.closedMessage}
            onChange={(event) => patch({ closedMessage: event.target.value })}
            className="field"
          />
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Registrations                                                             */
/* ------------------------------------------------------------------------- */

type Registration = {
  id: string;
  email: string;
  walletAddress: string | null;
  walletChainId: number | null;
  walletSource: string | null;
  consent: boolean;
  consentAt: string;
  source: string | null;
  createdAt: string;
  note: string | null;
};

function RegistrationsTab() {
  const [rows, setRows] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/admin/mint", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          rows?: Registration[];
          error?: string;
        };
        if (cancelled) return;

        if (response.ok && payload.ok && Array.isArray(payload.rows)) {
          setRows(payload.rows);
          setError(null);
          return;
        }

        setRows([]);
        setError(
          response.status === 401
            ? "Sign in as an administrator to read the registrations."
            : (payload.error ?? "Could not load registrations."),
        );
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Could not load registrations.");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (rows ?? []).filter((row) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.email.toLowerCase().includes(needle) ||
      (row.walletAddress ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="admin-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Mint registrations</p>
          <p className="mt-1 text-xs text-bone-faint">
            Private data. Only administrators can read or export this list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by email or wallet"
            className="field w-56"
          />
          <a href="/api/admin/mint-export" className="btn px-3 py-2">
            <UploadCloud size={13} aria-hidden="true" /> Export CSV
          </a>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-5 border border-alert/40 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {rows === null && !error ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-bone-faint">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : null}

      {rows ? (
        <>
          <p className="mt-5 font-mono text-[0.625rem] tracking-[0.14em] text-bone-faint uppercase">
            {filtered.length} of {rows.length} registrations
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="table-admin">
              <thead>
                <tr>
                  <th>Registered</th>
                  <th>Email</th>
                  <th>Wallet</th>
                  <th>Source</th>
                  <th>Consent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap font-mono text-xs text-bone-faint">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td>{row.email}</td>
                    <td className="font-mono text-xs">
                      {row.walletAddress ? (
                        <>
                          {row.walletAddress}
                          <span className="mt-1 block text-bone-faint">
                            {row.walletSource ?? "manual"} · unverified
                          </span>
                        </>
                      ) : (
                        <span className="text-bone-faint">—</span>
                      )}
                    </td>
                    <td className="text-xs text-bone-faint">{row.source ?? "—"}</td>
                    <td className="text-xs">
                      {row.consent ? (
                        <span className="inline-flex items-center gap-1.5 text-accent">
                          <Check size={12} /> yes
                        </span>
                      ) : (
                        "no"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length ? (
            <p className="mt-5 border border-dashed border-edge px-4 py-8 text-center text-xs text-bone-faint">
              No registrations yet.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SaveButton({ onSave, busy }: { onSave: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onSave} disabled={busy} className="btn btn-primary px-3 py-2">
      {busy ? (
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      ) : (
        <Save size={13} aria-hidden="true" />
      )}
      Save draft
    </button>
  );
}
