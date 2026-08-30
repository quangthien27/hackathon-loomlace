/**
 * Engraved text: cut into the metal, following whichever surface it sits on.
 *
 * Both curves below are traced LEFT TO RIGHT in screen space (start point's
 * x < end point's x). That's what keeps <textPath> glyphs upright: SVG lays
 * each character's baseline tangent to the path in the direction of travel,
 * so as long as we never travel "backwards" (right to left, or over a pole),
 * the text reads normally instead of coming out mirrored or upside down.
 */

import type { DesignState, View } from "../design";
import { CENTER, bandRadii, insideStrip, SIDE_SQUASH } from "./contract";
import { METAL } from "./materials";

export type EngravingRender = {
  /** Path for <textPath>, or null if the text should be drawn straight. */
  pathD: string | null;
  pathId: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  fill: string;
  x?: number;
  y?: number;
};

const FONTS: Record<"serif" | "script", string> = {
  serif: `"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "Times New Roman", serif`,
  script: `"Parisienne", "Great Vibes", "Brush Script MT", "Segoe Script", cursive`,
};

/**
 * Average glyph advance as a fraction of font-size for the stacks above —
 * only used to fit text to an available run length, not for exact layout.
 */
const CHAR_WIDTH_FACTOR = 0.55;
const NOMINAL_CHARS = 30;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 64;

/**
 * Size text as if ~30 characters is a comfortable full line, but shrink
 * further for anything longer so it never overflows the available run.
 */
function fitFontSize(text: string, availableRun: number): number {
  const nominal = availableRun / (NOMINAL_CHARS * CHAR_WIDTH_FACTOR);
  const toFit = availableRun / (Math.max(text.length, 1) * CHAR_WIDTH_FACTOR);
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.min(nominal, toFit)));
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function polarXY(cx: number, cy: number, r: number, deg: number, squashY = 1) {
  return { x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) * squashY };
}

/**
 * Open elliptical arc from startDeg to endDeg, for <textPath>. Same angle
 * convention as band.ts: increasing degrees sweeps clockwise on screen.
 */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number, squashY = 1): string {
  const span = endDeg - startDeg;
  const largeArc = Math.abs(span) > 180 ? 1 : 0;
  const sweep = span >= 0 ? 1 : 0;
  const p1 = polarXY(cx, cy, r, startDeg, squashY);
  const p2 = polarXY(cx, cy, r, endDeg, squashY);
  return (
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
    `A ${r.toFixed(2)} ${(r * squashY).toFixed(2)} 0 ${largeArc} ${sweep} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  );
}

// 150deg -> 30deg sweeps through 90deg ("south" in this file's convention),
// i.e. across the LOWER portion of the ring, and goes left to right (see the
// file header), so the text sits upright reading under the ring rather than
// mirrored above it.
const OUTSIDE_ARC: [number, number] = [150, 30];

export function engravingRender(design: DesignState, view: View): EngravingRender | null {
  const eng = design.engraving;
  if (!eng || !eng.text.trim()) return null;
  if (eng.placement === "inside" && view !== "inside") return null;
  if (eng.placement === "outside" && view === "inside") return null;

  const fill = METAL[design.band.metal].deep; // cut-into-metal reads as the darkest tone in the ramp
  const fontFamily = FONTS[eng.font];
  const letterSpacingFactor = eng.font === "script" ? 0 : 0.04; // scripts want to flow; serifs get a touch of air

  if (view === "inside") {
    const strip = insideStrip(design);
    const margin = strip.width * 0.08;
    const runLength = strip.width - margin * 2;
    const fontSize = fitFontSize(eng.text, runLength);
    const midY = strip.y + strip.height / 2;
    const midX = strip.x + strip.width / 2;
    const bulge = strip.height * 0.1; // shallow arc echoing the strip's own barrel curve
    const pathD =
      `M ${(strip.x + margin).toFixed(2)} ${midY.toFixed(2)} ` +
      `Q ${midX.toFixed(2)} ${(midY - bulge).toFixed(2)} ${(strip.x + strip.width - margin).toFixed(2)} ${midY.toFixed(2)}`;
    return {
      pathD,
      pathId: "engraving-path-inside",
      text: eng.text,
      fontFamily,
      fontSize,
      letterSpacing: fontSize * letterSpacingFactor,
      fill,
    };
  }

  // 'top' or 'side': outside engraving follows the band's mid-radius circle.
  const { midR } = bandRadii(design);
  const squashY = view === "side" ? SIDE_SQUASH : 1;
  const spanRad = Math.abs(rad(OUTSIDE_ARC[1] - OUTSIDE_ARC[0]));
  // Rough ellipse arc length: average the x- and y-radii rather than an
  // elliptic integral — plenty accurate for sizing text to fit.
  const effectiveR = (midR + midR * squashY) / 2;
  const runLength = effectiveR * spanRad * 0.85; // margin so the text doesn't crowd the arc's ends
  const fontSize = fitFontSize(eng.text, runLength);
  const pathD = arcPath(CENTER.x, CENTER.y, midR, OUTSIDE_ARC[0], OUTSIDE_ARC[1], squashY);

  return {
    pathD,
    pathId: `engraving-path-${view}`,
    text: eng.text,
    fontFamily,
    fontSize,
    letterSpacing: fontSize * letterSpacingFactor,
    fill,
  };
}
