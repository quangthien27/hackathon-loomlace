import {
  describeBand,
  type Cut,
  type Metal,
  type Profile,
  type Setting,
  type StoneType,
  type View,
} from "./design";
import { estimatePrice, formatGBP } from "./price";
import { PRESET_NAMES, PRESET_BLURB, type PresetName } from "./presets";
import { currentDesign, useDesign } from "./store";

/**
 * Placeholder destination for add_to_cart. TODO: replace with the real
 * RubyJewel custom-order URL before submission — this is a stand-in so the
 * handoff flow is fully wired and demoable ahead of that URL existing.
 */
/**
 * Where a finished design is handed off for checkout.
 *
 * Defaults to Loomlace's own /order page, which is self-contained and always
 * works. Point NEXT_PUBLIC_STORE_URL at a real storefront's custom-order page
 * to hand off there instead — the design travels as query params either way, so
 * no integration work is needed on the receiving end beyond reading them.
 */
const DEFAULT_STORE_URL = "/order";

/**
 * Accepts the common ways a human or agent writes a UK ring size half —
 * "L½", "L 1/2", "L half" — and normalises them to a single letter plus an
 * optional "½". Returns null (rather than throwing) for anything that isn't
 * a single letter A–Z with an optional half, so callers can fall back
 * gracefully instead of crashing on a stray value like "7" or "large".
 */
function normalizeUkSize(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  s = s.replace(/HALF/g, "½").replace(/1\/2/g, "½").replace(/\.5$/, "½");
  const m = /^([A-Z])(½)?$/.exec(s);
  return m ? m[1] + (m[2] ?? "") : null;
}

/**
 * Tool definitions.
 *
 * Every execute() reads the store via getState() rather than a captured
 * closure, and returns the RESULTING state so the agent can chain edits
 * without a get_design_state round-trip on every turn.
 *
 * Return shape is a plain JSON object: OpenAI's WebMCP guide shows execute
 * returning `{ title: document.title }`, not the MCP content-array envelope,
 * and the spec types execute as Promise<any>. Plain objects it is.
 */

const ok = (summary: string) => ({ ok: true, summary, design: currentDesign() });

export const coreTools: ModelContextTool[] = [
  {
    name: "get_design_state",
    description:
      "Read the ring the customer is currently looking at, as JSON. Call this first, and " +
      "again whenever you want to build on an edit the human made by hand — they can drag " +
      "stones and move sliders while you work, so the design changes underneath you.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => ({ design: currentDesign() }),
  },

  {
    name: "set_band",
    description:
      "Change the ring's band. widthMm is the band thickness in millimetres — 1.2 is a " +
      "delicate thread, 2.2 is a classic everyday weight, 4.0 is deliberately chunky. " +
      "profile changes the cross-section silhouette: flat is modern and architectural, " +
      "court is rounded and comfortable, knife-edge is sharp and art-deco. metal changes " +
      "both the colour and the price. Omit any field to leave it as it is.",
    inputSchema: {
      type: "object",
      properties: {
        widthMm: { type: "number", minimum: 1.2, maximum: 4.0 },
        profile: { type: "string", enum: ["flat", "court", "knife-edge"] },
        metal: { type: "string", enum: ["yellow", "white", "rose", "platinum"] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      useDesign.getState().setBand(input as {
        widthMm?: number;
        profile?: Profile;
        metal?: Metal;
      });
      return ok(`Band is now a ${describeBand(currentDesign().band)}.`);
    },
  },

  {
    name: "set_setting_style",
    description:
      "Choose how the stones are held. 'solitaire' is a single raised stone on plain " +
      "claws. 'halo' rings the centre stone with small pavé stones so it reads larger. " +
      "'pave' scatters small stones along the band itself. 'bezel' wraps the stone in a " +
      "continuous metal rim — the most modern and the most protective. Choosing a " +
      "setting commits the design far enough that engraving becomes available.",
    inputSchema: {
      type: "object",
      properties: {
        setting: { type: "string", enum: ["solitaire", "halo", "pave", "bezel"] },
      },
      required: ["setting"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const setting = (input as { setting: Setting }).setting;
      useDesign.getState().setSetting(setting);
      return ok(`Setting is now ${setting}. Engraving is available from here.`);
    },
  },

  {
    name: "set_view",
    description:
      "Rotate the ring on screen. 'top' looks straight down at the stone and setting, " +
      "'side' shows the profile and how high the stone sits, 'inside' shows the inner " +
      "band surface where engraving goes. Cheap to call — use it to show your work.",
    inputSchema: {
      type: "object",
      properties: { view: { type: "string", enum: ["top", "side", "inside"] } },
      required: ["view"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const view = (input as { view: View }).view;
      useDesign.getState().setView(view);
      return ok(`Now showing the ${view} view.`);
    },
  },

  {
    name: "place_stone",
    description:
      "Add a new stone to the ring, or move/restyle one that's already there. Omit id to " +
      "add a new stone — the store generates its id and returns it in the summary, so hold " +
      "onto that id if you plan to touch this stone again later (e.g. add three accent " +
      "stones, then move the second one by passing its id back in). Pass an id that already " +
      "exists to update that stone in place; a made-up id is treated as a fresh stone using " +
      "that id, so when in doubt about whether one exists, call get_design_state first " +
      "rather than guessing. x and y describe where the stone sits on the band's face, both " +
      "normalised 0 to 1. x is the position AROUND the band's circumference: 0.5 is dead " +
      "centre (the front of the finger), lower values move left, higher values move right — " +
      "a three-stone trellis might sit at x = 0.4, 0.5, 0.6. y is the position ACROSS the " +
      "band's width: 0 is the inner edge nearest the finger, 1 is the outer edge, 0.5 is " +
      "centred. A classic solitaire sits at x=0.5, y=0.5. sizeMm is the stone's diameter in " +
      "millimetres, from 1.5 (a pavé speck) to 12 (a bold statement centre stone) — 6.5mm is " +
      "a typical solitaire. type is the gem material (diamond/sapphire/emerald/ruby) and cut " +
      "is its shape (round/oval/emerald/princess) — these are independent, so type=emerald " +
      "with cut=round means a round-cut emerald gemstone, not the rectangular step cut. " +
      "Prefer apply_style_preset when you want to restyle the whole ring at once; use this " +
      "tool for adding or fine-tuning one stone at a time.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["diamond", "sapphire", "emerald", "ruby"] },
        cut: { type: "string", enum: ["round", "oval", "emerald", "princess"] },
        sizeMm: { type: "number", minimum: 1.5, maximum: 12 },
        x: { type: "number", minimum: 0, maximum: 1 },
        y: { type: "number", minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const i = input as {
        id?: string;
        type?: StoneType;
        cut?: Cut;
        sizeMm?: number;
        x?: number;
        y?: number;
      };
      const existed = i.id ? currentDesign().stones.some((s) => s.id === i.id) : false;
      const stone = useDesign.getState().placeStone(i);
      const action = existed ? "Moved/restyled" : "Added";
      return ok(
        `${action} stone ${stone.id}: ${stone.sizeMm.toFixed(1)}mm ${stone.type} ` +
          `(${stone.cut} cut) at x=${stone.x.toFixed(2)}, y=${stone.y.toFixed(2)}.`,
      );
    },
  },

  {
    name: "remove_stone",
    description:
      "Remove a stone from the ring by id. Get the id from get_design_state or from the id " +
      "place_stone returned when you created it. If the id doesn't match any stone currently " +
      "on the ring, nothing is removed and the summary lists every id that DOES exist, so " +
      "you can correct yourself instead of guessing again blindly.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { id } = input as { id: string };
      const removed = useDesign.getState().removeStone(id);
      if (!removed) {
        const ids = currentDesign().stones.map((s) => s.id);
        return ok(
          `No stone with id "${id}" was found — nothing removed. Current stone ids: ` +
            (ids.length ? ids.join(", ") : "(the ring has no stones)") +
            ".",
        );
      }
      return ok(`Removed stone ${id}. ${currentDesign().stones.length} stone(s) remain.`);
    },
  },

  {
    name: "apply_style_preset",
    description:
      "Restyle the whole ring to a named aesthetic in one call — the headline move of this " +
      "app, because it changes several properties in a coordinated way rather than one field " +
      "at a time. 'art-deco': " +
      PRESET_BLURB["art-deco"] +
      " Concretely: band becomes a slim knife-edge profile (about 15% thinner), setting " +
      "becomes a tight halo, and the centre stone is cut as a step-cut emerald square. " +
      "'minimalist': " +
      PRESET_BLURB.minimalist +
      " Concretely: band becomes flat and thin (about 30% thinner, capped at 1.8mm), " +
      "setting becomes bezel, the centre stone shrinks slightly and every other stone is " +
      "removed — the whole point is subtraction. 'vintage': " +
      PRESET_BLURB.vintage +
      " Concretely: band becomes a fuller court profile (about 15% thicker), setting " +
      "becomes pavé along the shoulders, and the centre stone is cut oval. Crucially, a " +
      "preset is a function of the design you already have, not a reset to defaults: it only " +
      "touches the properties that define its look (band profile/width, setting, stone cut) " +
      "and leaves everything else exactly as the customer chose — the metal, the stone " +
      "material (diamond/sapphire/etc.), and any engraving text all survive untouched. That " +
      "means a preset composes with manual edits in either order: apply rose gold and a " +
      "sapphire first, then art-deco, and you get a rose-gold sapphire art-deco ring, not a " +
      "reset to yellow gold and diamond.",
    inputSchema: {
      type: "object",
      properties: { style: { type: "string", enum: PRESET_NAMES } },
      required: ["style"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { style } = input as { style: PresetName };
      const before = currentDesign();
      useDesign.getState().applyPreset(style);
      const after = currentDesign();
      const bandChange =
        `${before.band.profile} ${before.band.widthMm.toFixed(1)}mm → ` +
        `${after.band.profile} ${after.band.widthMm.toFixed(1)}mm`;
      const settingChange =
        before.setting === after.setting ? after.setting : `${before.setting} → ${after.setting}`;
      const beforeCut = before.stones[0]?.cut;
      const afterCut = after.stones[0]?.cut;
      const stoneChange =
        afterCut && beforeCut !== afterCut
          ? `, centre stone cut ${beforeCut} → ${afterCut}`
          : afterCut
            ? `, centre stone stays ${afterCut} cut`
            : "";
      const countChange =
        after.stones.length !== before.stones.length
          ? ` (stone count ${before.stones.length} → ${after.stones.length})`
          : "";
      return ok(
        `Applied ${style}: band ${bandChange}, setting ${settingChange}${stoneChange}` +
          `${countChange}. Metal (${after.band.metal})${after.stones[0] ? `, stone type (${after.stones[0].type})` : ""}` +
          `, and engraving were left untouched.`,
      );
    },
  },

  {
    name: "estimate_price",
    description:
      "Price the ring exactly as it's currently designed — band metal and width, every " +
      "stone's type/cut/size, and the setting — as a line-itemised GBP estimate. Call this " +
      "before add_to_cart so you can quote the customer a real number, and call it again " +
      "after any edit that could change cost (metal, stone count, stone size, setting) " +
      "since price is a live function of the whole design, not a cached value. Returns the " +
      "individual price lines as well as the formatted total, so you can explain the price " +
      "line by line rather than quoting a bare figure. Read-only — never changes the ring.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const design = currentDesign();
      const estimate = estimatePrice(design);
      return {
        ok: true,
        summary: estimate.summary,
        total: formatGBP(estimate.totalPence),
        currency: estimate.currency,
        lines: estimate.lines,
        design,
      };
    },
  },

  {
    name: "add_to_cart",
    description:
      "Hand the finished design off to the jeweller's order system for checkout, opening the " +
      "order page in a new browser tab. This is the one consequential tool in this set — call " +
      "estimate_price first so you can tell the customer what they're about to order, and " +
      "only call this once they've confirmed they're happy with the design. Encodes the full " +
      "design as JSON plus human-readable fields (metal, band width, setting, a plain-text " +
      "stone summary, ring size, and the GBP price) so the landing page is useful even before " +
      "it parses the JSON. The browser may show its own confirmation prompt before opening " +
      "the tab — that's expected for an action this consequential. If the browser blocks the " +
      "popup, this tool does NOT fail silently: it returns ok:false with the destination URL " +
      "so you can relay it to the human to open themselves. Optional note (max 200 " +
      "characters) passes a short message to the jeweller, e.g. 'needed by Friday'.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string", maxLength: 200 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const i = (input ?? {}) as { note?: string };
      const design = currentDesign();
      const price = estimatePrice(design);
      const stoneSummary = design.stones.length
        ? design.stones.map((s) => `${s.sizeMm.toFixed(1)}mm ${s.type} ${s.cut}`).join(" + ")
        : "no stones";
      const base =
        (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_STORE_URL) ||
        DEFAULT_STORE_URL;
      const params = new URLSearchParams({
        design: JSON.stringify(design),
        metal: design.band.metal,
        band_mm: design.band.widthMm.toFixed(1),
        setting: design.setting,
        stones: stoneSummary,
        size: design.sizeUk,
        price_gbp: formatGBP(price.totalPence),
      });
      if (i.note) params.set("note", i.note.slice(0, 200));
      const url = `${base}?${params.toString()}`;

      if (typeof window === "undefined") {
        return { ok: false, summary: "No browser window available to open the store in.", url, design };
      }
      const popup = window.open(url, "_blank", "noopener");
      if (!popup) {
        return {
          ok: false,
          summary:
            "The order page was blocked by the browser's popup blocker. Relay this URL to " +
            `the customer so they can open it themselves: ${url}`,
          url,
          design,
        };
      }
      return {
        ok: true,
        summary: `Opened the order page for a ${design.band.metal} ${design.setting} ring in a new tab.`,
        url,
        design,
      };
    },
  },

  {
    name: "set_size",
    description:
      "Set the customer's UK ring size. Accepts a single letter A–Z, optionally with a " +
      "half — 'M', 'L½', 'L 1/2', and 'L half' all normalise to the same size. UK sizing for " +
      "adult fingers realistically runs about D to Z, but the full letter range is accepted " +
      "since a child's or a novelty size is still a valid design choice. If the input can't " +
      "be parsed as a UK size at all (e.g. a US/EU number, or free text), the current size " +
      "is left unchanged and the summary explains the expected format instead of crashing.",
    inputSchema: {
      type: "object",
      properties: { sizeUk: { type: "string" } },
      required: ["sizeUk"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const raw = String((input as { sizeUk: unknown }).sizeUk ?? "");
      const normalized = normalizeUkSize(raw);
      if (!normalized) {
        return ok(
          `Couldn't parse "${raw}" as a UK ring size — size stays ${currentDesign().sizeUk}. ` +
            'Use a single letter A–Z, optionally with a half, e.g. "M" or "L½" or "N 1/2".',
        );
      }
      useDesign.getState().setSizeUk(normalized);
      return ok(`Ring size set to ${normalized}.`);
    },
  },
];

/**
 * Registered only once a setting has been chosen — you cannot engrave a ring
 * that has no inside surface yet. This is the dynamic-registration beat.
 */
export const engravingTool: ModelContextTool = {
  name: "add_engraving",
  description:
    "Engrave text on the band. Keep it short — roughly 30 characters fits comfortably " +
    "inside a 2mm band. placement 'inside' is the private, traditional choice; " +
    "'outside' is visible and reads as a design element.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", maxLength: 40 },
      font: { type: "string", enum: ["serif", "script"] },
      placement: { type: "string", enum: ["inside", "outside"] },
    },
    required: ["text"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const i = input as { text: string; font?: "serif" | "script"; placement?: "inside" | "outside" };
    useDesign.getState().setEngraving({
      text: i.text.slice(0, 40),
      font: i.font ?? "serif",
      placement: i.placement ?? "inside",
    });
    useDesign.getState().setView(i.placement === "outside" ? "side" : "inside");
    return ok(`Engraved "${i.text}" on the ${i.placement ?? "inside"} of the band.`);
  },
};
