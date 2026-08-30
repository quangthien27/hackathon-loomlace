/**
 * The order hand-off URL.
 *
 * Lives here rather than inside the `add_to_cart` tool because the human needs
 * the identical link from a button in the sidebar. Two builders would drift,
 * and the whole claim of this app is that the agent and the human act through
 * one code path — a claim that has to be literally true in the places a
 * shortcut would be easiest.
 */

import { type DesignState } from "./design";
import { estimatePrice, formatGBP } from "./price";

export const DEFAULT_STORE_URL = "/order";

export function orderUrl(design: DesignState, note?: string): string {
  const base = process.env.NEXT_PUBLIC_STORE_URL || DEFAULT_STORE_URL;
  const price = estimatePrice(design);

  const stoneSummary = design.stones.length
    ? design.stones.map((s) => `${s.sizeMm.toFixed(1)}mm ${s.type} ${s.cut}`).join(" + ")
    : "no stones";

  // `design` carries the whole state and is what /order actually parses; the
  // rest are human-readable duplicates so the URL is legible in a chat log.
  const params = new URLSearchParams({
    design: JSON.stringify(design),
    metal: design.band.metal,
    band_mm: design.band.widthMm.toFixed(1),
    setting: design.setting,
    stones: stoneSummary,
    size: design.sizeUk,
    price_gbp: formatGBP(price.totalPence),
  });
  if (note) params.set("note", note.slice(0, 200));

  return `${base}?${params.toString()}`;
}
