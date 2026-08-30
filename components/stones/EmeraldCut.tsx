import type { StoneType } from "@/lib/design";
import { STONE, stoneGradient, type Ramp } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import type * as React from "react";

export type StoneArtProps = { type: StoneType };

// See RoundBrilliant.tsx for notes on the shared shading convention.
const TO_RAD = Math.PI / 180;
const LIGHT_DEG = -45;
const angleOf = (x: number, y: number) => Math.atan2(x, -y) / TO_RAD;
const lightFactor = (deg: number) => Math.cos((deg - LIGHT_DEG) * TO_RAD);

function shadeAt(ramp: Ramp, deg: number): string {
  const f = lightFactor(deg);
  if (f > 0.55) return ramp.highlight;
  if (f > 0.15) return ramp.light;
  if (f > -0.25) return ramp.base;
  if (f > -0.65) return ramp.shade;
  return ramp.deep;
}

const pts = (p: Array<[number, number]>) =>
  p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const R = STONE_UNIT_R;

/** Rectangle-with-cut-corners octagon, hw/hh half-extents and c the corner cut, at a given scale. */
function stepOctagon(hw: number, hh: number, c: number, scale: number): Array<[number, number]> {
  const w = hw * scale;
  const h = hh * scale;
  const k = c * scale;
  return [
    [-(w - k), -h],
    [w - k, -h],
    [w, -(h - k)],
    [w, h - k],
    [w - k, h],
    [-(w - k), h],
    [-w, h - k],
    [-w, -(h - k)],
  ];
}

/**
 * Emerald cut: a portrait rectangle with corners nipped off (an octagon
 * silhouette), cut in concentric STEP facets rather than radial ones —
 * two nested rings of 8 trapezoids stepping down to the table. Calm,
 * architectural, no sparkle-pattern crossing the middle — that flatness is
 * the point.
 */
export function EmeraldCut({ type }: StoneArtProps): React.JSX.Element {
  const ramp = STONE[type];

  const hw = R * 0.62;
  const hh = R * 0.88;
  const c = 0.26 * Math.min(hw, hh);

  const outer = stepOctagon(hw, hh, c, 1);
  const mid = stepOctagon(hw, hh, c, 0.72);
  const table = stepOctagon(hw, hh, c, 0.42);

  const ring = (a: Array<[number, number]>, b: Array<[number, number]>) =>
    Array.from({ length: 8 }, (_, i) => {
      const j = (i + 1) % 8;
      const [mx, my] = a[i];
      const [nx, ny] = a[j];
      return {
        d: pts([a[i], a[j], b[j], b[i]]),
        angle: angleOf((mx + nx) / 2, (my + ny) / 2),
      };
    });

  const outerRing = ring(outer, mid);
  const innerRing = ring(mid, table);

  return (
    <g>
      {/* Base wash. */}
      <polygon points={pts(outer)} fill={stoneGradient(type)} stroke={ramp.deep} strokeOpacity={0.35} strokeWidth={1.5} />

      {outerRing.map((f, i) => (
        <polygon key={`o${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.6} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
      ))}
      {innerRing.map((f, i) => (
        <polygon key={`i${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.45} stroke={ramp.deep} strokeOpacity={0.22} strokeWidth={0.85} />
      ))}

      {/* Table: the flat top face. A wedge from the cut corner inward — the table is the
          largest flat face here, and a corner-glint sliver alone would look bare. */}
      <polygon points={pts(table)} fill={ramp.table} stroke={ramp.deep} strokeOpacity={0.3} strokeWidth={1.25} />
      <polygon
        points={pts([table[7], table[0], [table[0][0] * 0.32, table[0][1] * 0.32], [table[7][0] * 0.32, table[7][1] * 0.32]])}
        fill={ramp.highlight}
        fillOpacity={0.4}
      />

      {/* Specular slivers on the top-left CORNER step facets only (edge 7 — the diagonal
          cut corner) — not the full-length left edge, which would read as a shaded
          cylinder rather than a row of individual step cuts. */}
      <g filter="url(#stone-glow)">
        <polygon points={outerRing[7].d} fill={ramp.highlight} fillOpacity={0.6} />
        <polygon points={innerRing[7].d} fill={ramp.highlight} fillOpacity={0.8} />
      </g>

      {/* Dark contact facets on the bottom-right corner (edge 3), for weight. */}
      <polygon points={outerRing[3].d} fill={ramp.deep} fillOpacity={0.3} />
      <polygon points={innerRing[3].d} fill={ramp.deep} fillOpacity={0.4} />
    </g>
  );
}
