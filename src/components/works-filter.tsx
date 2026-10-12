"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ProjectCard } from "@/components/project-card";
import type { Project } from "@/lib/types";

/**
 * Client-side category filter. All published projects are already in the page
 * (no extra request per filter), and the transition is a crossfade plus a small
 * lift so switching feels like turning a page rather than re-rendering a list.
 */
export function WorksFilter({
  projects,
  categories,
  initialCategory = "all",
}: {
  projects: Project[];
  categories: string[];
  initialCategory?: string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(initialCategory);

  const visible = useMemo(
    () => (active === "all" ? projects : projects.filter((p) => p.category === active)),
    [active, projects],
  );

  const tabs = ["all", ...categories];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter works by category"
        className="flex flex-wrap items-center gap-2 border-b border-edge pb-5"
      >
        {tabs.map((tab) => {
          const count =
            tab === "all"
              ? projects.length
              : projects.filter((project) => project.category === tab).length;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active === tab}
              data-active={active === tab}
              onClick={() => setActive(tab)}
              className="tab"
            >
              {tab}
              <span className="ml-2 text-bone-faint">{String(count).padStart(2, "0")}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          initial={reduced ? undefined : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visible.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              priority={index < 3}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {!visible.length ? (
        <p className="mt-12 border border-dashed border-edge px-6 py-12 text-sm text-bone-faint">
          Nothing published in this category yet.
        </p>
      ) : null}
    </div>
  );
}
