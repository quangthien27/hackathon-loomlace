/**
 * The single design artifact. Pure data — no React, no DOM.
 * Both the human UI and the agent tools mutate this same shape.
 */

export type Metal = "yellow" | "white" | "rose" | "platinum";
export type Profile = "flat" | "court" | "bevel" | "knife-edge";
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

/**
 * The ring on screen before anyone has touched anything.
 *
 * Chosen to photograph well rather than to sit in the middle of every range.
 * 2.5mm has enough face to catch a highlight and to carry an engraving, where
 * 2.2 read as a wire once the band became a real 3D solid; UK I is a common
 * women's size and, now that size drives the geometry, it frames better than
 * the mid-scale M did.
 */
export const initialDesign: DesignState = {
  band: { widthMm: 2.5, profile: "court", metal: "yellow" },
  stones: [
    { id: "s1", type: "diamond", cut: "round", sizeMm: 6.5, x: 0.5, y: 0.5 },
  ],
  setting: "solitaire",
  settingChosen: false,
  engraving: null,
  view: "top",
  sizeUk: "I",
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

/**
 * The plain English for each choice, in the one place everything reads it.
 *
 * Not cosmetic. The band sentence used to append the word "gold" to whatever
 * the metal was, which told an agent that had just switched to platinum that
 * its ring was now "in platinum gold" — a material that does not exist, in the
 * one string `set_band` hands back as proof of what it did. Short labels also
 * have to be short: this is what sits under a 64-pixel thumbnail, so it is
 * deliberately not `METAL[...].label` ("18k yellow gold"), which is the fuller
 * wording the accessible description wants.
 */
export const METAL_WORD: Record<Metal, string> = {
  yellow: "yellow gold",
  white: "white gold",
  rose: "rose gold",
  platinum: "platinum",
};

export const SETTING_WORD: Record<Setting, string> = {
  solitaire: "solitaire",
  halo: "halo",
  pave: "pavé",
  bezel: "bezel",
};

export function describeBand(b: DesignState["band"]) {
  return `${b.widthMm.toFixed(1)}mm ${b.profile} band in ${METAL_WORD[b.metal]}`;
}
