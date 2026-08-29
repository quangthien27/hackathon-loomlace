/**
 * Style presets — natural language in, geometry out.
 *
 * This is the tool that makes the demo feel like magic: "make it art-deco" is
 * not a lookup, it's a coordinated change across band profile, stone cut,
 * setting and proportion. Each preset is a function of the current design so it
 * PRESERVES the human's choices that aren't part of the style — their metal,
 * their stone type, their engraving — and only restyles what the word means.
 * That is what lets a preset compose with manual edits instead of stamping over
 * them.
 */

import { clamp, type DesignState, type Stone } from "./design";

export type PresetName = "art-deco" | "minimalist" | "vintage";

export const PRESET_NAMES: PresetName[] = ["art-deco", "minimalist", "vintage"];

export const PRESET_BLURB: Record<PresetName, string> = {
  "art-deco":
    "Sharp geometry and symmetry — a knife-edge band, step-cut stone and a tight halo.",
  minimalist:
    "Nothing that isn't load-bearing — a thin flat band, one round stone, bezel-set.",
  vintage:
    "Softer and more ornate — a rounded court band, oval stone and pavé along the shoulders.",
};

const restyleStones = (stones: Stone[], fn: (s: Stone, i: number) => Stone): Stone[] =>
  stones.length ? stones.map(fn) : stones;

export const PRESETS: Record<PresetName, (d: DesignState) => DesignState> = {
  "art-deco": (d) => ({
    ...d,
    band: { ...d.band, profile: "knife-edge", widthMm: clamp(d.band.widthMm * 0.85, 1.6, 2.6) },
    setting: "halo",
    settingChosen: true,
    stones: restyleStones(d.stones, (s, i) =>
      i === 0 ? { ...s, cut: "emerald", x: 0.5, y: 0.5 } : s,
    ),
    engraving: d.engraving ? { ...d.engraving, font: "serif" } : null,
  }),

  minimalist: (d) => ({
    ...d,
    band: { ...d.band, profile: "flat", widthMm: clamp(d.band.widthMm * 0.7, 1.2, 1.8) },
    setting: "bezel",
    settingChosen: true,
    // One stone only — the whole point is subtraction.
    stones: d.stones.slice(0, 1).map((s) => ({
      ...s,
      cut: "round" as const,
      x: 0.5,
      y: 0.5,
      sizeMm: clamp(s.sizeMm * 0.85, 3, 7),
    })),
  }),

  vintage: (d) => ({
    ...d,
    band: { ...d.band, profile: "court", widthMm: clamp(d.band.widthMm * 1.15, 2.0, 3.2) },
    setting: "pave",
    settingChosen: true,
    stones: restyleStones(d.stones, (s, i) =>
      i === 0 ? { ...s, cut: "oval", x: 0.5, y: 0.5 } : s,
    ),
    engraving: d.engraving ? { ...d.engraving, font: "script" } : null,
  }),
};

export function applyPreset(design: DesignState, name: PresetName): DesignState {
  return PRESETS[name](design);
}
