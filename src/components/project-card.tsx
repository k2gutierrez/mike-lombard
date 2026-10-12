import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MediaFrame } from "@/components/media";
import { aspectRatio, coverOf } from "@/lib/media";
import type { MediaItem, Project } from "@/lib/types";

/**
 * Project card. The image is the card: no chrome, no shadow, no rounded corners.
 * On hover the frame lifts a hair and the title underline draws in — enough to
 * feel alive, not enough to compete with the work.
 */
export function ProjectCard({
  project,
  index,
  size = "default",
  priority = false,
}: {
  project: Project;
  index: number;
  size?: "default" | "large";
  priority?: boolean;
}) {
  const cover: MediaItem | undefined = coverOf(project.media, project.coverMediaId);
  const ratio = cover ? aspectRatio(cover) : size === "large" ? "16 / 10" : "4 / 5";

  return (
    <Link
      href={`/works/${project.slug}`}
      className="card-hover group block focus-visible:outline-offset-4"
    >
      <div
        className="relative overflow-hidden border border-edge bg-pit transition-colors duration-500 group-hover:border-edge-soft"
        style={{ aspectRatio: size === "large" ? "16 / 10" : ratio }}
      >
        {cover ? (
          <MediaFrame
            media={cover}
            sizes={size === "large" ? "(max-width: 900px) 100vw, 62vw" : "(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"}
            priority={priority}
            interactive={false}
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-slate-ink">
            <span className="font-mono text-[0.625rem] tracking-[0.18em] text-bone-faint uppercase">
              No cover yet
            </span>
          </div>
        )}
        <span className="absolute top-3 left-3 font-mono text-[0.5625rem] tracking-[0.18em] text-bone/60">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="truncate font-display text-lg tracking-tight">{project.title}</h3>
            {project.year ? (
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-bone-faint">
                {project.year}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[0.5625rem] tracking-[0.18em] text-bone-faint uppercase">
            {project.category}
            {project.subtitle ? ` · ${project.subtitle}` : ""}
          </p>
        </div>
        <ArrowUpRight
          size={16}
          aria-hidden="true"
          className="mt-1 shrink-0 text-bone-faint transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
        />
      </div>
    </Link>
  );
}
