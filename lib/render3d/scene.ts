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
import type { DesignState, Stone, View } from "../design";
import { INNER_RADIUS_MM, STONE_ARC_DEG, stoneAngle } from "../render/contract";
import { cutFootprint, outlineRing, pavilionDepth, type GemCut } from "./geometry";

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
  /**
   * Distance from the girdle plane DOWN to the band's outer surface, in mm.
   *
   * Every part of a setting is built to span this. Without it each piece is
   * positioned at some fixed multiple of the stone's radius and the band is
   * wherever it happens to be — which is why the stone floated above the shank,
   * the claws stopped in mid-air, and a big enough bezel drove its cone
   * straight through the ring.
   */
  seatDepth: number;
};

/**
 * Where a stone sits. The seat is solved from the gem's own pavilion depth, so
 * a deep princess automatically rides higher in its claws than a shallow
 * emerald — which is what a setter would do.
 */
export function placeStone(design: DesignState, stone: Stone, isCentre: boolean): Placement {
  const { outerR, width } = bandDims(design);
  const radius = stone.sizeMm / 2;
  const cut = stone.cut as GemCut;
  const drop = pavilionDepth(cut) * radius;

  // Slightly LESS than the pavilion is deep, so the culet is just buried in the
  // metal rather than hovering over it. Proportional to the stone, so it holds
  // at every size. A bezel swallows more of the pavilion still.
  // One rule for every setting. A bezel used to recess the stone much further,
  // which looked right until a big stone pushed the culet clean through the
  // band's inner wall. Sitting every cut just under the surface cannot do that.
  void isCentre;
  const seated = drop * 0.94;

  return {
    angle: stoneAngle(stone.x),
    radial: outerR + seated,
    seatDepth: seated,
    // The FULL band width, not a fraction of it. Squeezing the range made `y`
    // a parameter the agent could set and nobody could see; a stone that can
    // actually reach the band's edge is at least a real design move, and on a
    // wide band with a small accent stone it is a visible one.
    axial: (stone.y - 0.5) * width,
    radius,
  };
}

/* ─────────────────────────────── melee ─────────────────────────────── */

/**
 * Halo: a close ring of melee following the CENTRE STONE'S OWN OUTLINE.
 *
 * A halo is cut to echo the stone it frames — a circle of melee around an
 * emerald cut reads as a mistake, because the gap between stone and halo would
 * pinch at the corners and yawn at the sides. Walking the real outline keeps
 * that gap constant, which is the whole visual point of a halo.
 */
export function haloRing(cut: GemCut, centreRadius: number, count = 16) {
  const size = centreRadius * 0.2;
  // Far enough out to clear the girdle and leave a bead's width of metal.
  const scale = 1 + (size * 1.7) / centreRadius;
  return outlineRing(cut, centreRadius * scale, count).map(([x, z], i) => ({
    key: `halo-${i}`,
    x,
    z,
    radius: size,
    angle: Math.atan2(x, z),
  }));
}

/** The halo's metal rail, as a closed path through the melee centres. */
export function haloRailPath(cut: GemCut, centreRadius: number, count = 48) {
  const size = centreRadius * 0.2;
  const scale = 1 + (size * 1.7) / centreRadius;
  return outlineRing(cut, centreRadius * scale, count);
}

/**
 * Pave: melee along the band's shoulders, spaced by arithmetic rather than by a
 * fixed step.
 *
 * Two separate constraints, and solving only one leaves the other broken. The
 * gap between neighbours has to come from the melee's own diameter, or they
 * overlap the moment the stone grows; and the first melee has to clear the
 * centre stone's GIRDLE — not its centre — or a large centre swallows the inner
 * pair whatever the step is. Both are computed as arc lengths at the band's
 * radius and then converted into x, which is what makes them hold at any size.
 */
export function paveRun(design: DesignState, centre: Stone) {
  const { outerR, width } = bandDims(design);

  // Small enough to sit on the band, and never wider than the band can carry.
  const sizeMm = Math.min(Math.max(1.3, centre.sizeMm * 0.22), width * 0.72);
  const radius = sizeMm / 2;
  const seatR = outerR + radius * 0.34;

  const [fx] = cutFootprint(centre.cut as GemCut);
  // Clear the centre stone's GIRDLE, not its centre, plus a bead of metal.
  const clearance = (centre.sizeMm / 2) * fx + radius * 1.45;
  const step = sizeMm * 1.12;

  /** Arc length at the seat radius, expressed in the 0..1 x coordinate. */
  const arcToX = (arc: number) => ((arc / seatR) * (180 / Math.PI)) / STONE_ARC_DEG;

  return [-3, -2, -1, 1, 2, 3].flatMap((k) => {
    const side = Math.sign(k);
    const rank = Math.abs(k) - 1;
    const x = centre.x + side * arcToX(clearance + rank * step);
    // Once a stone would run past the end of the band's arc there is nowhere
    // left to put it; drop it rather than pile it on the last position.
    if (x <= 0 || x >= 1) return [];
    return [
      {
        key: `pave-${k}`,
        angle: stoneAngle(x),
        // Set INTO the metal: the girdle sits just proud of the band's surface.
        radial: seatR,
        axial: (centre.y - 0.5) * width,
        radius,
      },
    ];
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
  //
  // Aimed at the STONE rather than the middle of the ring. Targeting the centre
  // put the shank in the middle of the frame and left the stone drifting near
  // the top edge — correct framing for a photograph of a hoop, wrong one for a
  // photograph of a gem. The camera comes in a little with it.
  top: { camera: [0, 44, 47], target: [0, 8, 0], fov: 28, quaternion: turned(38) },
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
