/**
 * A deterministic, auditable price estimate.
 *
 * This is not decoration — a WebMCP tool hands this straight back to an agent,
 * which relays it to a human as if it meant something. Every rate below is a
 * named, commented constant so the formula can be read and defended line by
 * line. All money math happens in integer pence to avoid float drift; only
 * `formatGBP` ever produces a display string.
 */

import { centreStone } from "./design";
import type { Cut, DesignState, Metal, Setting, Stone, StoneType } from "./design";

export type PriceLine = { label: string; detail: string; pence: number };
export type PriceEstimate = {
  currency: "GBP";
  totalPence: number;
  lines: PriceLine[];
  /** One-sentence plain-English summary for the agent to relay. */
  summary: string;
};

// ---------------------------------------------------------------------------
// Metal
// ---------------------------------------------------------------------------

/** Inner radius of the band in mm — a UK size M finger, matching the renderer. */
export const BAND_INNER_RADIUS_MM = 8.75;

/**
 * Radial thickness of the band cross-section (mm), by profile. Court domes
 * outward and so carries the most metal; knife-edge tapers to a ridge and
 * carries the least; flat sits in between.
 */
export const PROFILE_DEPTH_MM: Record<DesignState["band"]["profile"], number> = {
  bevel: 1.14,
  "knife-edge": 1.1,
  flat: 1.4,
  court: 1.8,
};

/** Density in grams per mm³ (converted from g/cm³ ÷ 1000). */
export const METAL_DENSITY_G_PER_MM3: Record<Metal, number> = {
  yellow: 0.0155, // 18k yellow gold, ~15.5 g/cm³
  rose: 0.0154, // 18k rose gold, slightly less gold content by alloy
  white: 0.0158, // 18k white gold, denser alloy + rhodium plating
  platinum: 0.0214, // 950 platinum, ~21.4 g/cm³ — much denser than gold
};

/** Price per gram, in pence. Platinum is the clear outlier; the golds cluster. */
export const METAL_RATE_PENCE_PER_GRAM: Record<Metal, number> = {
  yellow: 4500, // £45/g
  rose: 4400, // £44/g
  white: 4700, // £47/g — extra alloying + rhodium plating labour
  platinum: 7000, // £70/g — rarer metal, higher spot + harder to work
};

/**
 * Approximate metal volume as a thin annulus swept around the mean radius of
 * the band: volume = width × depth × circumference-at-mean-radius. This is
 * the same rectangle-cross-section model the renderer uses for the band mesh.
 */
export function bandVolumeMm3(band: DesignState["band"]): number {
  const depth = PROFILE_DEPTH_MM[band.profile];
  const meanRadius = BAND_INNER_RADIUS_MM + depth / 2;
  const circumference = 2 * Math.PI * meanRadius;
  return band.widthMm * depth * circumference;
}

function priceMetal(band: DesignState["band"]): PriceLine {
  const volumeMm3 = bandVolumeMm3(band);
  const grams = volumeMm3 * METAL_DENSITY_G_PER_MM3[band.metal];
  const pence = Math.round(grams * METAL_RATE_PENCE_PER_GRAM[band.metal]);
  return {
    label: "Metal",
    detail: `${grams.toFixed(2)}g of ${band.metal} gold`.replace(
      "platinum gold",
      "platinum",
    ),
    pence,
  };
}

// ---------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------

/**
 * Rough mm-diameter → carat conversion, calibrated so a 6.5mm round reads as
 * ~1.00ct (a standard jewellery reference point). Cuts other than round trade
 * spread for depth differently, so each gets its own cubic factor. This is a
 * simplification of real proportion tables, not a certified conversion.
 */
export const CARAT_FACTOR: Record<Cut, number> = {
  round: 0.0036,
  oval: 0.0032, // spreads more per carat than round
  emerald: 0.003, // step-cut, spreads the most per carat
  princess: 0.0038, // retains more depth, less spread per carat
};

export function mmToCarat(sizeMm: number, cut: Cut): number {
  return CARAT_FACTOR[cut] * sizeMm ** 3;
}

/**
 * Price per carat², in pence, at carat = 1.0. Real gem pricing rises
 * superlinearly with size — rarity compounds on top of the raw weight — so
 * price is modelled as rate × carat², not rate × carat. Ordered diamond >
 * ruby > sapphire > emerald per the brief.
 */
export const STONE_RATE_PENCE_PER_CARAT2: Record<StoneType, number> = {
  diamond: 400_000, // £4,000 at 1.00ct
  ruby: 250_000, // £2,500 at 1.00ct
  sapphire: 200_000, // £2,000 at 1.00ct
  emerald: 150_000, // £1,500 at 1.00ct
};

function priceStone(stone: Stone): PriceLine {
  const carat = mmToCarat(stone.sizeMm, stone.cut);
  const pence = Math.round(STONE_RATE_PENCE_PER_CARAT2[stone.type] * carat ** 2);
  return {
    label: `${stone.type[0].toUpperCase()}${stone.type.slice(1)} (${stone.cut})`,
    detail: `${stone.sizeMm.toFixed(1)}mm ≈ ${carat.toFixed(2)}ct`,
    pence,
  };
}

// ---------------------------------------------------------------------------
// Setting
// ---------------------------------------------------------------------------

/** Flat labour charge for the setting style itself, in pence. */
export const SETTING_BASE_PENCE: Record<Setting, number> = {
  solitaire: 8_000, // £80 — simplest, a single prong/claw head
  bezel: 12_000, // £120 — a precise metal rim ground to the stone
  halo: 20_000, // £200 — a ring of accent stones plus their labour
  pave: 24_000, // £240 — accent stones extending along the shoulders too
};

/**
 * Halo and pavé also add a charge for the small accent stones themselves,
 * scaled continuously by the centre stone's size (a bigger centre stone needs
 * a bigger, more populous ring/run of melee around it). Solitaire and bezel
 * use no accent stones, so their rate is zero.
 */
export const SETTING_SMALL_STONE_RATE_PENCE_PER_MM: Record<Setting, number> = {
  solitaire: 0,
  bezel: 0,
  halo: 3_500, // £35 of melee per mm of centre stone diameter
  pave: 5_000, // pavé runs further along the band, more melee overall
};

function priceSetting(design: DesignState): PriceLine | null {
  const centre = centreStone(design);
  if (!centre) return null;
  const base = SETTING_BASE_PENCE[design.setting];
  const smallStones = Math.round(
    SETTING_SMALL_STONE_RATE_PENCE_PER_MM[design.setting] * centre.sizeMm,
  );
  const pence = base + smallStones;
  const detail =
    smallStones > 0
      ? `${design.setting} setting, incl. accent stones sized to a ${centre.sizeMm.toFixed(1)}mm centre`
      : `${design.setting} setting`;
  return { label: "Setting", detail, pence };
}

// ---------------------------------------------------------------------------
// Engraving
// ---------------------------------------------------------------------------

/** Flat engraving charge, in pence. Script is more intricate hand-work. */
export const ENGRAVING_BASE_PENCE = 3_500; // £35, serif/block lettering
export const ENGRAVING_SCRIPT_SURCHARGE_PENCE = 1_500; // +£15 for script

function priceEngraving(design: DesignState): PriceLine | null {
  if (!design.engraving) return null;
  const pence =
    ENGRAVING_BASE_PENCE +
    (design.engraving.font === "script" ? ENGRAVING_SCRIPT_SURCHARGE_PENCE : 0);
  return {
    label: "Engraving",
    detail: `"${design.engraving.text}" (${design.engraving.font}, ${design.engraving.placement})`,
    pence,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function estimatePrice(design: DesignState): PriceEstimate {
  const lines: PriceLine[] = [priceMetal(design.band)];

  for (const stone of design.stones) {
    lines.push(priceStone(stone));
  }

  const settingLine = priceSetting(design);
  if (settingLine) lines.push(settingLine);

  const engravingLine = priceEngraving(design);
  if (engravingLine) lines.push(engravingLine);

  const totalPence = lines.reduce((sum, l) => sum + l.pence, 0);

  const summary = buildSummary(design, lines, totalPence);

  return { currency: "GBP", totalPence, lines, summary };
}

function buildSummary(design: DesignState, lines: PriceLine[], totalPence: number): string {
  const biggestLine = lines.reduce((a, b) => (b.pence > a.pence ? b : a), lines[0]);
  const stoneCount = design.stones.length;
  const stoneText =
    stoneCount === 0
      ? "no stones"
      : stoneCount === 1
        ? `its ${design.stones[0].type}`
        : `its ${stoneCount} stones`;
  return (
    `This design comes to approximately ${formatGBP(totalPence)}, driven mostly by ` +
    `${biggestLine.label.toLowerCase()} (${formatGBP(biggestLine.pence)}) — ` +
    `a ${design.band.widthMm.toFixed(1)}mm ${design.band.profile} ${design.band.metal} gold band with ${stoneText}.`
  );
}

/** "£1,234" — whole-pound amounts (and anything ≥ £100) drop the pence. */
export function formatGBP(pence: number): string {
  const pounds = pence / 100;
  const isWhole = pence % 100 === 0;
  if (isWhole || Math.abs(pounds) >= 100) {
    return `£${Math.round(pounds).toLocaleString("en-GB")}`;
  }
  return `£${pounds.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
