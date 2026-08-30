/**
 * PBR parameters, the 3D counterpart to lib/render/materials.ts.
 *
 * The SVG palette is a hand-shaded RAMP — five tones per material, because a 2D
 * renderer has to fake the lighting. Here the lighting is real, so what a
 * material needs instead is its physical description: albedo and roughness for
 * metal, refractive index and absorption for a gem. The two files describe the
 * same materials in the two different vocabularies; neither derives from the
 * other, which is a real (small) duplication a 3D move would have to own.
 */

import type { Metal, StoneType } from "../design";

export type MetalPbr = { color: string; roughness: number };

export const METAL_PBR: Record<Metal, MetalPbr> = {
  // Albedo values for polished metal, not the SVG's mid-tone: PBR darkens with
  // roughness, so a metal's base colour has to start brighter than it renders.
  yellow: { color: "#F2C14E", roughness: 0.15 },
  white: { color: "#E4E8EE", roughness: 0.12 },
  rose: { color: "#EDA98A", roughness: 0.16 },
  platinum: { color: "#D8DCE2", roughness: 0.21 },
};

export type GemPbr = {
  /** Refractive index. Diamond 2.42 is what gives it its glassy depth. */
  ior: number;
  /**
   * Chromatic dispersion — how far the ior splits across the spectrum. This is
   * the parameter responsible for "fire", the flecks of spectral colour, and it
   * is the single thing most responsible for a stone reading as a diamond
   * rather than as glass. Only available on MeshPhysicalMaterial since r167.
   */
  dispersion: number;
  /**
   * Body colour is applied as ABSORPTION, not as a base colour: light is tinted
   * by the distance it travels through the stone. Setting `color` on a
   * transmissive material instead just dims it, which is how you get a sapphire
   * that looks like navy plastic.
   */
  attenuationColor: string;
  /** In millimetres — the distance over which the colour reaches full saturation. */
  attenuationDistance: number;
  roughness: number;
};

export const GEM_PBR: Record<StoneType, GemPbr> = {
  diamond: { ior: 2.42, dispersion: 2.6, attenuationColor: "#ffffff", attenuationDistance: 60, roughness: 0.005 },
  sapphire: { ior: 1.77, dispersion: 1.0, attenuationColor: "#1E52AE", attenuationDistance: 1.7, roughness: 0.01 },
  emerald: { ior: 1.58, dispersion: 0.8, attenuationColor: "#1B8F63", attenuationDistance: 2.0, roughness: 0.015 },
  ruby: { ior: 1.77, dispersion: 1.0, attenuationColor: "#B22745", attenuationDistance: 1.5, roughness: 0.01 },
};

/**
 * Melee — halo and pave stones — deliberately do NOT get transmission.
 *
 * Two reasons, and they point the same way. Nobody can resolve refraction in a
 * 1.5mm stone, so it buys no realism; and transmission costs a scene re-render
 * per material, so sixteen halo stones plus six pave is where the frame budget
 * dies. A hard, flat-shaded, near-mirror surface reads as small-diamond
 * sparkle more convincingly AND costs almost nothing.
 */
/**
 * SPECULAR MODE. The other way to render a gem, and the one worth arguing over.
 *
 * Instead of refracting, the stone is treated as an opaque dielectric mirror:
 * a dark body with a near-perfect polish, so each of its 57 flat facets returns
 * a different part of the environment. Against the scattered sparkle sources in
 * studio.ts that produces discrete white flashes on a dark ground — which is
 * what a photographed diamond actually looks like.
 *
 * It is physically a lie: no light passes through the stone at all. But three's
 * transmission cannot bounce light around inside a gem, so the "correct" route
 * renders a smoky lens, and this wrong one renders something the eye accepts.
 * Keeping both is the point — the choice is aesthetic, not technical.
 */
export const GEM_SPECULAR: Record<StoneType, { color: string; env: number }> = {
  diamond: { color: "#191b1f", env: 4.6 },
  sapphire: { color: "#0a1f47", env: 4.0 },
  emerald: { color: "#062b20", env: 4.0 },
  ruby: { color: "#310a17", env: 4.0 },
};

/**
 * The colour of the fake internal-reflection core (see Gem in Ring3D).
 *
 * Near-black on purpose. A diamond's pavilion is not white — it is dark, with
 * bright discrete flashes where facets happen to catch a light source. A pale
 * core produces the milky quartz look; a dark, mirror-smooth one shows only the
 * speculars, which is what the eye reads as brilliance.
 */
export const GEM_CORE: Record<StoneType, string> = {
  diamond: "#20242c",
  sapphire: "#0d2450",
  emerald: "#0b3327",
  ruby: "#3a0f1d",
};

export const MELEE_PBR = {
  color: "#F4F8FF",
  roughness: 0.03,
  metalness: 0,
  ior: 2.4,
  envMapIntensity: 4.2,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
} as const;
