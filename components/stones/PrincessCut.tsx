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

/** Outward-facing angle of the side between corner i and corner j (their angular midpoint). */
function sideAngle(i: number, j: number): number {
  return (CORNER_DEG[i] + CORNER_DEG[j] + (j === 0 ? 360 : 0)) / 2;
}

/**
 * Princess cut: a square outline whose crown facets step down corner-to-corner
 * through the table, so the seams between the side facets trace two full
 * diagonals — the signature X. Three concentric rings (outer→m1→m2→table)
 * give it chevron depth, and the outermost ring is split along that same
 * diagonal into a near/far pair per side — the ridge a real princess crown
 * shows just inside the girdle.
 */
export function PrincessCut({ type }: StoneArtProps): React.JSX.Element {
  const ramp = STONE[type];

  const outer = CORNER_DEG.map((d) => polar(d, R));
  const m1 = CORNER_DEG.map((d) => polar(d, R * 0.74));
  const m2 = CORNER_DEG.map((d) => polar(d, R * 0.5));
  const table = CORNER_DEG.map((d) => polar(d, R * 0.28));

  const ring = (a: Array<[number, number]>, b: Array<[number, number]>) =>
    Array.from({ length: 4 }, (_, i) => {
      const j = (i + 1) % 4;
      return { d: pts([a[i], a[j], b[j], b[i]]), angle: sideAngle(i, j) };
    });

  // The outer ring, split along its diagonal seam into a near triangle (at
  // corner j, towards the girdle) and a far triangle (at corner i, towards m1).
  const outerSplit = Array.from({ length: 4 }, (_, i) => {
    const j = (i + 1) % 4;
    return {
      near: pts([outer[i], outer[j], m1[j]]),
      far: pts([outer[i], m1[j], m1[i]]),
      angle: sideAngle(i, j),
    };
  });
  const midRing = ring(m1, m2);
  const innerRing = ring(m2, table);

  return (
    <g>
      {/* Base wash. */}
      <polygon points={pts(outer)} fill={stoneGradient(type)} stroke={ramp.deep} strokeOpacity={0.35} strokeWidth={1.5} />

      {outerSplit.map((f, i) => (
        <g key={`o${i}`}>
          <polygon points={f.near} fill={shadeAt(ramp, f.angle)} fillOpacity={0.68} stroke={ramp.deep} strokeOpacity={0.28} strokeWidth={1.25} />
          <polygon points={f.far} fill={shadeAt(ramp, f.angle)} fillOpacity={0.5} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
        </g>
      ))}
      {midRing.map((f, i) => (
        <polygon key={`m${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.5} stroke={ramp.deep} strokeOpacity={0.24} strokeWidth={1} />
      ))}
      {innerRing.map((f, i) => (
        <polygon key={`i${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.4} stroke={ramp.deep} strokeOpacity={0.22} strokeWidth={0.9} />
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
