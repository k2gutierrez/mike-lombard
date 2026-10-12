"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Ambient canvas field.
 *
 * Deliberately cheap: a slow-drifting lattice of dots plus a soft focus that
 * follows the cursor at very low opacity. No per-frame allocations, capped DPR,
 * paused when the tab is hidden or the element scrolls away, and completely off
 * under `prefers-reduced-motion`. It reads as "digital gallery", not as an effect
 * competing with the art.
 */
export function AmbientField({
  density = 1,
  className = "",
}: {
  density?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let running = true;
    let visible = true;

    const pointer = { x: -1000, y: -1000, tx: -1000, ty: -1000 };

    type Node = { x: number; y: number; z: number; r: number };
    let nodes: Node[] = [];

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const spacing = 62 / Math.max(0.6, density);
      const count = Math.min(1500, Math.ceil((width / spacing) * (height / spacing)));
      const step = Math.sqrt((width * height) / Math.max(1, count));
      nodes = [];
      for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
          nodes.push({ x, y, z: Math.random(), r: 0.5 + Math.random() * 0.9 });
        }
      }
    };

    let t = 0;
    const draw = () => {
      t += 0.0016;
      ctx.clearRect(0, 0, width, height);
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      for (const node of nodes) {
        const drift = Math.sin(t * 2 + node.z * 6.28) * 6;
        const x = node.x + drift;
        const y = node.y + Math.cos(t * 1.4 + node.z * 5) * 5;

        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.hypot(dx, dy);
        const focus = dist < 240 ? 1 - dist / 240 : 0;

        const alpha = 0.055 + node.z * 0.06 + focus * 0.5;
        ctx.fillStyle = `rgba(236, 235, 230, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, node.r + focus * 0.9, 0, Math.PI * 2);
        ctx.fill();

        if (focus > 0.35) {
          ctx.strokeStyle = `rgba(143, 214, 193, ${(focus * 0.16).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 7, y);
          ctx.lineTo(x + 7, y);
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x, y + 7);
          ctx.stroke();
        }
      }

      if (running && visible) raf = requestAnimationFrame(draw);
    };

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      pointer.tx = event.clientX - rect.left;
      pointer.ty = event.clientY - rect.top;
    };

    const onVisibility = () => {
      running = !document.hidden;
      if (running && visible) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        cancelAnimationFrame(raf);
        if (visible && running) raf = requestAnimationFrame(draw);
      },
      { threshold: 0 },
    );

    build();
    observer.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const onResize = () => {
      build();
    };
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      running = false;
    };
  }, [density, reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
