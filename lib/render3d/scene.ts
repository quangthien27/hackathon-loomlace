/**
 * THE 3D PLACEMENT CONTRACT — the counterpart to lib/render/contract.ts.
 *
 * Everything is in REAL MILLIMETRES. There is no viewBox and no units-per-mm
 * fudge: a 2.2mm band is 2.2 units wide and a 6.5mm stone is 6.5 units across.
 * That is most of the appeal of the 3D route — the numbers the tools set are
 * the numbers the renderer uses.
 *
 * ─────────────────────────── A CONTRACT DIVERGENCE ───────────────────────────
 * This does NOT interpret Stone.y the way the SVG renderer does, and the
 * difference is not cosmetic.
 *
 *   SVG:  band.widthMm is the annulus's RADIAL extent, and Stone.y runs from the
 *         inner edge to the outer edge across it. That is a flat-illustration
 *         convention: it makes band width visible in a view where, physically,
 *         it would not be.
 *   3D:   a ring has two independent dimensions. band.widthMm is the extent
 *         ALONG the finger, and radial thickness is a separate ~1.5mm. Stone.y
 *         therefore has to mean axial position across the band's face, because
 *         the radial direction is now only 1.5mm deep and nothing can move
 *         meaningfully within it.
 *
 * So `y` means a different physical quantity in the two renderers, and
 * `band.widthMm` measures a different edge of the ring. Neither can be fixed in
 * the renderer — it is a change to the shared design schema, and lib/price.ts
 * charges band mass off widthMm, so it would reprice every ring too.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Quaternion, Vector3 } from "three";
import { clamp, type DesignState, type Stone, type View } from "../design";
import { INNER_RADIUS_MM, stoneAngle } from "../render/contract";
import { pavilionDepth, type GemCut } from "./geometry";

export type BandDims = {
  innerR: number;
  outerR: number;
  /** Radial wall depth. Real rings sit around 1.3-1.9mm; it grows a little with width. */
  thickness: number;
  /** Axial extent — the dimension that covers your finger. */
  width: number;
};

export function bandDims(design: DesignState): BandDims {
  const width = design.band.widthMm;
  const thickness = 1.2 + width * 0.15;
  return { innerR: INNER_RADIUS_MM, outerR: INNER_RADIUS_MM + thickness, thickness, width };
}

export type Placement = {
  /** Radians about the ring's axis. 0 is the top of the band. */
  angle: number;
  /** Distance from the ring axis out to the gem's GIRDLE plane. */
  radial: number;
  /** Offset along the finger axis. */
  axial: number;
  /** Gem radius (half its stated size). */
  radius: number;
};

/**
 * Where a stone sits. The seat is solved from the gem's own pavilion depth so
 * the culet clears the band by a constant gap whatever the cut — which is what
 * a setter actually does, and why a deep princess sits higher than an emerald.
 */
export function placeStone(design: DesignState, stone: Stone, isCentre: boolean): Placement {
  const { outerR, width } = bandDims(design);
  const radius = stone.sizeMm / 2;
  const cut = stone.cut as GemCut;
  const drop = pavilionDepth(cut) * radius;

  // A bezel swallows the pavilion; claws hold it clear of the metal.
  const seated = isCentre && design.setting === "bezel" ? drop * 0.55 : drop + 0.3;

  return {
    angle: stoneAngle(stone.x),
    radial: outerR + seated,
    // The FULL band width, not a fraction of it. Squeezing the range made `y`
    // a parameter the agent could set and nobody could see; a stone that can
    // actually reach the band's edge is at least a real design move, and on a
    // wide band with a small accent stone it is a visible one.
    axial: (stone.y - 0.5) * width,
    radius,
  };
}

/* ─────────────────────────────── melee ─────────────────────────────── */

/** Halo: a close ring of small stones around the centre, in its girdle plane. */
export function haloRing(centreRadius: number, count = 16) {
  const r = centreRadius * 1.3;
  const size = centreRadius * 0.21;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { key: `halo-${i}`, x: Math.sin(a) * r, z: Math.cos(a) * r, radius: size, angle: a };
  });
}

/** Pave: melee running along the band's shoulders, away from the centre stone. */
export function paveRun(design: DesignState, centre: Stone) {
  const { outerR } = bandDims(design);
  const sizeMm = Math.max(1.3, centre.sizeMm * 0.23);
  const radius = sizeMm / 2;
  return [-3, -2, -1, 1, 2, 3].map((k) => {
    const x = clamp(centre.x + k * 0.09, 0, 1);
    return {
      key: `pave-${k}`,
      angle: stoneAngle(x),
      // Set INTO the metal: the girdle sits just proud of the band's surface.
      radial: outerR + radius * 0.34,
      axial: (centre.y - 0.5) * design.band.widthMm,
      radius,
    };
  });
}

/* ─────────────────────────────── views ─────────────────────────────── */

/**
 * `set_view` becomes a camera move rather than a redraw, which is the one place
 * where 3D is unambiguously the better demo: the same cheap read-only tool call
 * produces a shot that travels instead of a picture that swaps.
 *
 * ── why every view stands the ring up ──
 * A stone's table is perpendicular to the finger axis, so no single camera can
 * show BOTH the band as a circle and the stone face-on: they are 90deg apart.
 * The SVG renderer sidesteps this by not being a physical space — it draws the
 * annulus AND the stone's table together, which is impossible and looks fine.
 * 3D has to choose, and every jeweller chooses the same way: stand the ring up
 * so the band reads as a circle, put the stone at twelve o'clock, and rotate
 * about the vertical to trade a little of one for a little of the other.
 */
export type ViewConfig = {
  camera: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Orientation of the ring itself; some shots need the ring turned, not the camera. */
  quaternion: Quaternion;
};

/**
 * Stands the ring up to face the camera: one -90deg turn about X sends the
 * finger axis from +Y to -Z (pointing away down the view axis, so the band
 * reads as a circle) and the stone's home direction from +Z to +Y, putting it
 * at twelve o'clock.
 *
 * Getting this wrong is easy and silent: an axis order that leaves the finger
 * axis pointing sideways still renders a perfectly plausible ring, just one
 * seen edge-on as a vertical bar.
 */
const STANDING = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

/** Turn about the vertical: swings the band away from face-on, stone stays up. */
const turned = (deg: number) =>
  new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180)
    .multiply(STANDING);

/** Tip the ring away from the camera, opening the bore towards the viewer. */
const leaned = (deg: number) =>
  new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), (deg * Math.PI) / 180)
    .multiply(STANDING);

export const VIEWS: Record<View, ViewConfig> = {
  // The hero. Turned off-axis so the band reads as an ellipse rather than a
  // flat disc, and lifted to ~40deg so the camera can see into the table.
  top: { camera: [0, 43, 51], target: [0, 4, 0], fov: 28, quaternion: turned(38) },
  // Dead-on profile: the shot that sells how high the stone sits.
  side: { camera: [0, 4.5, 67], target: [0, 4.5, 0], fov: 28, quaternion: STANDING },
  // Turned almost side-on so the bore opens towards the camera and the far
  // inner wall — where an engraving would go — faces you.
  // A CLOSE-UP, not a whole-ring shot. The bore is only as deep as the band is
  // wide — about 2.2mm — so the inner wall is always a thin sliver whatever the
  // angle. The SVG could unroll the band into a flat strip; 3D cannot, so the
  // only way to make an engraving legible is to tip the shank away and move in
  // on it. Framing the whole ring here would render the text three pixels tall.
  inside: { camera: [0, 14, 30], target: [0, -6, -6], fov: 22, quaternion: leaned(45) },
};
