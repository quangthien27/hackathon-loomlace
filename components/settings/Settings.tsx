import type { Cut, Metal, Setting } from "@/lib/design";
import { METAL, metalGradient, STONE } from "@/lib/render/materials";
import { STONE_UNIT_R } from "@/lib/render/contract";
import { RoundBrilliant } from "@/components/stones/RoundBrilliant";
import type * as React from "react";

export type SettingArtProps = {
  setting: Setting;
  metal: Metal;
  stoneRadius: number;
  /** The centre stone's cut, so a bezel can follow its actual silhouette. */
  cut: Cut;
};

/**
 * The outline of each cut, at a given radius — mirrors the silhouettes the
 * stone components draw (see components/stones/*). A bezel is a rim that wraps
 * the stone, so a circle around a square princess cut reads as a gem stuck on a
 * coin. This keeps the two in step.
 */
function stoneOutlinePath(cut: Cut, r: number): string {
  const p = (xs: Array<[number, number]>) =>
    "M " + xs.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ") + " Z";

  if (cut === "round" || cut === "oval") {
    const rx = cut === "oval" ? r / 1.4 : r;
    const ry = r;
    return (
      `M 0 ${(-ry).toFixed(2)} ` +
      `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 0 ${ry.toFixed(2)} ` +
      `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 0 ${(-ry).toFixed(2)} Z`
    );
  }

  if (cut === "princess") {
    const h = r * Math.SQRT1_2; // corners sit at 45deg, so the side is r/sqrt(2) from centre
    return p([
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ]);
  }

  // Emerald: a rectangle with cut corners, matching EmeraldCut's proportions.
  const hw = r * 0.62;
  const hh = r * 0.88;
  const c = 0.26 * Math.min(hw, hh);
  return p([
    [-(hw - c), -hh],
    [hw - c, -hh],
    [hw, -(hh - c)],
    [hw, hh - c],
    [hw - c, hh],
    [-(hw - c), hh],
    [-hw, hh - c],
    [-hw, -(hh - c)],
  ]);
}

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

/**
 * The shaft of a prong: a tapered blade running from under the stone out past
 * the girdle, widest where it meets the bead so the claw looks load-bearing.
 */
function clawShaft(angle: number, r: number): string {
  const w = 11;
  return pts([
    polar(angle - w * 0.75, r * 0.72),
    polar(angle + w * 0.75, r * 0.72),
    polar(angle + w, r * 1.16),
    polar(angle - w, r * 1.16),
  ]);
}

/** The bead that folds over the girdle and pins the stone down. */
function clawBead(angle: number, r: number): { cx: number; cy: number; rr: number } {
  const [cx, cy] = polar(angle, r * 1.0);
  return { cx, cy, rr: r * 0.13 };
}

/**
 * The metalwork that holds the centre stone: claws, halo, pavé or bezel.
 * Drawn centred on the origin in the same local units as the stone art, and
 * rendered BEHIND/AROUND it — see components/stones/index.tsx's contract note.
 */
export function SettingArt({ setting, metal, stoneRadius, cut }: SettingArtProps): React.JSX.Element | null {
  const m = METAL[metal];

  switch (setting) {
    case "solitaire": {
      // Prongs read as claws only if they visibly grip: a tapered shaft rising
      // from behind the girdle, then a rounded bead that overlaps ONTO the
      // stone (drawn in front, see SettingClawsFront). A quad that stops at the
      // girdle just looks like four metal tabs stuck to the edge.
      return (
        <g>
          {CLAW_ANGLES.map((a) => (
            <polygon
              key={a}
              points={clawShaft(a, stoneRadius)}
              fill={metalGradient(metal)}
              stroke={m.deep}
              strokeOpacity={0.4}
              strokeWidth={1.2}
            />
          ))}
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
      // A rim that follows the stone's own outline. It renders behind the gem,
      // so the stone defines the inner edge and only the collar shows — which
      // is exactly how a real bezel reads.
      return (
        <g>
          <path
            d={stoneOutlinePath(cut, stoneRadius * 1.18)}
            fill={metalGradient(metal)}
            stroke={m.deep}
            strokeOpacity={0.45}
            strokeWidth={1.2}
          />
          {/* Inner shadow where the collar meets the girdle, for depth. */}
          <path
            d={stoneOutlinePath(cut, stoneRadius * 1.05)}
            fill="none"
            stroke={m.deep}
            strokeOpacity={0.35}
            strokeWidth={stoneRadius * 0.05}
          />
        </g>
      );
    }

    default:
      return null;
  }
}

/** Claws (or other metalwork) that must visually sit in front of the stone. */
/**
 * The half of the setting that must be drawn AFTER the stone: the bead tips
 * folding over the girdle. Without these the stone looks laid on top of the
 * prongs rather than held by them.
 */
export function SettingClawsFront({
  setting,
  metal,
  stoneRadius,
}: SettingArtProps): React.JSX.Element | null {
  if (setting !== "solitaire") return null;
  const m = METAL[metal];

  return (
    <g>
      {CLAW_ANGLES.map((a) => {
        const { cx, cy, rr } = clawBead(a, stoneRadius);
        return (
          <g key={a}>
            <circle cx={cx} cy={cy} r={rr} fill={metalGradient(metal)} stroke={m.deep} strokeOpacity={0.45} strokeWidth={1} />
            {/* Specular dot, up and to the left, matching the canvas light. */}
            <circle cx={cx - rr * 0.32} cy={cy - rr * 0.32} r={rr * 0.34} fill={m.highlight} opacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}
