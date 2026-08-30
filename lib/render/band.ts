/**
 * Band geometry: the metal ring itself, in all three views.
 *
 * Every shape here is built from two primitives:
 *  - `ringPath`    a full annulus (outer ellipse minus inner ellipse), using
 *                  opposite winding directions so the hole punches through
 *                  under the SVG default (nonzero) fill rule — no fill-rule
 *                  attribute required from the renderer.
 *  - `sectorPath`  a partial annulus (a "slice" between two angles), used for
 *                  the specular highlight and occlusion arcs that make the
 *                  ring read as curved metal rather than a flat disc.
 *
 * Angle convention (local to this file — stone placement elsewhere uses its
 * own convention, see contract.ts): theta is measured from the positive
 * x-axis, x = r*cos(theta), y = r*sin(theta). Because SVG's y-axis points
 * down, increasing theta sweeps CLOCKWISE on screen: 0deg = 3 o'clock,
 * 90deg = 6 o'clock, 180deg = 9 o'clock, 270deg = 12 o'clock.
 */

import type { DesignState, View } from "../design";
import { CENTER, bandRadii, insideStrip, SIDE_SQUASH } from "./contract";
import { METAL, metalGradient, metalGradientEdge } from "./materials";

export type BandLayer = { d: string; fill: string; opacity?: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

function polarXY(cx: number, cy: number, r: number, deg: number, squashY = 1) {
  return { x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) * squashY };
}

/** One full ellipse traced with a given winding (sweepFlag 1 = CW, 0 = CCW). */
function ellipseArc(cx: number, cy: number, rx: number, ry: number, sweepFlag: 0 | 1): string {
  return (
    `M ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} ` +
    `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 ${sweepFlag} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} ` +
    `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 ${sweepFlag} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} Z`
  );
}

/**
 * A full annulus (ring) between rOuter and rInner. The outer ellipse winds
 * clockwise, the inner counter-clockwise; opposite windings under the
 * default nonzero fill rule punch the hole without needing evenodd.
 */
function ringPath(cx: number, cy: number, rOuter: number, rInner: number, squashY = 1): string {
  return `${ellipseArc(cx, cy, rOuter, rOuter * squashY, 1)} ${ellipseArc(cx, cy, rInner, rInner * squashY, 0)}`;
}

/** A partial annulus ("pie slice with a bite out of it") between two angles. */
function sectorPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
  squashY = 1,
): string {
  const span = endDeg - startDeg;
  const largeArc = Math.abs(span) > 180 ? 1 : 0;
  const sweep: 0 | 1 = span >= 0 ? 1 : 0;
  const innerSweep: 0 | 1 = sweep === 1 ? 0 : 1;
  const p1 = polarXY(cx, cy, rOuter, startDeg, squashY);
  const p2 = polarXY(cx, cy, rOuter, endDeg, squashY);
  const p3 = polarXY(cx, cy, rInner, endDeg, squashY);
  const p4 = polarXY(cx, cy, rInner, startDeg, squashY);
  return (
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
    `A ${rOuter.toFixed(2)} ${(rOuter * squashY).toFixed(2)} 0 ${largeArc} ${sweep} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} ` +
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} ` +
    `A ${rInner.toFixed(2)} ${(rInner * squashY).toFixed(2)} 0 ${largeArc} ${innerSweep} ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`
  );
}

/**
 * The unrolled strip's top/bottom edges bow outward in the middle, like a
 * barrel: we're looking at a slice of the inside of a cylinder, and
 * flattening a curved surface stretches its centre relative to its ends.
 */
function barrelPath(x: number, y: number, width: number, height: number, bulge: number): string {
  const midX = x + width / 2;
  return (
    `M ${x.toFixed(2)} ${y.toFixed(2)} ` +
    `Q ${midX.toFixed(2)} ${(y - bulge).toFixed(2)} ${(x + width).toFixed(2)} ${y.toFixed(2)} ` +
    `L ${(x + width).toFixed(2)} ${(y + height).toFixed(2)} ` +
    `Q ${midX.toFixed(2)} ${(y + height + bulge).toFixed(2)} ${x.toFixed(2)} ${(y + height).toFixed(2)} Z`
  );
}

/** Specular highlight arc: upper-left, where a ring catches overhead light. */
const UPPER_LEFT: [number, number] = [200, 262];
/** Inner-rim occlusion arc: lower-right, opposite the highlight. */
const LOWER_RIGHT: [number, number] = [16, 82];

/**
 * Shared by 'top' and 'side' (side is 'top' with the y-radius squashed by
 * `squashY`): a base/face pair, then profile-specific shading, then the
 * specular highlight and inner occlusion arcs that sell "metal, not donut".
 */
function ringLayers(
  metal: DesignState["band"]["metal"],
  profile: DesignState["band"]["profile"],
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  midR: number,
  widthU: number,
  squashY: number,
): BandLayer[] {
  const ramp = METAL[metal];
  const edgeW = Math.max(widthU * 0.12, 4);
  const layers: BandLayer[] = [
    // Backing: a darker full ring underneath everything, so the rim never
    // shows a seam between the edge and the inset face drawn over it.
    { d: ringPath(cx, cy, outerR, innerR, squashY), fill: metalGradientEdge(metal) },
    // Main face, inset from the true edges so the backing peeks out as a rim.
    {
      d: ringPath(cx, cy, outerR - edgeW * 0.5, innerR + edgeW * 0.5, squashY),
      fill: metalGradient(metal),
    },
  ];

  if (profile === "court") {
    // Rounded cross-section: both edges roll away from the light, so shade
    // them; the highlight (below) is widened and softened into a band
    // through the middle instead of a crisp line.
    layers.push(
      { d: ringPath(cx, cy, outerR - edgeW * 0.5, outerR - edgeW * 1.7, squashY), fill: ramp.shade, opacity: 0.35 },
      { d: ringPath(cx, cy, innerR + edgeW * 1.7, innerR + edgeW * 0.5, squashY), fill: ramp.shade, opacity: 0.35 },
    );
  } else if (profile === "bevel") {
    // Flat in the middle, with a chamfer cut along each edge. Unlike a court's
    // roll-off these are hard-edged bands, which is what separates the two.
    const chamfer = widthU * 0.22;
    layers.push(
      { d: ringPath(cx, cy, outerR - edgeW * 0.5, outerR - chamfer, squashY), fill: ramp.shade, opacity: 0.45 },
      { d: ringPath(cx, cy, innerR + chamfer, innerR + edgeW * 0.5, squashY), fill: ramp.shade, opacity: 0.45 },
    );
  } else if (profile === "knife-edge") {
    // A raised ridge along the centre: a bright, narrow band at midR, with
    // the metal shaded darker on both sides as the cross-section falls away.
    const ridgeHalf = widthU * 0.07;
    layers.push(
      { d: ringPath(cx, cy, outerR - edgeW * 0.5, midR + ridgeHalf, squashY), fill: ramp.shade, opacity: 0.5 },
      { d: ringPath(cx, cy, midR - ridgeHalf, innerR + edgeW * 0.5, squashY), fill: ramp.shade, opacity: 0.5 },
      { d: ringPath(cx, cy, midR + ridgeHalf, midR - ridgeHalf, squashY), fill: ramp.highlight, opacity: 0.85 },
    );
  }
  // 'flat' adds nothing here: an even face plus a crisp, higher-contrast
  // highlight band (below) is exactly what a flat profile should look like —
  // no roll-off, no ridge, just a hard-edged plane.

  const highlightWidth = profile === "flat" ? widthU * 0.46 : widthU * 0.3;
  const highlightOpacity = profile === "knife-edge" ? 0.25 : profile === "flat" ? 0.7 : 0.4;
  layers.push({
    d: sectorPath(
      cx,
      cy,
      midR + highlightWidth / 2,
      midR - highlightWidth / 2,
      UPPER_LEFT[0],
      UPPER_LEFT[1],
      squashY,
    ),
    fill: ramp.highlight,
    opacity: highlightOpacity,
  });

  layers.push({
    d: sectorPath(cx, cy, innerR + edgeW * 1.4, innerR, LOWER_RIGHT[0], LOWER_RIGHT[1], squashY),
    fill: ramp.deep,
    opacity: 0.3,
  });

  return layers;
}

export function bandLayers(design: DesignState, view: View): BandLayer[] {
  const { metal, profile } = design.band;
  const { innerR, outerR, midR, widthU } = bandRadii(design);

  if (view === "top") {
    return ringLayers(metal, profile, CENTER.x, CENTER.y, outerR, innerR, midR, widthU, 1);
  }

  if (view === "side") {
    return ringLayers(metal, profile, CENTER.x, CENTER.y, outerR, innerR, midR, widthU, SIDE_SQUASH);
  }

  // 'inside': the band unrolled into a flat, gently barrelled strip — the
  // surface engraving sits on.
  const strip = insideStrip(design);
  const ramp = METAL[metal];
  const bulge = strip.height * 0.06;
  const edgeH = Math.max(strip.height * 0.14, 8);
  const edgeBulge = bulge * (edgeH / strip.height); // scale curvature to the sliver's own height

  const layers: BandLayer[] = [
    { d: barrelPath(strip.x, strip.y, strip.width, strip.height, bulge), fill: metalGradient(metal) },
    // Darker slivers along the top and bottom edges read as the surface
    // curving away from the viewer, top and bottom, inside the cylinder.
    { d: barrelPath(strip.x, strip.y, strip.width, edgeH, edgeBulge), fill: ramp.shade, opacity: 0.4 },
    {
      d: barrelPath(strip.x, strip.y + strip.height - edgeH, strip.width, edgeH, edgeBulge),
      fill: ramp.shade,
      opacity: 0.4,
    },
    // A soft sheen through the middle third, where the cylindrical surface
    // is most face-on to the viewer.
    {
      d: barrelPath(
        strip.x,
        strip.y + strip.height / 2 - strip.height * 0.16,
        strip.width,
        strip.height * 0.32,
        bulge * 0.5,
      ),
      fill: ramp.highlight,
      opacity: 0.3,
    },
  ];

  if (profile === "knife-edge") {
    // The ridge still reads as a bright line even unrolled flat.
    layers.push({
      d: barrelPath(strip.x, strip.y + strip.height / 2 - 3, strip.width, 6, bulge * 0.5),
      fill: ramp.highlight,
      opacity: 0.7,
    });
  }
  // 'court' is already covered by the general sheen band above; 'flat'
  // deliberately gets no extra treatment (even face, hard edges).

  return layers;
}

/** Outer silhouette only, for the renderer's drop shadow. */
export function bandOutlinePath(design: DesignState, view: View): string {
  const { innerR, outerR } = bandRadii(design);
  if (view === "top") return ringPath(CENTER.x, CENTER.y, outerR, innerR, 1);
  if (view === "side") return ringPath(CENTER.x, CENTER.y, outerR, innerR, SIDE_SQUASH);
  const strip = insideStrip(design);
  const bulge = strip.height * 0.06;
  return barrelPath(strip.x, strip.y, strip.width, strip.height, bulge);
}
