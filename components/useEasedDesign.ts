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
 *
 * ───────────────────────────── dragging ─────────────────────────────
 * Pass `snap` true while the human is dragging. A drag already follows the
 * cursor 1:1, so easing it would mean easing an animation — and because every
 * pointermove restarts the tween, `shown` falls further and further behind.
 *
 * The subtlety is the single render where the drag ENDS. `shown` has been
 * frozen at a stale value throughout the drag, so returning it for even one
 * frame flashes the stone back to where it was several hundred milliseconds
 * ago. Correcting that from an effect is too late: the effect runs after the
 * browser has already painted the stale frame.
 *
 * So the correction happens DURING render, using React's documented pattern for
 * adjusting state when a prop changes — a setState in the render body, which
 * React handles by re-rendering immediately, before anything reaches the
 * screen. There is no frame in which the wrong position exists.
 */
export function useEasedDesign(target: DesignState, snap = false): DesignState {
  const [shown, setShown] = useState(target);
  const [wasSnapping, setWasSnapping] = useState(snap);

  if (wasSnapping !== snap) {
    setWasSnapping(snap);
    // Landing, not animating: the stone is already exactly where it was
    // dropped, and the only thing out of date is this hook's own state.
    if (!snap) setShown(target);
  }

  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const shownRef = useRef(target);

  /**
   * Remember what was actually RENDERED, not what is in state — the two differ
   * while dragging. Declared before the tween effect so it has already run by
   * the time that effect reads it.
   */
  useEffect(() => {
    shownRef.current = snap ? target : shown;
  });

  useEffect(() => {
    if (snap) return;

    // Discrete changes (metal, cut, view) have already snapped via lerpDesign;
    // if nothing continuous moved there is nothing to animate. A drag that has
    // just ended lands here too, because the render-time adjustment above has
    // already brought `shown` up to the target.
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
  }, [target, snap]);

  return snap ? target : shown;
}
