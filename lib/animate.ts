/**
 * Pure interpolation helpers for tweening between two DesignStates.
 *
 * The renderer eases the design towards a target so an agent edit redraws
 * legibly instead of snapping. Someone else owns the requestAnimationFrame
 * wiring; this file is only the maths, so it stays callable from tests, from
 * the UI, and from a WebMCP tool handler alike.
 *
 * Only continuous numeric fields are interpolated: band.widthMm and each
 * stone's sizeMm/x/y (matched by id). Everything discrete — metal, profile,
 * cut, type, setting, view, engraving, sizeUk — snaps to `to` immediately,
 * because there's no meaningful "halfway" between e.g. "round" and "oval".
 */

import { clamp, type DesignState, type Stone } from "./design";

/**
 * How long a tween takes. Lives here rather than in the hook that runs it
 * because two things depend on it: the rAF loop, and the delay `saveLook`
 * waits before photographing the ring. That second one fails silently — raise
 * the duration without raising the wait and thumbnails quietly start showing
 * half-morphed band widths — so the number has one home and both read it.
 */
export const DURATION_MS = 420;

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolates from `from` towards `to`. The stone list is always keyed on
 * `to`: a stone removed in `to` disappears immediately (never rendered mid-
 * fade-out), and a stone newly added in `to` scales up from sizeMm 0 at its
 * final x/y (there is no prior position to animate from, so it doesn't fly
 * in from anywhere — it grows in place).
 *
 * t <= 0 yields a result whose numerics equal `from`'s (for stones that
 * exist in both); t >= 1 yields `to` exactly.
 */
export function lerpDesign(from: DesignState, to: DesignState, t: number): DesignState {
  if (t >= 1) return to;
  const tt = clamp(t, 0, 1);

  const fromStones = new Map(from.stones.map((s) => [s.id, s]));

  const stones: Stone[] = to.stones.map((toStone) => {
    const fromStone = fromStones.get(toStone.id);
    if (fromStone) {
      return {
        ...toStone,
        sizeMm: lerp(fromStone.sizeMm, toStone.sizeMm, tt),
        x: lerp(fromStone.x, toStone.x, tt),
        y: lerp(fromStone.y, toStone.y, tt),
      };
    }
    // Newly added stone — grow from nothing at its final position.
    return { ...toStone, sizeMm: lerp(0, toStone.sizeMm, tt) };
  });

  return {
    ...to,
    band: { ...to.band, widthMm: lerp(from.band.widthMm, to.band.widthMm, tt) },
    stones,
  };
}

/**
 * Whether `a` and `b` differ in any continuous numeric field — the signal
 * the rAF wiring uses to decide a tween is worth starting at all (a preset
 * that only flips discrete fields shouldn't schedule a no-op animation loop).
 */
export function designsDifferNumerically(a: DesignState, b: DesignState): boolean {
  if (a.band.widthMm !== b.band.widthMm) return true;
  if (a.stones.length !== b.stones.length) return true;

  const aStones = new Map(a.stones.map((s) => [s.id, s]));
  for (const bStone of b.stones) {
    const aStone = aStones.get(bStone.id);
    if (!aStone) return true;
    if (aStone.sizeMm !== bStone.sizeMm || aStone.x !== bStone.x || aStone.y !== bStone.y) {
      return true;
    }
  }
  return false;
}
