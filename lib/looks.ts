/**
 * Saved looks — the design's undo, in the only form that suits a parametric
 * object with no linear edit history.
 *
 * A ring here is not a document you type into, so a stack of undo steps would
 * be the wrong shape: the human drags a stone while the agent restyles the
 * band, and "one step back" from that is meaningless. What you actually want,
 * while trying variations, is to be able to keep the good one and come back to
 * it. So a look is a whole design, frozen, with a photograph of the ring as it
 * looked at the moment it was frozen.
 *
 * THE THUMBNAIL NEVER REACHES THE MODEL. It exists for the human strip on the
 * canvas. Every tool result projects a look field by field precisely so a
 * thirty-kilobyte base64 JPEG can never be spread into the agent's context,
 * where it would be unreadable to it and expensive for everyone.
 */

import { create } from "zustand";
import { DURATION_MS } from "./animate";
import { captureStudioShot } from "./capture";
import { centreStone, METAL_WORD, SETTING_WORD, type DesignState } from "./design";
import { useDesign } from "./store";

export type Look = {
  /**
   * The public handle, and the reason it is not an array index.
   *
   * The agent says "restore look 3" a few turns after saving it, by which time
   * eviction may have shifted every position. A never-reused counter means the
   * number it was told is the number that still works; eviction leaves gaps,
   * and `list_looks` reports whatever numbers are actually live.
   */
  n: number;
  label: string;
  design: DesignState;
  /** JPEG data URL, or null when there was no 3D studio to photograph. */
  thumb: string | null;
  at: number;
};

/**
 * Six is what fits down the side of the studio without becoming a filmstrip
 * you have to scroll. Saving a seventh drops the oldest rather than refusing —
 * being told "you have too many looks" mid-flow is worse than losing the one
 * you stopped caring about five variations ago.
 */
export const MAX_LOOKS = 6;

/** Wide enough to read the setting at a glance, small enough to store six. */
const THUMB_PX = 320;

/**
 * How long to wait before photographing.
 *
 * `useEasedDesign` deliberately keeps the canvas a tween behind the store, so a
 * look saved immediately after `apply_style_preset` would pair the final design
 * JSON with a photograph of the ring halfway through the morph. The thumbnail
 * and the data it restores have to agree — that agreement is the entire feature
 * — so the capture waits the tween out, plus a frame or two of slack.
 *
 * Derived from the tween rather than written as a number, because a comment
 * saying "keep this above 420" is not a constraint, and the failure when it
 * drifts is silent: nothing errors, the thumbnails are just subtly wrong.
 */
const SETTLE_MS = DURATION_MS + 60;

/**
 * A name short enough to sit under a thumbnail: the two or three things that
 * actually tell one variation from another at a glance. Not `describeDesign` —
 * that is a full sentence for a screen reader, and reads as a paragraph in a
 * 64-pixel tile.
 */
export function autoLabel(design: DesignState): string {
  const centre = centreStone(design);
  const parts = [METAL_WORD[design.band.metal]];
  if (centre) parts.push(`${centre.cut} ${centre.type}`);
  parts.push(SETTING_WORD[design.setting]);
  return parts.join(", ");
}

type LooksStore = {
  looks: Look[];
  /**
   * True across a save's settle wait. In the store rather than in a component,
   * because there are three ways to start a save — the canvas strip, the
   * sidebar panel, and the agent's `save_look` — and they are all live at once.
   * A flag owned by one button cannot disable the other two.
   */
  saving: boolean;
  /** Wholesale replace — used by the persistence restore. */
  replaceAll: (looks: Look[]) => void;
  remove: (n: number) => boolean;
};

let lookSeq = 0;

export const useLooks = create<LooksStore>((set, get) => ({
  looks: [],
  saving: false,
  replaceAll: (looks) => {
    // The counter has to clear every restored look or the next save would mint
    // a number that is already taken, and "look 3" would suddenly be ambiguous.
    lookSeq = looks.reduce((max, l) => Math.max(max, l.n), lookSeq);
    set({ looks });
  },
  remove: (n) => {
    const before = get().looks.length;
    set((s) => ({ looks: s.looks.filter((l) => l.n !== n) }));
    return get().looks.length < before;
  },
}));

export const currentLooks = (): Look[] => useLooks.getState().looks;

export const findLook = (n: number): Look | undefined =>
  currentLooks().find((l) => l.n === n);

/**
 * The save currently waiting out the tween, if any.
 *
 * A second save started inside that window JOINS this one rather than starting
 * its own. It has to: nothing about the ring has changed in half a second, so
 * the two would be the same photograph of the same design, taking two of the
 * six slots and putting two identical rows in front of an agent whose whole job
 * here is telling variations apart. Coalescing is not just a debounce — with
 * three ways to start a save (canvas strip, sidebar panel, `save_look`) all
 * live at once, a human clicking while the agent saves is ordinary, not an
 * error, and it should quietly produce one look.
 *
 * A joining call's `label` is dropped, since the look it joins already has one.
 */
let inFlight: Promise<Look> | null = null;

/**
 * Freeze the design on screen as a look.
 *
 * Deliberately the single path for both buttons and `save_look`: the settle
 * delay, the labelling, the eviction and the coalescing above are all part of
 * what a look IS, and a second call site that skipped any of them would produce
 * looks that behave differently depending on who saved them.
 */
export function saveLook(label?: string): Promise<Look> {
  if (inFlight) return inFlight;

  useLooks.setState({ saving: true });
  inFlight = (async () => {
    try {
      const design = useDesign.getState().design;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

      const look: Look = {
        n: ++lookSeq,
        label: (label?.trim() || autoLabel(design)).slice(0, 60),
        // Re-read rather than reuse `design`: the human may have moved a stone
        // during the settle wait, and the photograph about to be taken is of
        // THAT ring. Storing the earlier JSON would restore something the
        // picture never showed.
        design: useDesign.getState().design,
        thumb: captureStudioShot({ maxPx: THUMB_PX, quality: 0.72 }),
        at: Date.now(),
      };

      useLooks.setState((s) => ({ looks: [...s.looks, look].slice(-MAX_LOOKS) }));
      return look;
    } finally {
      inFlight = null;
      useLooks.setState({ saving: false });
    }
  })();

  return inFlight;
}

/**
 * Put a saved look back on the screen. Returns false if the number is gone —
 * callers report the live numbers rather than guessing again.
 */
export function restoreLook(n: number): Look | null {
  const look = findLook(n);
  if (!look) return null;
  // Through the store's own replace(), so the tween, the autosave and the
  // stone-id reconciliation all happen exactly as they do for any other edit.
  useDesign.getState().replace(look.design);
  return look;
}
