"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignState } from "@/lib/design";
import { designsDifferNumerically, easeOutCubic, lerpDesign } from "@/lib/animate";

const DURATION_MS = 420;

/**
 * Returns a design that eases towards the real one, for RENDERING ONLY.
 *
 * Deliberately not done inside the store. The store must always hold the true,
 * final design, because that is what `get_design_state` returns — an agent
 * reading a half-finished tween would be worse than no animation at all. So the
 * truth updates instantly and only the pixels lag, which is also why a human
 * dragging a stone gets a 1:1 response while an agent's edit glides in.
 */
export function useEasedDesign(target: DesignState): DesignState {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const shownRef = useRef(target);

  // Declared before the tween effect so it has already run — and therefore
  // shownRef holds the latest frame — by the time the tween effect reads it.
  useEffect(() => {
    shownRef.current = shown;
  });

  useEffect(() => {
    // Discrete changes (metal, cut, view) have already snapped via lerpDesign;
    // if nothing continuous moved there is nothing to animate.
    if (!designsDifferNumerically(shownRef.current, target)) {
      setShown(target);
      return;
    }

    fromRef.current = shownRef.current;
    startRef.current = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / DURATION_MS);
      setShown(lerpDesign(fromRef.current, target, easeOutCubic(t)));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return shown;
}
