/**
 * PROCEDURAL GEM AND BAND GEOMETRY.
 *
 * Pure three.js geometry. No React, no store — the same rule as lib/render/.
 *
 * Why build the stones from facets rather than import a model: every stone is
 * a function of `sizeMm` and `cut`, and a bought GLTF would freeze both. The
 * whole WebMCP story is that the tools change real parameters, so the geometry
 * has to be parametric too.
 *
 * Facets are flat-shaded on purpose. A gem sparkles because ~57 flat faces each
 * catch the environment at a different angle; smooth normals would average that
 * into a soft blob no matter how good the material is.
 */

import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from "three";

const RAD = Math.PI / 180;

/** A polygonal facet, vertices in order around its rim. */
type Facet = Vector3[];

/** Point on a circle of radius r at height y. 0deg is +Z, increasing clockwise seen from +Y. */
const at = (deg: number, r: number, y: number) =>
  new Vector3(Math.sin(deg * RAD) * r, y, Math.cos(deg * RAD) * r);

/**
 * Non-indexed flat-shaded geometry from convex facets.
 *
 * Winding is corrected automatically rather than by hand: every gem below is
 * convex around the origin, so any facet whose normal points back towards the
 * origin is simply reversed. Getting 74 facets wound correctly by hand is an
 * afternoon of hunting black triangles; this is two lines.
 */
function facetGeometry(facets: Facet[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();

  for (const facet of facets) {
    if (facet.length < 3) continue;

    const centroid = facet
      .reduce((acc, v) => acc.add(v), new Vector3())
      .multiplyScalar(1 / facet.length);

    ab.subVectors(facet[1], facet[0]);
    ac.subVectors(facet[2], facet[0]);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();

    const outward = n.dot(centroid) >= 0;
    const rim = outward ? facet : [...facet].reverse();
    if (!outward) n.negate();

    // Fan from the first vertex. Facets here are convex, so a fan is exact.
    for (let i = 1; i < rim.length - 1; i++) {
      for (const v of [rim[0], rim[i], rim[i + 1]]) {
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return g;
}

/* ────────────────────────────── round brilliant ────────────────────────────── */

/**
 * Standard round brilliant proportions, expressed against a girdle RADIUS of 1.
 * These are the real numbers a cutter works to — crown 34.5deg / pavilion 40.75deg
 * is the Tolkowsky-ish ideal, and using it rather than eyeballed values is what
 * makes the facet junctions line up the way a photographed diamond's do.
 */
const BRILLIANT = {
  girdleHalf: 0.03,
  crownDeg: 34.5,
  pavilionDeg: 40.75,
  tableR: 0.57,
  /** How far a star facet reaches from the table edge towards the girdle. */
  starLength: 0.55,
  /** How far the lower-girdle facets reach from the girdle down towards the culet. */
  lowerLength: 0.77,
  /** A true point would give a degenerate normal; a tiny flat culet is also what real stones have. */
  culetR: 0.022,
};

function brilliantFacets(): Facet[] {
  const { girdleHalf: gh, crownDeg, pavilionDeg, tableR, starLength, lowerLength, culetR } = BRILLIANT;

  const crownRise = (1 - tableR) * Math.tan(crownDeg * RAD);
  const pavilionDrop = (1 - culetR) * Math.tan(pavilionDeg * RAD);
  const yTable = gh + crownRise;
  const yCulet = -gh - pavilionDrop;

  const T = (k: number) => at(k * 45, tableR, yTable);
  const GU = (j: number) => at(j * 22.5, 1, gh);
  const GL = (j: number) => at(j * 22.5, 1, -gh);

  // The shoulder point where star, kite and two upper-girdle facets meet. Its
  // height is solved so it lies ON the kite plane — otherwise the kite is not
  // planar and the facet catches light as two half-facets.
  const sR = tableR + starLength * (1 - tableR);
  const yS = gh + ((1 - sR * Math.cos(22.5 * RAD)) / (1 - tableR)) * crownRise;
  const S = (k: number) => at(k * 45 + 22.5, sR, yS);

  // Same solve on the pavilion side.
  const pR = 1 - lowerLength * (1 - culetR);
  const yP = -gh - ((1 - pR * Math.cos(22.5 * RAD)) / (1 - culetR)) * pavilionDrop;
  const P = (k: number) => at(k * 45 + 22.5, pR, yP);
  const CU = (k: number) => at(k * 45 + 22.5, culetR, yCulet);

  const facets: Facet[] = [];
  const m8 = (k: number) => ((k % 8) + 8) % 8;
  const m16 = (j: number) => ((j % 16) + 16) % 16;

  facets.push(Array.from({ length: 8 }, (_, k) => T(k)));                              // table
  for (let k = 0; k < 8; k++) facets.push([T(k), S(k), T(k + 1)]);                      // 8 star
  for (let k = 0; k < 8; k++) facets.push([T(k), S(m8(k - 1)), GU(2 * k), S(k)]);       // 8 kite
  for (let k = 0; k < 8; k++) {                                                        // 16 upper girdle
    facets.push([S(k), GU(m16(2 * k + 1)), GU(m16(2 * k))]);
    facets.push([S(k), GU(m16(2 * k + 2)), GU(m16(2 * k + 1))]);
  }
  for (let j = 0; j < 16; j++) facets.push([GU(j), GU(j + 1), GL(j + 1), GL(j)]);       // girdle band
  for (let k = 0; k < 8; k++)                                                          // 8 pavilion mains
    facets.push([GL(2 * k), P(m8(k - 1)), CU(m8(k - 1)), CU(k), P(k)]);
  for (let k = 0; k < 8; k++) {                                                        // 16 lower girdle
    facets.push([P(k), GL(m16(2 * k)), GL(m16(2 * k + 1))]);
    facets.push([P(k), GL(m16(2 * k + 1)), GL(m16(2 * k + 2))]);
  }
  facets.push(Array.from({ length: 8 }, (_, k) => CU(k)));                              // culet

  return facets;
}

/* ─────────────────────────────── step cut ─────────────────────────────── */

/** Rectangle with the corners nipped off, as an 8-point rim at radius `scale`. */
function stepOctagon(hw: number, hh: number, cut: number, scale: number, y: number): Vector3[] {
  const w = hw * scale;
  const h = hh * scale;
  const c = cut * scale;
  return [
    [-(w - c), -h], [w - c, -h], [w, -(h - c)], [w, h - c],
    [w - c, h], [-(w - c), h], [-w, h - c], [-w, -(h - c)],
  ].map(([x, z]) => new Vector3(x, y, z));
}

/** Emerald cut: concentric octagon steps. The calm, mirror-like look is the point. */
function stepCutFacets(hw: number, hh: number): Facet[] {
  const cut = 0.26 * Math.min(hw, hh);
  const gh = 0.03;
  const rings = [
    { s: 1.0, y: -gh - 0.62 }, // pavilion keel
    { s: 0.62, y: -gh - 0.34 },
    { s: 1.0, y: -gh },        // girdle bottom
    { s: 1.0, y: gh },         // girdle top
    { s: 0.84, y: gh + 0.11 },
    { s: 0.68, y: gh + 0.2 },
    { s: 0.5, y: gh + 0.27 },  // table
  ].map((r) => stepOctagon(hw, hh, cut, r.s, r.y));

  const facets: Facet[] = [];
  // Pavilion is built the other way up, so walk every adjacent pair of rings.
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      facets.push([rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]]);
    }
  facets.push([...rings[rings.length - 1]]); // table
  facets.push([...rings[0]]);                // keel
  return facets;
}

/** Princess: square girdle, chevron pavilion stepping to a small culet. */
function princessFacets(): Facet[] {
  const gh = 0.03;
  const sq = (r: number, y: number, twist = 0) =>
    [45, 135, 225, 315].map((d) => at(d + twist, r, y));

  const table = sq(0.34, gh + 0.3);
  const crownMid = sq(0.74, gh + 0.14);
  const gu = sq(1, gh);
  const gl = sq(1, -gh);
  // A twisted intermediate ring is what produces the princess chevrons.
  const pavMid = sq(0.62, -gh - 0.42, 45);
  const culet = sq(0.06, -gh - 0.78);

  const band = (a: Vector3[], b: Vector3[]): Facet[] =>
    Array.from({ length: 4 }, (_, i) => {
      const j = (i + 1) % 4;
      return [a[i], a[j], b[j], b[i]];
    });
  // The twisted ring meets the ring above as 8 triangles, not 4 quads.
  const chevrons = (a: Vector3[], b: Vector3[]): Facet[] =>
    Array.from({ length: 4 }, (_, i) => {
      const j = (i + 1) % 4;
      return [[a[i], a[j], b[i]], [a[j], b[j], b[i]]] as Facet[];
    }).flat();

  return [
    [...table],
    ...band(table, crownMid),
    ...band(crownMid, gu),
    ...band(gu, gl),
    ...chevrons(gl, pavMid),
    ...band(pavMid, culet),
    [...culet],
  ];
}

/* ─────────────────────────────── public API ─────────────────────────────── */

export type GemCut = "round" | "oval" | "emerald" | "princess";

/**
 * A gem inscribed in a unit sphere-ish envelope: girdle radius 1 in x/z, table
 * up (+Y), culet down. The caller scales by sizeMm/2 and orients it. Oval is
 * the same brilliant narrowed on one axis, which is very nearly what an oval
 * actually is.
 */
const CACHE = new Map<GemCut, BufferGeometry>();

export function gemGeometry(cut: GemCut): BufferGeometry {
  const hit = CACHE.get(cut);
  if (hit) return hit;

  const g =
    cut === "emerald" ? facetGeometry(stepCutFacets(0.68, 1))
    : cut === "princess" ? facetGeometry(princessFacets())
    : facetGeometry(brilliantFacets());

  if (cut === "oval") g.scale(0.72, 1, 1);
  CACHE.set(cut, g);
  return g;
}

/** How deep the gem sits below its girdle, in gem radii. Used to seat it on the band. */
export function pavilionDepth(cut: GemCut): number {
  if (cut === "emerald") return 0.65;
  if (cut === "princess") return 0.81;
  return BRILLIANT.girdleHalf + (1 - BRILLIANT.culetR) * Math.tan(BRILLIANT.pavilionDeg * RAD);
}

/** Total height table-to-culet, in gem radii — what `thickness` wants for refraction. */
export function gemDepth(cut: GemCut): number {
  if (cut === "emerald") return 0.92;
  if (cut === "princess") return 1.11;
  return BRILLIANT.girdleHalf * 2 + (1 - BRILLIANT.tableR) * Math.tan(BRILLIANT.crownDeg * RAD)
    + (1 - BRILLIANT.culetR) * Math.tan(BRILLIANT.pavilionDeg * RAD);
}

/* ─────────────────────────────── band profile ─────────────────────────────── */

/**
 * The band's cross-section, revolved around Y by LatheGeometry.
 *
 * Traversal order matters: three derives each normal from the profile tangent,
 * so the OUTER surface must run in +y and the INNER surface in -y, or the ring
 * renders inside-out. Points are (radius, axial position).
 */
export function bandProfile(
  profile: "flat" | "court" | "knife-edge",
  innerR: number,
  thickness: number,
  width: number,
): Vector2[] {
  const i = innerR;
  const o = innerR + thickness;
  const hw = width / 2;
  const c = Math.min(0.1, thickness * 0.22, width * 0.14); // edge chamfer; no real ring has a raw 90deg edge
  const N = 10;

  // Comfort fit: the inner surface is relieved towards the edges, so the ring
  // rides on a narrow band in the middle rather than on two sharp rims.
  const innerAt = (t: number) => i + (profile === "flat" ? 0 : 0.18 * thickness * t * t);

  const outerAt = (t: number) => {
    if (profile === "flat") return o;
    if (profile === "court") return o - 0.3 * thickness * t * t;
    return o + 0.42 * thickness * (1 - Math.abs(t)); // knife-edge: a ridge down the centre
  };

  const pts: Vector2[] = [];
  const span = hw - c;

  // Outer surface, running +y.
  for (let k = 0; k <= N; k++) {
    const t = -1 + (2 * k) / N;
    pts.push(new Vector2(outerAt(t), t * span));
  }
  pts.push(new Vector2(outerAt(1) - c, hw));   // chamfer over the top edge
  pts.push(new Vector2(innerAt(1) + c, hw));   // across the face to the inner wall
  // Inner surface, running -y.
  for (let k = 0; k <= N; k++) {
    const t = 1 - (2 * k) / N;
    pts.push(new Vector2(innerAt(t), t * span));
  }
  pts.push(new Vector2(innerAt(-1) + c, -hw));
  pts.push(new Vector2(outerAt(-1) - c, -hw));
  pts.push(pts[0].clone());                    // close the loop, or the shell has no caps

  return pts;
}

/**
 * Half-extents of a cut's girdle outline, in gem radii, as [x, z].
 * Settings need this: claws sit on the outline, and a bezel follows it.
 */
export function cutFootprint(cut: GemCut): [number, number] {
  if (cut === "oval") return [0.72, 1];
  if (cut === "emerald") return [0.68, 1];
  return [1, 1];
}

/** Number of sides in a cut's girdle outline — a bezel wall traces this. */
export function cutSides(cut: GemCut): number {
  if (cut === "princess") return 4;
  if (cut === "emerald") return 8;
  return 48;
}

/** The girdle outline as a closed 2D rim, for building bezels and collars. */
export function girdleOutline(cut: GemCut, radius: number): Vector2[] {
  const [fx, fz] = cutFootprint(cut);
  if (cut === "princess")
    return [45, 135, 225, 315].map(
      (d) => new Vector2(Math.sin(d * RAD) * radius, Math.cos(d * RAD) * radius),
    );
  if (cut === "emerald") {
    const c = 0.26 * Math.min(fx, 1) * radius;
    const w = fx * radius;
    const h = radius;
    return [
      [-(w - c), -h], [w - c, -h], [w, -(h - c)], [w, h - c],
      [w - c, h], [-(w - c), h], [-w, h - c], [-w, -(h - c)],
    ].map(([x, z]) => new Vector2(x, z));
  }
  const n = 48;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new Vector2(Math.sin(a) * radius * fx, Math.cos(a) * radius * fz);
  });
}
