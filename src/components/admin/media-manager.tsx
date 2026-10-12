"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Check,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Star,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import {
  POSTER_TIME,
  adminAction,
  captureVideoFrame,
  readImageSize,
  readVideoMeta,
  uploadMedia,
  uploadPoster,
} from "@/lib/admin-client";
import { formatBytes, publicMediaUrl, sortMedia } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

type QueueItem = {
  key: string;
  name: string;
  kind: "image" | "video";
  percent: number;
  error?: string;
  done: boolean;
};

function toMediaItem(row: Record<string, unknown>): MediaItem {
  return {
    id: String(row.id),
    projectId: (row.project_id as string | null) ?? null,
    scope: (row.scope as MediaItem["scope"]) ?? "project",
    kind: (row.kind as MediaItem["kind"]) ?? "image",
    bucket: (row.bucket as string) ?? "ml-media",
    path: String(row.path),
    posterPath: (row.poster_path as string | null) ?? null,
    posterTime: row.poster_time == null ? null : Number(row.poster_time),
    alt: String(row.alt ?? ""),
    caption: (row.caption as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    durationS: row.duration_s == null ? null : Number(row.duration_s),
    bytes: row.bytes == null ? null : Number(row.bytes),
    mime: (row.mime as string | null) ?? null,
    order: Number(row.display_order ?? 0),
    url: publicMediaUrl(String(row.path), { bucket: String(row.bucket ?? "ml-media") }),
    posterUrl: row.poster_path
      ? publicMediaUrl(String(row.poster_path), { bucket: String(row.bucket ?? "ml-media") })
      : null,
  };
}

export function MediaManager({
  items,
  scope,
  projectId,
  coverMediaId,
  onChange,
  onCoverChange,
  disabled,
}: {
  items: MediaItem[];
  scope: "project" | "site";
  projectId?: string | null;
  coverMediaId?: string | null;
  onChange: (next: MediaItem[]) => void;
  onCoverChange?: (mediaId: string | null) => void;
  disabled?: boolean;
}) {
  /** Mirrors the cover the server assigns to the first uploaded image. */
  const [autoCover, setAutoCover] = useState<string | null>(coverMediaId ?? null);

  useEffect(() => {
    setAutoCover(coverMediaId ?? null);
  }, [coverMediaId]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = sortMedia(items);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const persistOrder = useCallback(
    async (next: MediaItem[]) => {
      const result = await adminAction("reorder-media", { ids: next.map((item) => item.id) });
      if (!result.ok) setNotice(result.error);
    },
    [],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      const entries = Array.from(files);
      const created: MediaItem[] = [];

      for (const file of entries) {
        const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
        const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
        setQueue((current) => [
          ...current,
          { key, name: file.name, kind, percent: 0, done: false },
        ]);

        if (kind === "video" && file.size > 200 * 1024 * 1024) {
          setQueue((current) =>
            current.map((item) =>
              item.key === key
                ? { ...item, error: "Larger than the 200 MB video limit.", done: true }
                : item,
            ),
          );
          continue;
        }
        if (kind === "image" && file.size > 20 * 1024 * 1024) {
          setQueue((current) =>
            current.map((item) =>
              item.key === key
                ? { ...item, error: "Larger than the 20 MB image limit.", done: true }
                : item,
            ),
          );
          continue;
        }

        let width = 0;
        let height = 0;
        let duration: number | undefined;
        if (kind === "image") {
          const size = await readImageSize(file);
          width = size.width;
          height = size.height;
        } else {
          const video = await readVideoMeta(file);
          width = video.width;
          height = video.height;
          duration = video.duration;
        }

        const result = await uploadMedia({
          file,
          kind,
          scope,
          projectId: projectId ?? null,
          alt: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
          width,
          height,
          duration,
          posterTime: kind === "video" ? POSTER_TIME : undefined,
          onProgress: (percent) =>
            setQueue((current) =>
              current.map((item) => (item.key === key ? { ...item, percent } : item)),
            ),
        });

        if (!result.ok) {
          setQueue((current) =>
            current.map((item) =>
              item.key === key ? { ...item, error: result.error, done: true } : item,
            ),
          );
          continue;
        }

        const media = toMediaItem(result.media as unknown as Record<string, unknown>);
        created.push(media);
        setQueue((current) =>
          current.map((item) => (item.key === key ? { ...item, percent: 100, done: true } : item)),
        );

        // Art-directed poster: extract a real frame so the video has a still
        // even in clients that ignore Media Fragment URIs.
        if (kind === "video") {
          const frame = await captureVideoFrame(file, POSTER_TIME);
          if (frame) {
            const uploaded = await uploadPoster(media.id, frame);
            if (uploaded.ok) {
              media.posterUrl = publicMediaUrl(media.path.replace(/\.[a-z0-9]+$/i, "") + "-poster.webp");
              media.posterPath = media.path.replace(/\.[a-z0-9]+$/i, "") + "-poster.webp";
            }
          }
        }
      }

      if (created.length) {
        onChange([...ordered, ...created]);
        await persistOrder([...ordered, ...created]);

        // The API sets the first image of a project as its cover. Reflect that
        // here, otherwise the next save would send `coverMediaId: null` and undo
        // the assignment.
        if (scope === "project" && !autoCover && onCoverChange) {
          const firstImage = created.find((item) => item.kind === "image");
          if (firstImage) {
            setAutoCover(firstImage.id);
            onCoverChange(firstImage.id);
          }
        }
      }
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    },
    [autoCover, onChange, onCoverChange, ordered, persistOrder, projectId, scope],
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((item) => item.id === active.id);
    const newIndex = ordered.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    onChange(next);
    await persistOrder(next);
  };

  const patch = async (id: string, changes: Partial<MediaItem>) => {
    const next = ordered.map((item) => (item.id === id ? { ...item, ...changes } : item));
    onChange(next);
  };

  const saveMeta = async (item: MediaItem) => {
    const result = await adminAction("update-media", {
      id: item.id,
      alt: item.alt,
      caption: item.caption,
      year: item.year,
    });
    if (!result.ok) setNotice(result.error);
    else setNotice("Saved.");
  };

  const remove = async (item: MediaItem) => {
    if (!confirm(`Delete "${item.alt || item.path}"? The file is removed from storage too.`)) return;
    const result = await adminAction("delete-media", { id: item.id });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    onChange(ordered.filter((entry) => entry.id !== item.id));
    setNotice("Media deleted.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{scope === "site" ? "Site media" : "Project media"}</p>
          <p className="mt-1 text-xs text-bone-faint">
            {ordered.length} file{ordered.length === 1 ? "" : "s"} · drag the handle to reorder ·
            images up to 20 MB, video up to 200 MB
          </p>
        </div>
        <label
          className={`btn cursor-pointer ${disabled || busy ? "pointer-events-none opacity-50" : ""}`}
        >
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Uploading
            </>
          ) : (
            <>
              <Upload size={13} aria-hidden="true" /> Add files
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </label>
      </div>

      {queue.length ? (
        <ul className="flex flex-col gap-2 border border-edge p-3">
          {queue.map((item) => (
            <li key={item.key} className="flex items-center gap-3 text-xs">
              <span className="w-5 shrink-0 text-bone-faint">
                {item.kind === "video" ? <Video size={13} /> : <ImageIcon size={13} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-bone-dim">{item.name}</span>
              {item.error ? (
                <span className="flex items-center gap-1.5 text-alert">
                  <AlertTriangle size={12} /> {item.error}
                </span>
              ) : item.percent >= 100 ? (
                <span className="flex items-center gap-1.5 text-accent">
                  <Check size={12} /> done
                </span>
              ) : (
                <>
                  <span className="h-1 w-24 sm:w-40 shrink-0 bg-edge">
                    <span
                      className="block h-full bg-accent transition-[width] duration-200"
                      style={{ width: `${item.percent}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-bone-faint">
                    {item.percent}%
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p role="status" className="border border-edge px-3 py-2 text-xs text-bone-dim">
          {notice}
        </p>
      ) : null}

      {ordered.length ? (
        <DndContext
          id={`ml-media-${scope}-${projectId ?? "site"}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ordered.map((item) => item.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ordered.map((item) => (
                <SortableMedia
                  key={item.id}
                  item={item}
                  isCover={(coverMediaId ?? autoCover) === item.id}
                  onPatch={patch}
                  onSave={saveMeta}
                  onRemove={remove}
                  onSetCover={
                    onCoverChange
                      ? async () => {
                          const result = await adminAction("set-cover", {
                            projectId,
                            mediaId: item.id,
                          });
                          if (!result.ok) setNotice(result.error);
                          else {
                            onCoverChange(item.id);
                            setNotice("Cover updated.");
                          }
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="border border-dashed border-edge px-4 py-8 text-center text-xs text-bone-faint">
          No media yet. Use “Add files” to upload images and video.
        </p>
      )}
    </div>
  );
}

function SortableMedia({
  item,
  isCover,
  onPatch,
  onSave,
  onRemove,
  onSetCover,
}: {
  item: MediaItem;
  isCover: boolean;
  onPatch: (id: string, changes: Partial<MediaItem>) => void;
  onSave: (item: MediaItem) => void;
  onRemove: (item: MediaItem) => void;
  onSetCover?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [open, setOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`admin-panel flex flex-col ${isDragging ? "dragging" : ""}`}
    >
      <div className="relative aspect-4/5 bg-slate-ink">
        {item.kind === "video" ? (
          <video
            className="h-full w-full object-cover"
            src={item.url ? `${item.url}#t=${POSTER_TIME}` : undefined}
            poster={item.posterUrl ?? undefined}
            preload="metadata"
            muted
            playsInline
          />
        ) : (
          <Image
            src={item.url ?? ""}
            alt={item.alt}
            fill
            sizes="200px"
            className="object-cover"
            unoptimized
          />
        )}

        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="drag-handle absolute top-1.5 left-1.5 grid size-7 place-items-center border border-bone/20 bg-void/70 text-bone backdrop-blur"
        >
          <GripVertical size={13} />
        </button>

        {isCover ? (
          <span className="absolute top-1.5 right-1.5 border border-accent bg-void/80 px-1.5 py-1 font-mono text-[0.5rem] tracking-[0.14em] text-accent uppercase">
            Cover
          </span>
        ) : onSetCover ? (
          <button
            type="button"
            onClick={onSetCover}
            title="Use as cover"
            className="absolute top-1.5 right-1.5 grid size-7 place-items-center border border-bone/20 bg-void/70 text-bone backdrop-blur"
          >
            <Star size={12} />
          </button>
        ) : null}

        <span className="absolute bottom-1.5 left-1.5 bg-void/75 px-1.5 py-1 font-mono text-[0.5rem] tracking-[0.1em] text-bone-faint uppercase">
          {item.kind}
          {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="font-mono text-[0.5625rem] tracking-[0.14em] text-bone-dim uppercase hover:text-bone"
          >
            {open ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label="Delete media"
            className="text-bone-faint transition-colors hover:text-alert"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {open ? (
          <div className="flex flex-col gap-2">
            <input
              value={item.alt}
              onChange={(event) => onPatch(item.id, { alt: event.target.value })}
              onBlur={() => onSave(item)}
              placeholder="Alt text (accessibility)"
              className="field px-2 py-1.5 text-xs"
            />
            <textarea
              value={item.caption ?? ""}
              onChange={(event) => onPatch(item.id, { caption: event.target.value })}
              onBlur={() => onSave(item)}
              placeholder="Caption"
              rows={2}
              className="field resize-none px-2 py-1.5 text-xs"
            />
            <input
              type="number"
              value={item.year ?? ""}
              onChange={(event) =>
                onPatch(item.id, {
                  year: event.target.value ? Number(event.target.value) : null,
                })
              }
              onBlur={() => onSave(item)}
              placeholder="Year"
              className="field px-2 py-1.5 text-xs"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}
