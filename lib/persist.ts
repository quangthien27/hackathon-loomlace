/**
 * IndexedDB persistence for the design, via idb-keyval.
 *
 * Storage is inherently untrustworthy: an old schema version, a corrupted
 * blob, a private-browsing tab where IndexedDB throws on open. None of that
 * may ever break the app — every function here degrades to a no-op / null
 * rather than throwing outward.
 */

import { del, get, set } from "idb-keyval";
import type {
  Cut,
  DesignState,
  Engraving,
  Metal,
  Profile,
  Setting,
  Stone,
  StoneType,
  View,
} from "./design";

const STORAGE_KEY = "loomlace:design";

/**
 * Bump this whenever DesignState's shape changes in a way old data wouldn't
 * satisfy. On mismatch we return null rather than attempting migration —
 * a fresh default design is safer than guessing at a shape change.
 */
export const SCHEMA_VERSION = 1;

type StoredEnvelope = { version: number; design: DesignState };

function isSSRorNoIDB(): boolean {
  return typeof window === "undefined" || typeof indexedDB === "undefined";
}

const METALS: Metal[] = ["yellow", "white", "rose", "platinum"];
const PROFILES: Profile[] = ["flat", "court", "bevel", "knife-edge"];
const STONE_TYPES: StoneType[] = ["diamond", "sapphire", "emerald", "ruby"];
const CUTS: Cut[] = ["round", "oval", "emerald", "princess"];
const SETTINGS: Setting[] = ["solitaire", "halo", "pave", "bezel"];
const VIEWS: View[] = ["top", "side", "inside"];

function isOneOf<T>(v: unknown, options: readonly T[]): v is T {
  return (options as readonly unknown[]).includes(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStone(v: unknown): v is Stone {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    isOneOf(s.type, STONE_TYPES) &&
    isOneOf(s.cut, CUTS) &&
    isFiniteNumber(s.sizeMm) &&
    isFiniteNumber(s.x) &&
    isFiniteNumber(s.y)
  );
}

function isEngraving(v: unknown): v is Engraving {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.text === "string" &&
    isOneOf(e.font, ["serif", "script"]) &&
    isOneOf(e.placement, ["inside", "outside"])
  );
}

/** Validates the full shape of an unknown value before it's trusted as a DesignState. */
export function isDesignState(v: unknown): v is DesignState {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;

  if (typeof d.band !== "object" || d.band === null) return false;
  const band = d.band as Record<string, unknown>;
  if (
    !isFiniteNumber(band.widthMm) ||
    !isOneOf(band.profile, PROFILES) ||
    !isOneOf(band.metal, METALS)
  ) {
    return false;
  }

  if (!Array.isArray(d.stones) || !d.stones.every(isStone)) return false;

  if (!isOneOf(d.setting, SETTINGS)) return false;
  if (typeof d.settingChosen !== "boolean") return false;

  if (d.engraving !== null && !isEngraving(d.engraving)) return false;

  if (!isOneOf(d.view, VIEWS)) return false;
  if (typeof d.sizeUk !== "string") return false;

  return true;
}

export async function saveDesign(design: DesignState): Promise<void> {
  if (isSSRorNoIDB()) return;
  try {
    const envelope: StoredEnvelope = { version: SCHEMA_VERSION, design };
    await set(STORAGE_KEY, envelope);
  } catch {
    // Storage can throw in private-browsing / quota-exceeded contexts.
    // Silently drop the save rather than break the app.
  }
}

export async function loadDesign(): Promise<DesignState | null> {
  if (isSSRorNoIDB()) return null;
  try {
    const raw = await get(STORAGE_KEY);
    if (typeof raw !== "object" || raw === null) return null;
    const envelope = raw as Record<string, unknown>;
    if (envelope.version !== SCHEMA_VERSION) return null;
    if (!isDesignState(envelope.design)) return null;
    return envelope.design;
  } catch {
    return null;
  }
}

export async function clearDesign(): Promise<void> {
  if (isSSRorNoIDB()) return;
  try {
    await del(STORAGE_KEY);
  } catch {
    // Nothing to do — worst case is a stale value lingers until next save.
  }
}

// ---------------------------------------------------------------------------
// Debounced saver — sliders fire on every tick; coalesce to one write.
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesces rapid calls (e.g. slider drags) into a single write ~400ms after the last one. */
export function scheduleSave(design: DesignState): void {
  if (isSSRorNoIDB()) return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveDesign(design);
  }, SAVE_DEBOUNCE_MS);
}
