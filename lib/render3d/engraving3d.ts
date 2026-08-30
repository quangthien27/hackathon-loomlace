/**
 * ENGRAVING, CUT INTO METAL.
 *
 * The SVG renderer draws engraving as dark glyphs on a <textPath>. There is no
 * equivalent here: a 3D band is one revolved surface, and text has to become
 * part of that surface rather than a shape drawn over it.
 *
 * So the text is rendered to a canvas and used as a BUMP MAP. That works
 * unusually well on jewellery for a specific reason: the band is metalness 1,
 * i.e. almost a pure mirror, and a mirror shows surface perturbation far more
 * strongly than a diffuse surface does. A groove barely 20 microns deep is
 * clearly legible on real polished gold for the same reason. Nothing is
 * displaced — the silhouette stays perfectly smooth — but the reflection breaks
 * along every letter, which is exactly what engraving looks like.
 *
 * WHERE the text lands comes from the profile's UV ranges, not from a guess:
 * LatheGeometry lays out u as the angle around the ring and v as the position
 * along the cross-section, so the inner wall is a horizontal strip of the
 * canvas whose bounds `bandProfile` reports.
 */

import { CanvasTexture, LinearFilter, RepeatWrapping } from "three";
import type { Engraving } from "../design";
import type { BandProfile } from "./geometry";

const WIDTH = 2048;
const HEIGHT = 512;

/** How much of the circumference the text is allowed to occupy. */
const ARC_FRACTION = 0.42;

/**
 * Text sits at u = 0.5, which is half a turn from the stone.
 *
 * The stone's home direction is +Z and LatheGeometry starts its sweep at +Z, so
 * u = 0 is directly under the stone and u = 0.5 is the bottom of the shank —
 * where an engraving belongs, and where the 'inside' camera is looking.
 */
const INSIDE_U = 0.5;

/**
 * Outside engraving sits on the SIDE of the shank, not its underside.
 *
 * The two placements want different positions because they are read from
 * different directions. Inside text is seen through the bore, so it belongs at
 * the bottom where the far wall faces the camera. Outside text is on the band's
 * outer face — which at the bottom of the ring points down and away from every
 * useful camera — so it goes round to the flank, where the hero view sees it
 * square on.
 */
const OUTSIDE_U = 0.78;

/**
 * BOTH surfaces need the same flip.
 *
 * That is not obvious — the inner wall is traversed backwards across the band
 * AND read from inside the bore, while the outer is neither — but the two
 * reversals cancel, leaving both surfaces wanting the identical mirror. Applying
 * it only to the inside is why outside engraving came out backwards. Settled by
 * looking at it rather than by reasoning about handedness, which is the honest
 * way to do it.
 */
const MIRROR_X = true;
const MIRROR_Y = false;

const FONT_FALLBACK = {
  serif: `Georgia, "Times New Roman", serif`,
  script: `"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive`,
} as const;

/**
 * next/font generates a hashed family name and exposes it on a CSS variable,
 * so the real name has to be read off the document rather than hardcoded.
 */
function fontStack(kind: Engraving["font"]): string {
  if (kind === "script") return FONT_FALLBACK.script;
  const varName = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-serif-display")
    .trim();
  return varName ? `${varName}, ${FONT_FALLBACK.serif}` : FONT_FALLBACK.serif;
}

/** Largest size that fits the text inside both the arc and the band's width. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  maxWidth: number,
  maxHeight: number,
): number {
  let size = Math.min(maxHeight, 160);
  for (let i = 0; i < 12; i++) {
    ctx.font = `${size}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidth) break;
    size *= Math.max(0.55, (maxWidth / w) * 0.98);
  }
  return Math.max(18, size);
}

export type EngravingTexture = {
  texture: CanvasTexture;
  bumpScale: number;
  /** The material's roughness must be raised to this; the map scales it back down. */
  roughness: number;
};

/**
 * Roughness the grooves are pushed to. A graver cuts a matte channel into a
 * polished surface, and that dulling — not the depth — is what actually makes
 * engraving readable on gold. Bump alone is nearly invisible here because the
 * band is a mirror and the reflection simply slides over the perturbation.
 */
const GROOVE_ROUGHNESS = 0.62;

/**
 * Returns null when there is nothing to engrave, so the caller can leave the
 * band's material entirely mapless rather than paying for a blank texture.
 */
export function buildEngravingTexture(
  engraving: Engraving | null,
  profile: BandProfile,
  metalRoughness: number,
  anisotropy: number,
): EngravingTexture | null {
  if (!engraving || !engraving.text.trim()) return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Two maps in one image, because three reads them from different channels:
  // bump from RED (bright = proud, so the flat surface is 255 and glyphs darken
  // into it) and roughness from GREEN (scaled by material.roughness, so the
  // untouched surface has to carry the metal's own polish as a fraction).
  const baseGreen = Math.round((metalRoughness / GROOVE_ROUGHNESS) * 255);
  ctx.fillStyle = `rgb(255, ${baseGreen}, 0)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const inside = engraving.placement === "inside";
  const [v0, v1] = inside ? profile.innerV : profile.outerV;
  const stripTop = v0 * HEIGHT;
  const stripHeight = (v1 - v0) * HEIGHT;

  const family = fontStack(engraving.font);
  const maxWidth = ARC_FRACTION * WIDTH;
  const size = fitFontSize(ctx, engraving.text, family, maxWidth, stripHeight * 0.6);

  ctx.font = `${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Dark red = cut in; full green = matte groove.
  ctx.fillStyle = "rgb(30, 255, 0)";
  ctx.letterSpacing = engraving.font === "script" ? "0px" : `${(size * 0.05).toFixed(1)}px`;
  // A soft edge, so the bump reads as a rounded channel rather than as a step —
  // a hard edge perturbs only a one-pixel outline and looks like a sticker.
  ctx.filter = "blur(2.2px)";

  ctx.save();
  ctx.translate((inside ? INSIDE_U : OUTSIDE_U) * WIDTH, stripTop + stripHeight / 2);
  ctx.scale(MIRROR_X ? -1 : 1, MIRROR_Y ? -1 : 1);
  ctx.fillText(engraving.text, 0, 0);
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  // Deliberately NOT sRGB: this image is height and roughness data, and
  // colour-managing it would apply a gamma curve to both.
  // Seamless around the ring; clamped across the band so the strip cannot bleed
  // onto the surface on the other side of the chamfer.
  texture.wrapS = RepeatWrapping;
  // Textures default to flipY, which would mirror v and land the strip meant
  // for the inner wall on the OUTER surface instead — the profile's UV ranges
  // are in three's own v space, so they must be used unflipped.
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  return { texture, bumpScale: inside ? 2.2 : 1.8, roughness: GROOVE_ROUGHNESS };
}
