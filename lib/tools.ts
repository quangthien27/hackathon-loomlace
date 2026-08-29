import { describeBand, type Metal, type Profile, type Setting, type View } from "./design";
import { currentDesign, useDesign } from "./store";

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
