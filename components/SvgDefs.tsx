import { METAL, STONE, SURFACE } from "@/lib/render/materials";
import type { Metal, StoneType } from "@/lib/design";

const METALS = Object.keys(METAL) as Metal[];
const STONES = Object.keys(STONE) as StoneType[];

/**
 * Every gradient and filter on the canvas, generated from the palette tokens so
 * band and stones are lit by the same imaginary light. Rendered once, inside
 * the ring <svg>. Reference by id, e.g. fill="url(#metal-yellow)".
 *
 * The light sits up and to the left, so highlights land at ~35% / 25%.
 */
export function SvgDefs() {
  return (
    <defs>
      {METALS.map((m) => {
        const r = METAL[m];
        return (
          <linearGradient key={m} id={`metal-${m}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={r.highlight} />
            <stop offset="22%" stopColor={r.light} />
            <stop offset="52%" stopColor={r.base} />
            <stop offset="78%" stopColor={r.shade} />
            <stop offset="100%" stopColor={r.deep} />
          </linearGradient>
        );
      })}

      {/* Tighter ramp for the thin inner/outer edges of the band. */}
      {METALS.map((m) => {
        const r = METAL[m];
        return (
          <linearGradient key={m} id={`metal-edge-${m}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={r.shade} />
            <stop offset="45%" stopColor={r.base} />
            <stop offset="100%" stopColor={r.deep} />
          </linearGradient>
        );
      })}

      {STONES.map((t) => {
        const r = STONE[t];
        return (
          <radialGradient key={t} id={`stone-${t}`} cx="0.35" cy="0.25" r="0.85">
            <stop offset="0%" stopColor={r.highlight} />
            <stop offset="30%" stopColor={r.light} />
            <stop offset="62%" stopColor={r.base} />
            <stop offset="88%" stopColor={r.shade} />
            <stop offset="100%" stopColor={r.deep} />
          </radialGradient>
        );
      })}

      {/* Driven by CSS variables so the ring's ground follows the viewer's
          theme. The palette tokens are the fallback if the vars are missing. */}
      <radialGradient id="canvas-bg" cx="0.5" cy="0.38" r="0.75">
        <stop offset="0%" stopColor={`var(--canvas-from, ${SURFACE.canvasFrom})`} />
        <stop offset="100%" stopColor={`var(--canvas-to, ${SURFACE.canvasTo})`} />
      </radialGradient>

      <filter id="soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor={SURFACE.contactShadow} />
      </filter>

      <filter id="stone-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
