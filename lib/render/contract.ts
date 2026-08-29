/**
 * THE COORDINATE CONTRACT.
 *
 * Everything drawn into the ring canvas — band, stones, settings, engraving —
 * shares this one space. Read this before writing any geometry. Pure data and
 * pure functions only: NO React imports anywhere under lib/render/.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CANVAS
 *   viewBox is "0 0 1000 1000". SVG convention: origin top-left, +y is DOWN.
 *   CENTER = (500, 500) is the finger axis in every view.
 *
 * SCALE
 *   UNITS_PER_MM converts real millimetres to user units. A UK size-M ring has
 *   an inner radius of ~8.75mm, so the band's inner edge sits at ~227 units and
 *   a chunky 4mm band reaches ~331 — comfortably inside the 500-unit half-width.
 *
 * THE THREE VIEWS
 *   'top'    Looking straight down the finger axis. The band is a full annulus
 *            centred on CENTER. Stones sit ON the band. This is the hero view.
 *   'side'   The ring tilted towards the viewer: the annulus is foreshortened
 *            into an ellipse (squashed vertically by SIDE_SQUASH) and stones
 *            rise ABOVE it by their setting height, so you can read how high
 *            the stone sits. This is the view that sells the setting.
 *   'inside' The band unrolled into a horizontal strip across the canvas,
 *            inner surface facing the viewer. This is where engraving lives.
 *
 * STONE PLACEMENT — how x and y are interpreted
 *   A stone's x and y are normalised 0..1 and mean the same thing in every view:
 *     x  position AROUND the band. 0.5 is dead centre (12 o'clock in 'top');
 *        0 and 1 are STONE_ARC_DEG/2 either side of it.
 *     y  position ACROSS the band's width. 0 is the inner edge (towards the
 *        finger), 1 is the outer edge. 0.5 is centred.
 *   So "move the stone off-centre" is a change in x, and it reads correctly
 *   whichever view is showing.
 *
 * STONE ART CONTRACT — read this before drawing a cut
 *   A stone component draws its cut CENTRED ON THE ORIGIN (0,0), sized to fit
 *   inside a circle of radius STONE_UNIT_R. It applies no transform of its own.
 *   The parent positions it with the transform from `stoneTransform()`.
 *   This is what lets one stone drawing serve all three views and every size.
 * ────────────────────────────────────────────────────────────────────────
 */

import type { DesignState, Stone, View } from "../design";

export const VIEW_BOX = "0 0 1000 1000";
export const CANVAS = 1000;
export const CENTER = { x: 500, y: 500 } as const;

/** User units per real millimetre. */
export const UNITS_PER_MM = 26;

/** Inner radius of a UK size-M band, in mm. */
export const INNER_RADIUS_MM = 8.75;

/** Stone art is drawn centred on (0,0), inscribed in a circle of this radius. */
export const STONE_UNIT_R = 100;

/** Total arc, in degrees, that x=0..1 sweeps around the band. */
export const STONE_ARC_DEG = 110;

/** Vertical foreshortening of the annulus in the 'side' view. */
export const SIDE_SQUASH = 0.28;

/** How far above the band a stone floats in 'side' view, per mm of stone. */
export const SIDE_LIFT_PER_MM = 8;

export const mm = (v: number) => v * UNITS_PER_MM;

export type BandRadii = { innerR: number; outerR: number; midR: number; widthU: number };

export function bandRadii(design: DesignState): BandRadii {
  const innerR = mm(INNER_RADIUS_MM);
  const widthU = mm(design.band.widthMm);
  return { innerR, outerR: innerR + widthU, midR: innerR + widthU / 2, widthU };
}

/** Angle in radians for a stone's x, measured from 12 o'clock, +x clockwise. */
export function stoneAngle(x: number): number {
  const deg = (x - 0.5) * STONE_ARC_DEG;
  return (deg * Math.PI) / 180;
}

export type StoneTransform = {
  cx: number;
  cy: number;
  /** Multiply STONE_UNIT_R by this to get the stone's drawn radius. */
  scale: number;
  /** Degrees, for the SVG rotate() — keeps a stone aligned to the band. */
  rotate: number;
};

/**
 * Where a stone lands, in every view. Compose as:
 *   `translate(cx cy) rotate(rotate) scale(scale)`
 * which is exactly what `stoneTransformAttr()` returns.
 */
export function stoneTransform(
  design: DesignState,
  stone: Stone,
  view: View = design.view,
): StoneTransform {
  const { innerR, widthU } = bandRadii(design);
  const scale = (mm(stone.sizeMm) / 2) / STONE_UNIT_R;
  const theta = stoneAngle(stone.x);
  const radial = innerR + stone.y * widthU;

  if (view === "inside") {
    const strip = insideStrip(design);
    return {
      cx: strip.x + stone.x * strip.width,
      cy: strip.y + stone.y * strip.height,
      scale,
      rotate: 0,
    };
  }

  // Screen-space direction of "up the band" at this angle.
  const dx = Math.sin(theta);
  const dy = -Math.cos(theta);

  if (view === "side") {
    const lift = mm(stone.sizeMm) * (SIDE_LIFT_PER_MM / UNITS_PER_MM);
    return {
      cx: CENTER.x + dx * radial,
      cy: CENTER.y + dy * radial * SIDE_SQUASH - lift,
      scale,
      rotate: 0,
    };
  }

  return {
    cx: CENTER.x + dx * radial,
    cy: CENTER.y + dy * radial,
    scale,
    rotate: (theta * 180) / Math.PI,
  };
}

export function stoneTransformAttr(t: StoneTransform): string {
  return `translate(${t.cx.toFixed(2)} ${t.cy.toFixed(2)}) rotate(${t.rotate.toFixed(2)}) scale(${t.scale.toFixed(4)})`;
}

/** The unrolled band in 'inside' view: a horizontal strip across the canvas. */
export function insideStrip(design: DesignState) {
  const height = Math.max(mm(design.band.widthMm) * 2.2, 150);
  const width = 760;
  return {
    x: (CANVAS - width) / 2,
    y: CENTER.y - height / 2,
    width,
    height,
  };
}

/** Inverse of stoneTransform's x/y, for drag-to-move. Returns normalised 0..1. */
export function pointToStoneXY(
  design: DesignState,
  px: number,
  py: number,
  view: View = design.view,
): { x: number; y: number } {
  const { innerR, widthU } = bandRadii(design);

  if (view === "inside") {
    const strip = insideStrip(design);
    return {
      x: (px - strip.x) / strip.width,
      y: (py - strip.y) / strip.height,
    };
  }

  const dx = px - CENTER.x;
  const dy = (py - CENTER.y) / (view === "side" ? SIDE_SQUASH : 1);
  const theta = Math.atan2(dx, -dy);
  const radial = Math.hypot(dx, dy);

  return {
    x: (theta * 180) / Math.PI / STONE_ARC_DEG + 0.5,
    y: (radial - innerR) / widthU,
  };
}
