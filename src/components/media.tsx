"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { aspectRatio, formatBytes, formatDuration, posterSrc } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

/**
 * Media renderer.
 *
 * Images go through next/image (right-sized, lazy, AVIF/WebP). Videos are NOT
 * downloaded until the visitor presses play: before that the element has no
 * `src`, only a poster. `preload="none"` plus a poster keeps a gallery of ten
 * clips from pulling hundreds of megabytes on first paint.
 */
/**
 * Shown when an object is recorded in the database but Storage cannot serve it.
 *
 * This is not hypothetical: seven rows pointed at files that were never in the
 * bucket, and the interface rendered a silent empty frame — the artist reported
 * "I change the photo and nothing happens". A missing file must be visible and
 * attributable, in the panel and on the site.
 */
export function MissingMedia({ media, note }: { media: Pick<MediaItem, "alt">; note?: string }) {
  return (
    <div className="grid h-full w-full place-items-center border border-alert/40 bg-alert/5 px-4 text-center">
      <div className="max-w-[18rem]">
        <p className="font-mono text-[0.625rem] tracking-[0.16em] text-alert uppercase">
          File missing
        </p>
        <p className="mt-2 truncate text-xs text-bone-dim">{media.alt || "(no name)"}</p>
        <p className="mt-2 text-xs leading-relaxed text-bone-faint">
          {note ?? "The record exists but the file is not in storage. Delete it and upload it again."}
        </p>
      </div>
    </div>
  );
}

export function MediaFrame({
  media,
  sizes = "100vw",
  priority = false,
  className = "",
  interactive = true,
  onOpen,
}: {
  media: MediaItem;
  sizes?: string;
  priority?: boolean;
  className?: string;
  interactive?: boolean;
  onOpen?: () => void;
}) {
  const ratio = aspectRatio(media);
  const [failed, setFailed] = useState(false);

  if (media.kind === "video") {
    return (
      <VideoPlayer
        media={media}
        ratio={ratio}
        className={className}
        interactive={interactive}
      />
    );
  }

  if (failed) {
    return (
      <div className={`relative ${className}`} style={{ aspectRatio: ratio }}>
        <MissingMedia media={media} />
      </div>
    );
  }

  return (
    <div
      className={`group relative overflow-hidden bg-pit ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={media.url ?? ""}
        alt={media.alt || media.caption || "Artwork"}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        onError={() => setFailed(true)}
        placeholder={media.width && media.height ? "blur" : "empty"}
        blurDataURL={
          media.width && media.height
            ? `data:image/svg+xml;base64,${Buffer.from(
                `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#141719"/></svg>`,
              ).toString("base64")}`
            : undefined
        }
      />
      {interactive && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${media.alt || "image"} full size`}
          className="absolute inset-0 z-10 cursor-zoom-in"
        >
          <span className="absolute right-3 bottom-3 grid size-9 place-items-center border border-bone/25 bg-void/60 text-bone opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <Maximize2 size={14} aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function VideoPlayer({
  media,
  ratio,
  className = "",
  interactive = true,
  autoPlay = false,
  muted = false,
  loop = false,
}: {
  media: MediaItem;
  ratio?: string;
  className?: string;
  interactive?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(autoPlay);
  const [playing, setPlaying] = useState(autoPlay);
  const [mutedState, setMutedState] = useState(muted || autoPlay);
  const [failed, setFailed] = useState(false);
  const poster = posterSrc(media);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!started) {
      node.pause();
      return;
    }
    node.play().catch(() => {
      // Autoplay can be blocked; the controls remain available.
      setPlaying(false);
    });
  }, [started]);

  useEffect(() => {
    if (!interactive) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting && !node.paused) {
          node.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [interactive, started]);

  const toggle = () => {
    const node = ref.current;
    if (!node) return;
    if (!started) {
      setStarted(true);
      setPlaying(true);
      return;
    }
    if (node.paused) {
      node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      node.pause();
      setPlaying(false);
    }
  };

  return (
    <div
      className={`group relative overflow-hidden bg-pit ${className}`}
      style={{ aspectRatio: ratio ?? aspectRatio(media) }}
    >
      <video
        ref={ref}
        className="h-full w-full object-cover"
        poster={poster ?? undefined}
        src={started ? (media.url ?? undefined) : undefined}
        preload="none"
        playsInline
        muted={mutedState || autoPlay}
        loop={loop || autoPlay}
        controls={interactive && started}
        onError={() => setFailed(true)}
        onEnded={() => setPlaying(false)}
      />

      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-pit/90 px-6 text-center">
          <p className="max-w-xs text-sm text-bone-dim">
            This video could not be played in your browser.{" "}
            <a
              className="text-accent underline"
              href={media.url ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              Open the file
            </a>
            .
          </p>
        </div>
      ) : null}

      {interactive ? (
        <>
          {!started ? (
            <button
              type="button"
              onClick={toggle}
              className="absolute inset-0 z-10 grid place-items-center"
              aria-label={`Play video${media.alt ? `: ${media.alt}` : ""}`}
            >
              <span className="grid size-16 place-items-center border border-bone/30 bg-void/55 text-bone backdrop-blur transition-all duration-300 group-hover:scale-105 group-hover:border-bone/60">
                <Play size={18} aria-hidden="true" />
              </span>
              <span className="absolute bottom-4 left-4 flex items-center gap-3 font-mono text-[0.5625rem] tracking-[0.16em] text-bone/80 uppercase">
                Video
                {media.durationS ? <span>· {formatDuration(media.durationS)}</span> : null}
                {media.bytes ? <span>· {formatBytes(media.bytes)}</span> : null}
              </span>
            </button>
          ) : (
            <div className="absolute bottom-3 left-3 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause video" : "Play video"}
                className="grid size-9 place-items-center border border-bone/25 bg-void/60 text-bone backdrop-blur"
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMutedState((value) => !value);
                  const node = ref.current;
                  if (node) node.muted = !mutedState;
                }}
                aria-label={mutedState ? "Unmute video" : "Mute video"}
                className="grid size-9 place-items-center border border-bone/25 bg-void/60 text-bone backdrop-blur"
              >
                {mutedState ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  const node = ref.current;
                  if (!node) return;
                  node.currentTime = 0;
                  node.play().then(() => setPlaying(true)).catch(() => undefined);
                }}
                aria-label="Restart video"
                className="grid size-9 place-items-center border border-bone/25 bg-void/60 text-bone backdrop-blur"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
