import type { Metal, Setting } from "@/lib/design";
import { METAL, metalGradient, STONE } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import { RoundBrilliant } from "@/components/stones/RoundBrilliant";
import type * as React from "react";

export type SettingArtProps = { setting: Setting; metal: Metal; stoneRadius: number };

// See components/stones/RoundBrilliant.tsx for the shared angle/shading convention:
// 0deg is straight up, clockwise, and the light sits up-and-left at -45deg.
const TO_RAD = Math.PI / 180;

const polar = (deg: number, r: number): [number, number] => {
  const a = deg * TO_RAD;
  return [Math.sin(a) * r, -Math.cos(a) * r];
};

const pts = (p: Array<[number, number]>) =>
  p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

/** A small round brilliant, dropped in as a diamond accent stone at local (x, y), given radius. */
function AccentDiamond({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(r / STONE_UNIT_R).toFixed(4)})`}>
      <RoundBrilliant type="diamond" />
    </g>
  );
}

const CLAW_ANGLES = [45, 135, 225, 315];
/** The bottom pair reads as nearest the viewer, so their tips draw over the stone. */
const FRONT_CLAW_ANGLES = [135, 225];

/**
 * A prong: widest at the shoulders (right at the girdle, so that width is
 * actually visible rather than hidden under the stone), tapering to a point
 * both outward (the visible tip beyond the girdle) and inward (`innerR` —
 * shallow for the front pair, which overlaps the gem; deep for the back
 * pair, which the stone's own silhouette covers regardless).
 */
function clawPolygon(angle: number, r: number, innerR: number): string {
  const halfW = 9;
  return pts([polar(angle, r * 1.2), polar(angle + halfW, r * 1.02), polar(angle, innerR), polar(angle - halfW, r * 1.02)]);
}

/**
 * The metalwork that holds the centre stone: claws, halo, pavé or bezel.
 * Drawn centred on the origin in the same local units as the stone art, and
 * rendered BEHIND/AROUND it — see components/stones/index.tsx's contract note.
 */
export function SettingArt({ setting, metal, stoneRadius }: SettingArtProps): React.JSX.Element | null {
  const m = METAL[metal];

  switch (setting) {
    case "solitaire": {
      return (
        <g>
          {CLAW_ANGLES.map((a) => (
            <polygon
              key={a}
              points={clawPolygon(a, stoneRadius, stoneRadius * 0.65)}
              fill={metalGradient(metal)}
              stroke={m.deep}
              strokeOpacity={0.45}
              strokeWidth={1.2}
            />
          ))}
          {/* Highlight on the claw catching the light, upper-left. */}
          <polygon points={clawPolygon(315, stoneRadius, stoneRadius * 0.65)} fill={m.highlight} fillOpacity={0.35} />
        </g>
      );
    }

    case "halo": {
      // A real halo hugs the centre stone: many small stones set almost edge to
      // edge, held by bead prongs that sit BETWEEN them. Drawing a metal disc
      // behind each stone instead makes the metal read as the subject and the
      // diamonds as an afterthought, which is not what a halo looks like.
      const count = 16;
      const haloR = stoneRadius * 1.2;
      const stoneR = (Math.PI * haloR) / count * 0.92; // near-touching around the circle
      const diamond = STONE.diamond;
      const step = 360 / count;
      return (
        <g>
          {/* Metal rail the stones are set into, just narrower than they are. */}
          <circle cx={0} cy={0} r={haloR} fill="none" stroke={m.base} strokeWidth={stoneR * 1.7} />
          <circle cx={0} cy={0} r={haloR} fill="none" stroke={m.deep} strokeOpacity={0.35} strokeWidth={stoneR * 1.7} strokeDasharray="1 0" style={{ filter: "none" }} opacity={0.25} />

          {Array.from({ length: count }, (_, i) => {
            const [x, y] = polar(step * i, haloR);
            return <AccentDiamond key={i} x={x} y={y} r={stoneR} />;
          })}

          {/* Bead prongs sit in the gaps between stones, catching the light. */}
          {Array.from({ length: count }, (_, i) => {
            const [x, y] = polar(step * i + step / 2, haloR);
            return (
              <g key={`b${i}`}>
                <circle cx={x} cy={y} r={stoneR * 0.34} fill={metalGradient(metal)} />
                <circle cx={x - stoneR * 0.1} cy={y - stoneR * 0.1} r={stoneR * 0.13} fill={m.highlight} opacity={0.85} />
              </g>
            );
          })}
          <circle cx={0} cy={0} r={haloR - stoneR * 0.85} fill="none" stroke={diamond.deep} strokeOpacity={0.18} strokeWidth={1.2} />
        </g>
      );
    }

    case "pave": {
      // Pavé lives on the BAND's shoulders, not on the stone, so it is drawn by
      // RingCanvas in band space (see PaveShoulders there) rather than here in
      // the stone's local frame — otherwise it stays glued to the gem and slides
      // off the ring the moment the view or the stone position changes.
      return null;
    }

    case "bezel": {
      // A solid disc, not an annulus: this component doesn't know the stone's
      // cut, and a fixed inner hole sized for a circle leaves a gap showing
      // through at every other outline (oval, emerald, princess all reach
      // closer to stoneRadius on their flanks than a circle's hole would
      // assume). Since this renders behind the stone, the stone itself always
      // defines the visible inner edge — the disc only needs to cover it.
      const outerR = stoneRadius * 1.16;
      return (
        <g>
          <circle cx={0} cy={0} r={outerR} fill={metalGradient(metal)} stroke={m.deep} strokeOpacity={0.4} strokeWidth={1} />
          {/* Highlight arc, upper-left, where the rim catches the light. */}
          <path
            d={describeArc(0, 0, stoneRadius * 1.08, -110, -10)}
            fill="none"
            stroke={m.highlight}
            strokeOpacity={0.7}
            strokeWidth={stoneRadius * 0.09}
            strokeLinecap="round"
          />
        </g>
      );
    }

    default:
      return null;
  }
}

/** Claws (or other metalwork) that must visually sit in front of the stone. */
export function SettingClawsFront({ setting, metal, stoneRadius }: SettingArtProps): React.JSX.Element | null {
  if (setting !== "solitaire") return null;
  const m = METAL[metal];
  return (
    <g>
      {FRONT_CLAW_ANGLES.map((a) => (
        <polygon
          key={a}
          points={clawPolygon(a, stoneRadius, stoneRadius * 0.85)}
          fill={metalGradient(metal)}
          stroke={m.deep}
          strokeOpacity={0.5}
          strokeWidth={1.2}
        />
      ))}
    </g>
  );
}

/** Arc path (degrees, 0 = up, clockwise) for a stroked highlight band. */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = polar(startDeg, r);
  const [ex, ey] = polar(endDeg, r);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${(cx + sx).toFixed(2)} ${(cy + sy).toFixed(2)} A ${r} ${r} 0 ${large} 1 ${(cx + ex).toFixed(2)} ${(cy + ey).toFixed(2)}`;
}
