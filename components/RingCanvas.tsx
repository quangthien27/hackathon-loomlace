"use client";

import { useCallback, useRef, useState } from "react";
import { clamp, type DesignState, type Stone } from "@/lib/design";
import { bandLayers, bandOutlinePath } from "@/lib/render/band";
import {
  VIEW_BOX,
  pointToStoneXY,
  stoneTransform,
  stoneTransformAttr,
  STONE_UNIT_R,
} from "@/lib/render/contract";
import { engravingRender } from "@/lib/render/engraving";
import { METAL } from "@/lib/render/materials";
import { SettingArt, SettingClawsFront } from "@/components/settings/Settings";
import { StoneArt } from "@/components/stones";
import { RoundBrilliant } from "@/components/stones/RoundBrilliant";
import { SvgDefs } from "@/components/SvgDefs";

type Props = {
  /** The eased design — what gets drawn. */
  design: DesignState;
  /** Called as the human drags a stone. Writes straight through to the store. */
  onMoveStone: (id: string, x: number, y: number) => void;
};

/**
 * The shared surface. Both the human and the agent are looking at this, and
 * both edit it through the same store — the only difference is that a drag
 * updates continuously and an agent's edit arrives in one step.
 */
export function RingCanvas({ design, onMoveStone }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  /** Client pixels → SVG user units, so drags land where the cursor is at any zoom. */
  const toUserSpace = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  const handleMove = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const p = toUserSpace(clientX, clientY);
      if (!p) return;
      const { x, y } = pointToStoneXY(design, p.x, p.y, design.view);
      onMoveStone(id, x, y);
    },
    [design, onMoveStone, toUserSpace],
  );

  const engraving = engravingRender(design, design.view);
  const layers = bandLayers(design, design.view);
  const centre = design.stones[0];
  const isInside = design.view === "inside";

  return (
    <svg
      ref={svgRef}
      viewBox={VIEW_BOX}
      className="h-full w-full touch-none select-none"
      role="img"
      aria-label={describeForScreenReader(design)}
    >
      <SvgDefs />
      <rect x="0" y="0" width="1000" height="1000" fill="url(#canvas-bg)" />

      {/* Contact shadow, so the ring sits on the surface rather than floating. */}
      <path d={bandOutlinePath(design, design.view)} fill="#000" opacity={0.001} filter="url(#soft-shadow)" />

      <g>
        {layers.map((l, i) => (
          <path key={i} d={l.d} fill={l.fill} opacity={l.opacity} fillRule="evenodd" />
        ))}
      </g>

      {engraving && (
        <g>
          {engraving.pathD && <path id={engraving.pathId} d={engraving.pathD} fill="none" />}
          <text
            fontFamily={engraving.fontFamily}
            fontSize={engraving.fontSize}
            letterSpacing={engraving.letterSpacing}
            fill={engraving.fill}
            x={engraving.x}
            y={engraving.y}
            textAnchor="middle"
          >
            {engraving.pathD ? (
              <textPath href={`#${engraving.pathId}`} startOffset="50%">
                {engraving.text}
              </textPath>
            ) : (
              engraving.text
            )}
          </text>
        </g>
      )}

      {/* The 'inside' view looks at the inner surface of the band. Stones are set
          on the OUTSIDE, so none of them are visible from here — and drawing them
          anyway would bury the engraving, which is the entire point of this view. */}
      {!isInside && centre && design.setting === "pave" && (
        <PaveShoulders design={design} centre={centre} />
      )}

      {!isInside && design.stones.map((stone) => {
        const t = stoneTransform(design, stone, design.view);
        const isCentre = centre?.id === stone.id;
        return (
          <g
            key={stone.id}
            transform={stoneTransformAttr(t)}
            className="cursor-grab active:cursor-grabbing"
            style={{ cursor: dragging === stone.id ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(stone.id);
            }}
            onPointerMove={(e) => {
              if (dragging === stone.id) handleMove(stone.id, e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDragging(null);
            }}
          >
            {isCentre && (
              <SettingArt
                setting={design.setting}
                metal={design.band.metal}
                stoneRadius={STONE_UNIT_R}
                cut={stone.cut}
              />
            )}
            <StoneArt cut={stone.cut} type={stone.type} />
            {isCentre && (
              <SettingClawsFront
                setting={design.setting}
                metal={design.band.metal}
                stoneRadius={STONE_UNIT_R}
                cut={stone.cut}
              />
            )}
            {/* Generous invisible grab target — the facet art has thin edges. */}
            <circle r={STONE_UNIT_R * 1.15} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Pavé along the band's shoulders. Drawn in BAND space, using the same
 * stoneTransform() every real stone uses, so it follows the band's curve and
 * survives a change of view — which is exactly what it would not do if it were
 * drawn inside the centre stone's transform group.
 */
function PaveShoulders({ design, centre }: { design: DesignState; centre: Stone }) {
  const sizeMm = Math.max(1.3, centre.sizeMm * 0.23);
  const offsets = [-3, -2, -1, 1, 2, 3];

  return (
    <g>
      {offsets.map((k) => {
        const accent: Stone = {
          id: `pave-${k}`,
          type: "diamond",
          cut: "round",
          sizeMm,
          x: clamp(centre.x + k * 0.088, 0, 1),
          y: centre.y,
        };
        const t = stoneTransform(design, accent, design.view);
        return (
          <g key={k} transform={stoneTransformAttr(t)} opacity={0.97}>
            {/* A shallow recess so each stone reads as set INTO the metal. */}
            <circle r={STONE_UNIT_R * 1.16} fill={METAL[design.band.metal].deep} opacity={0.45} />
            <RoundBrilliant type="diamond" />
            {[45, 135, 225, 315].map((a) => {
              const rad = (a * Math.PI) / 180;
              return (
                <circle
                  key={a}
                  cx={Math.sin(rad) * STONE_UNIT_R * 1.1}
                  cy={-Math.cos(rad) * STONE_UNIT_R * 1.1}
                  r={STONE_UNIT_R * 0.28}
                  fill={a === 315 ? METAL[design.band.metal].highlight : METAL[design.band.metal].base}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function describeForScreenReader(d: DesignState): string {
  const stones = d.stones
    .map((s: Stone) => `${s.sizeMm}mm ${s.cut} cut ${s.type}`)
    .join(", ");
  return `A ${d.band.widthMm}mm ${d.band.profile} ${METAL[d.band.metal].label} ring, ${d.setting} setting${
    stones ? `, set with ${stones}` : ""
  }${d.engraving ? `, engraved "${d.engraving.text}"` : ""}. Viewed from the ${d.view}.`;
}
