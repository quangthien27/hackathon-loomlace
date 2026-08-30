"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignState } from "@/lib/design";
import { designsDifferNumerically, easeOutCubic, lerpDesign } from "@/lib/animate";

const DURATION_MS = 420;

/**
 * Returns a design that eases towards the real one, for RENDERING ONLY.
 *
 * Pass `snap` while the human is dragging: see the note in the effect.
 *
 * Deliberately not done inside the store. The store must always hold the true,
 * final design, because that is what `get_design_state` returns — an agent
 * reading a half-finished tween would be worse than no animation at all. So the
 * truth updates instantly and only the pixels lag, which is also why a human
 * dragging a stone gets a 1:1 response while an agent's edit glides in.
 */
export function useEasedDesign(target: DesignState, snap = false): DesignState {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const shownRef = useRef(target);
  const wasSnapping = useRef(snap);

  /**
   * Remember what was actually RENDERED, not what is in state.
   *
   * The two differ while dragging, and that difference is the whole bug this
   * guards against. A drag already follows the cursor 1:1, so easing it would
   * be easing an animation — and every pointermove restarts the tween, leaving
   * the state further and further behind. Recording the state instead of the
   * rendered value meant that the instant the drag ended, the next tween began
   * from wherever the abandoned animation had got to and slid forward to catch
   * up: the stone appeared to bounce back along the band before settling.
   *
   * Declared before the tween effect so it has already run by the time that
   * effect reads it.
   */
  useEffect(() => {
    shownRef.current = snap ? target : shown;
  });

  useEffect(() => {
    // The render where a drag ENDS needs its own case. By the time this runs,
    // the sync effect above has already written the stale state into shownRef
    // — state that stopped being updated the moment the drag began — so the
    // usual path would tween from a position the stone left several hundred
    // milliseconds ago. That backwards slide is the bounce. There is nothing to
    // animate here anyway: the stone is already exactly where it was dropped.
    const dragJustEnded = wasSnapping.current && !snap;
    wasSnapping.current = snap;

    if (snap) return;

    if (dragJustEnded) {
      setShown(target);
      return;
    }

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
  }, [target, snap]);

  return snap ? target : shown;
}
