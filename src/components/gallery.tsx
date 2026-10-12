"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MediaFrame, VideoPlayer } from "@/components/media";
import { formatBytes, formatDuration } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

/** Fallback blur swatch: a solid pit-grey pixel, no extra request. */
const BLUR =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSc4JyBoZWlnaHQ9JzgnPjxyZWN0IHdpZHRoPSc4JyBoZWlnaHQ9JzgnIGZpbGw9JyMxNDE3MTknLz48L3N2Zz4=";

export function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: MediaItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const go = useCallback(
    (delta: number) => {
      if (index === null || !items.length) return;
      const next = (index + delta + items.length) % items.length;
      onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [index, go, onClose]);

  if (!mounted) return null;

  const current = index === null ? null : items[index];

  return createPortal(
    <AnimatePresence>
      {current ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={current.alt || "Media viewer"}
          className="fixed inset-0 z-[100] flex flex-col bg-void/97 backdrop-blur-sm"
          initial={reduced ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
                {current.kind === "video" ? "Video" : "Image"} · {(index ?? 0) + 1} / {items.length}
                {current.year ? ` · ${current.year}` : ""}
                {current.bytes ? ` · ${formatBytes(current.bytes)}` : ""}
                {current.durationS ? ` · ${formatDuration(current.durationS)}` : ""}
              </p>
              {current.alt ? (
                <p className="mt-1 truncate text-sm text-bone-dim">{current.alt}</p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close viewer"
              className="grid size-10 shrink-0 place-items-center border border-edge text-bone transition-colors hover:border-bone hover:bg-bone hover:text-void"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">
            <div className="relative flex h-full w-full items-center justify-center">
              {current.kind === "video" ? (
                <div className="w-full max-w-5xl">
                  <VideoPlayer
                    key={current.id}
                    media={current}
                    ratio={undefined}
                    autoPlay
                    muted
                    loop
                  />
                </div>
              ) : (
                <div className="relative h-full max-h-full w-full max-w-6xl">
                  <Image
                    src={current.url ?? ""}
                    alt={current.alt || "Artwork"}
                    fill
                    sizes="(max-width: 768px) 100vw, 90vw"
                    className="object-contain"
                    priority
                    placeholder="blur"
                    blurDataURL={BLUR}
                  />
                </div>
              )}
            </div>

            {items.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous item"
                  className="absolute left-2 grid size-11 place-items-center border border-edge bg-void/70 text-bone transition-colors hover:border-bone sm:left-4"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next item"
                  className="absolute right-2 grid size-11 place-items-center border border-edge bg-void/70 text-bone transition-colors hover:border-bone sm:right-4"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : null}
          </div>

          {current.caption ? (
            <div className="border-t border-edge px-4 py-4 sm:px-6">
              <p className="mx-auto max-w-3xl text-sm text-bone-dim">{current.caption}</p>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Gallery with rhythm: a deliberate mix of full-bleed and paired items instead
 * of a uniform grid, so a portfolio with mixed aspect ratios reads as a spread.
 */
export function Gallery({
  items,
  emptyNote = "No media published yet.",
}: {
  items: MediaItem[];
  emptyNote?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!items.length) {
    return (
      <p className="border border-dashed border-edge px-6 py-10 text-sm text-bone-faint">
        {emptyNote}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {items.map((media, index) => {
          const wide = media.width && media.height ? media.width / media.height > 1.5 : false;
          return (
            <figure
              key={media.id}
              className={wide ? "sm:col-span-2" : undefined}
            >
              <MediaFrame
                media={media}
                sizes={wide ? "100vw" : "(max-width: 640px) 100vw, 50vw"}
                onOpen={() => setOpenIndex(index)}
              />
              {(media.caption || media.alt || media.year) && (
                <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-bone-faint">
                  {media.year ? (
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] text-bone-dim">
                      {media.year}
                    </span>
                  ) : null}
                  <span className="text-bone-dim">{media.caption || media.alt}</span>
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
      <Lightbox
        items={items}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
      />
    </>
  );
}
