"use client";

import { useEffect, useState } from "react";

/**
 * Reduced-motion preference, hydration-safe.
 *
 * Motion's `useReducedMotion()` reads `matchMedia` synchronously on the client,
 * so the very first client render disagreed with the server for anyone who has
 * "reduce motion" enabled — React reported a hydration mismatch and threw the
 * tree away to re-render it. Here the value starts as `true` (the static, safe
 * rendering, which is also what the server renders) and is corrected after mount.
 *
 * The practical consequence is that reduced-motion users get the static
 * presentation on first paint and keep it; nobody gets content hidden behind an
 * animation that never runs.
 */
export function prefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
