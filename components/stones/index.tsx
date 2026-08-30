import type { Cut, StoneType } from "@/lib/design";
import type * as React from "react";
import { RoundBrilliant } from "./RoundBrilliant";
import { OvalCut } from "./OvalCut";
import { EmeraldCut } from "./EmeraldCut";
import { PrincessCut } from "./PrincessCut";

export type { StoneArtProps } from "./RoundBrilliant";

/**
 * Dispatches to the hand-drawn facet art for a stone's cut. Every cut is
 * drawn centred on the origin, inscribed in a circle of radius
 * STONE_UNIT_R — see lib/render/contract.ts's "STONE ART CONTRACT". The
 * caller (RingCanvas) supplies position, rotation and size via a wrapping
 * transform, so this component never needs to know where the stone sits.
 */
export function StoneArt({ cut, type }: { cut: Cut; type: StoneType }): React.JSX.Element {
  switch (cut) {
    case "oval":
      return <OvalCut type={type} />;
    case "emerald":
      return <EmeraldCut type={type} />;
    case "princess":
      return <PrincessCut type={type} />;
    case "round":
    default:
      return <RoundBrilliant type={type} />;
  }
}
