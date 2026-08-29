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
  reset: () => void;
};

let stoneSeq = 1;
const nextStoneId = () => `s${++stoneSeq}`;

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
  reset: () => set({ design: initialDesign }),
}));

/** Read live design state from anywhere — including inside a tool's execute(). */
export const currentDesign = () => useDesign.getState().design;
