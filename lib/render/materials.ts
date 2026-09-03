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
    label: "18k yellow gold",
    highlight: "#FBF0D2",
    light: "#EBD494",
    base: "#D2AC63",
    shade: "#9C7C3C",
    deep: "#5F4A21",
  },
  white: {
    label: "18k white gold",
    highlight: "#FDFDFE",
    light: "#E9EBEF",
    base: "#C9CDD4",
    shade: "#93989F",
    deep: "#585C63",
  },
  rose: {
    label: "18k rose gold",
    highlight: "#FBE7DC",
    light: "#EBC2AE",
    base: "#D19C83",
    shade: "#A06E58",
    deep: "#63412F",
  },
  platinum: {
    label: "platinum",
    highlight: "#F8F9FA",
    light: "#DFE1E4",
    base: "#BABCC0",
    shade: "#878A8F",
    deep: "#4C4F54",
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
    highlight: "#A9CBF2",
    light: "#5286C4",
    base: "#28538F",
    shade: "#173563",
    deep: "#0B1B38",
    table: "#38669F",
  },
  emerald: {
    label: "emerald",
    highlight: "#A8DEC3",
    light: "#54A883",
    base: "#26765A",
    shade: "#154C3A",
    deep: "#08281F",
    table: "#308567",
  },
  ruby: {
    label: "ruby",
    highlight: "#F0B3C0",
    light: "#C55C74",
    base: "#9C2C46",
    shade: "#68162C",
    deep: "#3A0916",
    table: "#AC3B56",
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

/**
 * SWATCH-ONLY stone colours, for the picker in the sidebar. NOT the canvas.
 *
 * The ramps above are lit: `highlight` is a specular point and `deep` is an
 * occlusion, which is right for shading facets and wrong for a flat tile. Built
 * from them, a swatch got a bright blob at one third across and a muddy edge —
 * the two things that read as cartoon rather than as a jewel.
 *
 * These are chosen as pigments instead: saturated through the middle, dark
 * rather than grey at the bottom, and on the same 150deg sweep as the metal
 * tiles so the two grids look like one control.
 */
export const STONE_SWATCH: Record<StoneType, string> = {
  diamond: "linear-gradient(150deg, #FFFFFF 0%, #EAF2FA 26%, #C6D6E8 58%, #93A9C0 100%)",
  sapphire: "linear-gradient(150deg, #8FC0FF 0%, #3D7BE0 26%, #1B44A8 58%, #0C1E52 100%)",
  emerald: "linear-gradient(150deg, #8FEFC4 0%, #2FBE8B 26%, #0F8560 58%, #063A2C 100%)",
  ruby: "linear-gradient(150deg, #FFB3C4 0%, #E85177 26%, #B01340 58%, #4E0819 100%)",
};
