import type { StoneType } from "@/lib/design";
import { STONE, stoneGradient, type Ramp } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import type * as React from "react";

export type StoneArtProps = { type: StoneType };

// See RoundBrilliant.tsx for notes on the shared shading convention.
const TO_RAD = Math.PI / 180;
const LIGHT_DEG = -45;

const R = STONE_UNIT_R;
/** Long axis is vertical, roughly 1.4:1 — the ellipse still inscribes in the unit circle (ry = R). */
const ASPECT = 1 / 1.4;

const ellipse = (deg: number, r: number): [number, number] => {
  const a = deg * TO_RAD;
  return [Math.sin(a) * r * ASPECT, -Math.cos(a) * r];
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

/**
 * Oval brilliant: the exact same three-ring facet logic as RoundBrilliant,
 * just parameterised over an ellipse instead of a circle (long axis vertical).
 * The 8-fold star/bezel/girdle rhythm still reads clearly once stretched —
 * that stretch, plus the elongated table, is what tells the eye "oval".
 */
export function OvalCut({ type }: StoneArtProps): React.JSX.Element {
  const ramp = STONE[type];

  const RT = R * 0.4;
  const RC = R * 0.68;

  const table = Array.from({ length: 8 }, (_, k) => ellipse(k * 45, RT));
  const crown = Array.from({ length: 8 }, (_, k) => ellipse(k * 45 + 22.5, RC));
  const girdle = Array.from({ length: 8 }, (_, k) => ellipse(k * 45, R));

  const star = Array.from({ length: 8 }, (_, k) => ({
    d: pts([table[k], crown[k], table[(k + 1) % 8]]),
    angle: k * 45 + 22.5,
  }));
  const bezel = Array.from({ length: 8 }, (_, k) => ({
    d: pts([crown[(k + 7) % 8], girdle[k], crown[k]]),
    angle: k * 45,
  }));
  const notch = Array.from({ length: 8 }, (_, k) => ({
    d: pts([girdle[k], crown[k], girdle[(k + 1) % 8]]),
    angle: k * 45 + 22.5,
  }));

  return (
    <g>
      {/* Base wash: a true ellipse (via rx/ry on an <ellipse>, cheaper and crisper than a polygon approximation). */}
      <ellipse rx={R * ASPECT} ry={R} fill={stoneGradient(type)} stroke={ramp.deep} strokeOpacity={0.35} strokeWidth={1.5} />

      {bezel.map((f, i) => (
        <polygon key={`bz${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.6} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
      ))}
      {notch.map((f, i) => (
        <polygon key={`nt${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.4} stroke={ramp.deep} strokeOpacity={0.2} strokeWidth={0.75} />
      ))}
      {star.map((f, i) => (
        <polygon key={`st${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.55} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
      ))}

      {/* Elongated octagonal table. */}
      <polygon points={pts(table)} fill={ramp.table} stroke={ramp.deep} strokeOpacity={0.3} strokeWidth={1.25} />
      <polygon
        points={pts([ellipse(280, RT * 0.85), ellipse(340, RT * 0.5), ellipse(20, RT * 0.85)])}
        fill={ramp.highlight}
        fillOpacity={0.4}
      />

      <g filter="url(#stone-glow)">
        <polygon points={pts([ellipse(-56, R * 0.98), ellipse(-56, R * 0.68), ellipse(-36, R * 0.76), ellipse(-36, R * 0.99)])} fill={ramp.highlight} fillOpacity={0.85} />
        <polygon points={pts([ellipse(-14, R * 0.94), ellipse(-14, R * 0.62), ellipse(0, R * 0.72)])} fill={ramp.highlight} fillOpacity={0.6} />
      </g>

      <polygon points={pts([ellipse(128, R * 0.5), ellipse(150, R * 0.98), ellipse(172, R * 0.52)])} fill={ramp.deep} fillOpacity={0.35} />
    </g>
  );
}
