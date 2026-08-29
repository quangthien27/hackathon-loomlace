/**
 * THE PALETTE. One source of truth for every colour on the canvas.
 *
 * Band gradients and stone facet fills MUST come from here, or the ring reads
 * as a collage of separately-drawn parts rather than one object. If you need a
 * colour that isn't here, add it here rather than inlining a hex value.
 *
 * Pure data. No React. Gradient *elements* are rendered by components/SvgDefs.tsx,
 * which reads these tokens — reference them by their gradient id, e.g.
 * `fill="url(#metal-yellow)"`.
 */

import type { Metal, StoneType } from "../design";

export type Ramp = {
  /** Specular highlight — the brightest point. */
  highlight: string;
  light: string;
  base: string;
  shade: string;
  /** Deepest occlusion, used for inner edges and contact shadows. */
  deep: string;
};

export const METAL: Record<Metal, Ramp & { label: string }> = {
  yellow: {
    label: "yellow gold",
    highlight: "#FFF6D6",
    light: "#F6D882",
    base: "#DDAE44",
    shade: "#A87A21",
    deep: "#6B4A10",
  },
  white: {
    label: "white gold",
    highlight: "#FFFFFF",
    light: "#EDEFF3",
    base: "#CBD1DA",
    shade: "#959CA7",
    deep: "#5A616B",
  },
  rose: {
    label: "rose gold",
    highlight: "#FFEBE0",
    light: "#F2C3AC",
    base: "#D9977B",
    shade: "#A8604A",
    deep: "#6B3728",
  },
  platinum: {
    label: "platinum",
    highlight: "#FDFDFE",
    light: "#E4E7EB",
    base: "#BFC5CD",
    shade: "#8B929C",
    deep: "#4E545D",
  },
};

export const STONE: Record<StoneType, Ramp & { label: string; table: string }> = {
  diamond: {
    label: "diamond",
    highlight: "#FFFFFF",
    light: "#F2F7FC",
    base: "#DCE7F2",
    shade: "#A8BDD2",
    deep: "#6E88A3",
    table: "#EDF4FB",
  },
  sapphire: {
    label: "sapphire",
    highlight: "#BFDCFF",
    light: "#5E9BE0",
    base: "#2E63B5",
    shade: "#193F7D",
    deep: "#0C2049",
    table: "#3E79C9",
  },
  emerald: {
    label: "emerald",
    highlight: "#B6F0D6",
    light: "#5FC79B",
    base: "#2E8F6B",
    shade: "#175C45",
    deep: "#093126",
    table: "#3AA37B",
  },
  ruby: {
    label: "ruby",
    highlight: "#FFC2CE",
    light: "#E4657F",
    base: "#B92F4C",
    shade: "#7C1730",
    deep: "#450A19",
    table: "#CB3F5B",
  },
};

/** Gradient ids rendered by components/SvgDefs.tsx. */
export const metalGradient = (m: Metal) => `url(#metal-${m})`;
export const metalGradientEdge = (m: Metal) => `url(#metal-edge-${m})`;
export const stoneGradient = (t: StoneType) => `url(#stone-${t})`;

/** Page chrome. Deliberately warm and low-contrast so the metal reads as metal. */
export const SURFACE = {
  canvasFrom: "#F7F4EF",
  canvasTo: "#E9E4DA",
  canvasFromDark: "#1A1917",
  canvasToDark: "#0E0D0C",
  contactShadow: "rgba(60, 44, 24, 0.28)",
} as const;
