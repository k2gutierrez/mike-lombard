"use client";

import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import { useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Reveal primitives.
 *
 * Design rule: content is always *reachable*. The animation only deepens the
 * entrance of something already in the DOM and already visible — it never gates
 * visibility on JavaScript, on an IntersectionObserver callback, or on a scroll
 * event. That keeps the portfolio readable for crawlers, for a full-page
 * screenshot, and for anyone whose JS failed.
 *
 * Animation quantities stay small (a short lift plus a slight defocus) and run
 * `once`, so nothing keeps moving while someone is looking at a piece.
 */

type RevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
  as?: "div" | "section" | "li" | "article" | "header";
};

export function Reveal({
  children,
  delay = 0,
  y = 10,
  className = "",
  once = true,
  as = "div",
}: RevealProps) {
  const reduced = prefersReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;

  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0.55, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </MotionTag>
  );
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0.55, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Parent for a group of `RevealItem`s. */
export function RevealGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0, margin: "0px 0px -12% 0px" }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/**
 * Slow parallax for hero imagery. The range is deliberately small (±26px): it
 * should read as depth, not as movement competing with the artwork.
 */
export function ParallaxMedia({
  children,
  className = "",
  distance = 26,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const reduced = prefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, distance]), {
    stiffness: 90,
    damping: 30,
    mass: 0.4,
  });

  return (
    <div ref={ref} className={className}>
      {reduced ? (
        children
      ) : (
        <motion.div style={{ y }} className="h-full w-full">
          {children}
        </motion.div>
      )}
    </div>
  );
}

/** Thin accent line that fills as the page is read. */
export function ScrollProgress() {
  const reduced = prefersReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 left-0 z-[60] h-px w-full origin-left bg-accent/70"
    />
  );
}

/** Route change transition: a quick lift, never a blocking curtain. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = prefersReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0.4, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Banner shown on every page while an admin is previewing drafts. */
export function PreviewBanner({ label = "Preview — unpublished changes" }: { label?: string }) {
  return (
    <div className="sticky top-[68px] z-40 flex flex-wrap items-center justify-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2 text-center font-mono text-[0.625rem] tracking-[0.14em] text-accent uppercase backdrop-blur">
      {label}
    </div>
  );
}
