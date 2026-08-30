/**
 * The single design artifact. Pure data — no React, no DOM.
 * Both the human UI and the agent tools mutate this same shape.
 */

export type Metal = "yellow" | "white" | "rose" | "platinum";
export type Profile = "flat" | "court" | "knife-edge";
export type StoneType = "diamond" | "sapphire" | "emerald" | "ruby";
export type Cut = "round" | "oval" | "emerald" | "princess";
export type Setting = "solitaire" | "halo" | "pave" | "bezel";
export type View = "top" | "side" | "inside";

export type Stone = {
  id: string;
  type: StoneType;
  cut: Cut;
  sizeMm: number;
  /** normalised 0..1 across the band face */
  x: number;
  y: number;
};

export type Engraving = {
  text: string;
  font: "serif" | "script";
  placement: "inside" | "outside";
};

export type DesignState = {
  band: { widthMm: number; profile: Profile; metal: Metal };
  stones: Stone[];
  setting: Setting;
  /**
   * True once a setting has been deliberately chosen (by the human or by
   * set_setting_style). Gates `add_engraving`: you do not offer to engrave a
   * ring nobody has committed to yet. This is what makes the dynamic
   * registration beat real rather than decorative.
   */
  settingChosen: boolean;
  engraving: Engraving | null;
  view: View;
  sizeUk: string;
};

export const BAND_MIN_MM = 1.2;
export const BAND_MAX_MM = 4.0;
export const STONE_MIN_MM = 1.5;
export const STONE_MAX_MM = 12;

export const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

export const initialDesign: DesignState = {
  band: { widthMm: 2.2, profile: "court", metal: "yellow" },
  stones: [
    { id: "s1", type: "diamond", cut: "round", sizeMm: 6.5, x: 0.5, y: 0.5 },
  ],
  setting: "solitaire",
  settingChosen: false,
  engraving: null,
  view: "top",
  sizeUk: "M",
};

/**
 * The centre stone — the one the setting is built around.
 *
 * Defined in exactly one place because several modules need it and they must
 * agree: the renderer wraps this stone in the halo/bezel/claws, the controls
 * edit it, and the price charges melee against its size. Picking "the largest
 * stone" in one module and "the first" in another silently prices a different
 * ring from the one on screen the moment an accent stone is bigger than the
 * centre.
 *
 * It is the first stone. Adding a stone appends, so the centre is whichever
 * stone the design started from.
 */
export function centreStone(design: DesignState): Stone | undefined {
  return design.stones[0];
}

export function describeBand(b: DesignState["band"]) {
  return `${b.widthMm.toFixed(1)}mm ${b.profile} band in ${b.metal} gold`;
}
