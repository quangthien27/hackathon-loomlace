import type { StoneType } from "@/lib/design";
import { STONE, stoneGradient, type Ramp } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import type * as React from "react";

export type StoneArtProps = { type: StoneType };

// See RoundBrilliant.tsx for notes on the shared shading convention.
const TO_RAD = Math.PI / 180;
const LIGHT_DEG = -45;

const polar = (deg: number, r: number): [number, number] => {
  const a = deg * TO_RAD;
  return [Math.sin(a) * r, -Math.cos(a) * r];
};

const pts = (p: Array<[number, number]>) =>
  p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const lightFactor = (deg: number) => Math.cos((deg - LIGHT_DEG) * TO_RAD);

function shadeAt(ramp: Ramp, deg: number): string {
  const f = lightFactor(deg);
  if (f > 0.55) return ramp.highlight;
  if (f > 0.15) return ramp.light;
  if (f > -0.25) return ramp.base;
  if (f > -0.65) return ramp.shade;
  return ramp.deep;
}

const R = STONE_UNIT_R;
/** Corners sit at NE/SE/SW/NW so the square's sides run horizontal/vertical. */
const CORNER_DEG = [45, 135, 225, 315];

/**
 * Princess cut: a square outline whose crown facets step down corner-to-corner
 * through the table, so the seams between the four side-trapezoids trace two
 * full diagonals — the signature X. Two concentric rings (outer→mid→table)
 * give it a little chevron depth instead of one flat trapezoid per side.
 */
export function PrincessCut({ type }: StoneArtProps): React.JSX.Element {
  const ramp = STONE[type];

  const outer = CORNER_DEG.map((d) => polar(d, R));
  const mid = CORNER_DEG.map((d) => polar(d, R * 0.58));
  const table = CORNER_DEG.map((d) => polar(d, R * 0.3));

  const ring = (a: Array<[number, number]>, b: Array<[number, number]>) =>
    Array.from({ length: 4 }, (_, i) => {
      const j = (i + 1) % 4;
      return {
        d: pts([a[i], a[j], b[j], b[i]]),
        // side normal is the midpoint of the two corner angles it spans
        angle: (CORNER_DEG[i] + CORNER_DEG[j] + (j === 0 ? 360 : 0)) / 2,
      };
    });

  const outerRing = ring(outer, mid);
  const innerRing = ring(mid, table);

  return (
    <g>
      {/* Base wash. */}
      <polygon points={pts(outer)} fill={stoneGradient(type)} stroke={ramp.deep} strokeOpacity={0.35} strokeWidth={1.5} />

      {outerRing.map((f, i) => (
        <polygon key={`o${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.62} stroke={ramp.deep} strokeOpacity={0.28} strokeWidth={1.25} />
      ))}
      {innerRing.map((f, i) => (
        <polygon key={`i${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.42} stroke={ramp.deep} strokeOpacity={0.22} strokeWidth={0.9} />
      ))}

      {/* Table. */}
      <polygon points={pts(table)} fill={ramp.table} stroke={ramp.deep} strokeOpacity={0.3} strokeWidth={1.25} />
      <polygon points={pts([polar(280, R * 0.2), polar(340, R * 0.12), polar(20, R * 0.2)])} fill={ramp.highlight} fillOpacity={0.4} />

      {/* Corner glints: bright at the NW (upper-left) tip, into the light. */}
      <g filter="url(#stone-glow)">
        <polygon points={pts([polar(315, R * 0.98), polar(295, R * 0.66), polar(335, R * 0.66)])} fill={ramp.highlight} fillOpacity={0.85} />
        <polygon points={pts([polar(0, R * 0.62), polar(-25, R * 0.5), polar(25, R * 0.5)])} fill={ramp.highlight} fillOpacity={0.5} />
      </g>

      {/* Dark contact facet at the SE (lower-right) tip. */}
      <polygon points={pts([polar(135, R * 0.98), polar(115, R * 0.6), polar(155, R * 0.6)])} fill={ramp.deep} fillOpacity={0.4} />
    </g>
  );
}
