import type { StoneType } from "@/lib/design";
import { STONE, stoneGradient, type Ramp } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import type * as React from "react";

export type StoneArtProps = { type: StoneType };

/**
 * Shared facet-shading maths (duplicated per stone file so each component
 * stays a standalone drop-in — see components/settings/Settings.tsx for the
 * same helpers used on halo/pave accent stones).
 *
 * Angle convention matches lib/render/contract.ts's stoneAngle(): 0deg is
 * straight up, degrees increase CLOCKWISE. The scene's light sits up-and-left
 * (SvgDefs' radial gradients are centred at 35%/25%), i.e. at -45deg here.
 */
const TO_RAD = Math.PI / 180;
const LIGHT_DEG = -45;

const polar = (deg: number, r: number): [number, number] => {
  const a = deg * TO_RAD;
  return [Math.sin(a) * r, -Math.cos(a) * r];
};

const pts = (p: Array<[number, number]>) =>
  p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

/** -1 (facing away from the light) .. 1 (facing straight into it). */
const lightFactor = (deg: number) => Math.cos((deg - LIGHT_DEG) * TO_RAD);

/** Pick a ramp step by how directly a facet (given its outward angle) catches the light. */
function shadeAt(ramp: Ramp, deg: number): string {
  const f = lightFactor(deg);
  if (f > 0.55) return ramp.highlight;
  if (f > 0.15) return ramp.light;
  if (f > -0.25) return ramp.base;
  if (f > -0.65) return ramp.shade;
  return ramp.deep;
}

const R = STONE_UNIT_R;

/**
 * Classic round brilliant, top-down. Three concentric facet rings around an
 * octagonal table:
 *   - 8 star facets   (table corner → mid-ring apex → next table corner)
 *   - 8 bezel facets  (mid-ring apex → girdle apex → mid-ring apex) — the big
 *     kites that do most of the shading work
 *   - 8 girdle facets (thin slivers closing the gap between bezel kites)
 * All three rings share the same 8-fold symmetry offset by 22.5°, which is
 * what makes the seams line up into the pinwheel/star look of a real brilliant.
 */
export function RoundBrilliant({ type }: StoneArtProps): React.JSX.Element {
  const ramp = STONE[type];

  const RT = R * 0.38; // table radius
  const RC = R * 0.66; // mid-ring (star/bezel seam) radius

  const table = Array.from({ length: 8 }, (_, k) => polar(k * 45, RT));
  const crown = Array.from({ length: 8 }, (_, k) => polar(k * 45 + 22.5, RC));
  const girdle = Array.from({ length: 8 }, (_, k) => polar(k * 45, R));

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
      {/* Base wash — the gem's body colour, lit by the shared radial gradient. */}
      <circle r={R} fill={stoneGradient(type)} stroke={ramp.deep} strokeOpacity={0.35} strokeWidth={1.5} />

      {bezel.map((f, i) => (
        <polygon key={`bz${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.6} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
      ))}
      {notch.map((f, i) => (
        <polygon key={`nt${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.4} stroke={ramp.deep} strokeOpacity={0.2} strokeWidth={0.75} />
      ))}
      {star.map((f, i) => (
        <polygon key={`st${i}`} points={f.d} fill={shadeAt(ramp, f.angle)} fillOpacity={0.55} stroke={ramp.deep} strokeOpacity={0.25} strokeWidth={1} />
      ))}

      {/* Table: the flat top face. */}
      <polygon points={pts(table)} fill={ramp.table} stroke={ramp.deep} strokeOpacity={0.3} strokeWidth={1.25} />
      <polygon
        points={pts([polar(280, RT * 0.85), polar(340, RT * 0.55), polar(20, RT * 0.85)])}
        fill={ramp.highlight}
        fillOpacity={0.4}
      />

      {/* Specular slivers, upper-left, where the light lands. */}
      <g filter="url(#stone-glow)">
        <polygon points={pts([polar(-58, R * 0.98), polar(-58, R * 0.7), polar(-38, R * 0.78), polar(-38, R * 0.99)])} fill={ramp.highlight} fillOpacity={0.85} />
        <polygon points={pts([polar(-18, R * 0.94), polar(-18, R * 0.64), polar(-4, R * 0.72)])} fill={ramp.highlight} fillOpacity={0.6} />
      </g>

      {/* Dark contact facet, lower-right, for weight and contrast. */}
      <polygon points={pts([polar(126, R * 0.5), polar(150, R * 0.98), polar(174, R * 0.52)])} fill={ramp.deep} fillOpacity={0.35} />
    </g>
  );
}
