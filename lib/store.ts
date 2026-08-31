import { create } from "zustand";
import {
  BAND_MAX_MM,
  BAND_MIN_MM,
  STONE_MAX_MM,
  STONE_MIN_MM,
  clamp,
  initialDesign,
  type Cut,
  type DesignState,
  type Engraving,
  type Setting,
  type Stone,
  type StoneType,
  type View,
} from "./design";
import { applyPreset as applyPresetTo, type PresetName } from "./presets";

/**
 * The single source of truth, deliberately OUTSIDE the React tree.
 *
 * A WebMCP `execute` closure is built once at registration time and called
 * minutes later. If state lived in `useReducer`, `get_design_state` would
 * return whatever the ring looked like when the effect last ran — so the agent
 * would read a pre-drag design and build on geometry that no longer exists.
 * `useDesign.getState()` always reads live truth, which is what lets the human
 * drag a stone mid-conversation and have the agent see it.
 */
type DesignStore = {
  design: DesignState;

  setBand: (patch: Partial<DesignState["band"]>) => void;
  placeStone: (patch: Partial<Stone> & { id?: string }) => Stone;
  removeStone: (id: string) => boolean;
  setSetting: (setting: Setting) => void;
  setEngraving: (engraving: Engraving | null) => void;
  setView: (view: View) => void;
  setSizeUk: (sizeUk: string) => void;
  applyPreset: (name: PresetName) => void;
  /** Wholesale replace — used by persistence restore and by the tween loop. */
  replace: (design: DesignState) => void;
  reset: () => void;
};

let stoneSeq = 1;
const nextStoneId = () => `s${++stoneSeq}`;

/**
 * Pull the counter past every id in a design that arrived from outside — a
 * restored save, or a restored look.
 *
 * Without this, restoring a design containing `s3` into a freshly loaded page
 * leaves the counter at 1, so the next `place_stone` with no id mints `s2`.
 * `placeStone` decides "does this stone exist?" from the id it was PASSED, and
 * it was passed none — so it appends, and now two stones share `s2`. From
 * there, `lerpDesign`'s id-keyed map collapses them into one and
 * `remove_stone("s2")` deletes both. All silent, and all downstream of a
 * counter that forgot what had already been used.
 */
function reconcileStoneSeq(design: DesignState): void {
  for (const stone of design.stones) {
    const suffix = /^s(\d+)$/.exec(stone.id);
    if (suffix) stoneSeq = Math.max(stoneSeq, Number(suffix[1]));
  }
}

export const useDesign = create<DesignStore>((set, get) => ({
  design: initialDesign,

  setBand: (patch) =>
    set((s) => ({
      design: {
        ...s.design,
        band: {
          ...s.design.band,
          ...patch,
          widthMm:
            patch.widthMm === undefined
              ? s.design.band.widthMm
              : clamp(patch.widthMm, BAND_MIN_MM, BAND_MAX_MM),
        },
      },
    })),

  placeStone: (patch) => {
    const stones = get().design.stones;
    const existing = patch.id ? stones.find((s) => s.id === patch.id) : undefined;
    const base: Stone = existing ?? {
      id: patch.id ?? nextStoneId(),
      type: "diamond" as StoneType,
      cut: "round" as Cut,
      sizeMm: 6.5,
      x: 0.5,
      y: 0.5,
    };
    const stone: Stone = {
      ...base,
      ...patch,
      id: base.id,
      sizeMm: clamp(patch.sizeMm ?? base.sizeMm, STONE_MIN_MM, STONE_MAX_MM),
      x: clamp(patch.x ?? base.x, 0, 1),
      y: clamp(patch.y ?? base.y, 0, 1),
    };
    set((s) => ({
      design: {
        ...s.design,
        stones: existing
          ? s.design.stones.map((v) => (v.id === stone.id ? stone : v))
          : [...s.design.stones, stone],
      },
    }));
    return stone;
  },

  removeStone: (id) => {
    const before = get().design.stones.length;
    set((s) => ({
      design: { ...s.design, stones: s.design.stones.filter((v) => v.id !== id) },
    }));
    return get().design.stones.length < before;
  },

  setSetting: (setting) =>
    set((s) => ({ design: { ...s.design, setting, settingChosen: true } })),
  setEngraving: (engraving) => set((s) => ({ design: { ...s.design, engraving } })),
  setView: (view) => set((s) => ({ design: { ...s.design, view } })),
  setSizeUk: (sizeUk) => set((s) => ({ design: { ...s.design, sizeUk } })),
  applyPreset: (name) => set((s) => ({ design: applyPresetTo(s.design, name) })),
  replace: (design) => {
    reconcileStoneSeq(design);
    set({ design });
  },
  reset: () => set({ design: initialDesign }),
}));

/** Read live design state from anywhere — including inside a tool's execute(). */
export const currentDesign = () => useDesign.getState().design;
