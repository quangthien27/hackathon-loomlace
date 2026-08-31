"use client";

import type { Cut, DesignState, Metal, Profile, Setting, StoneType, View } from "@/lib/design";
import { BAND_MAX_MM, BAND_MIN_MM, centreStone, STONE_MAX_MM, STONE_MIN_MM } from "@/lib/design";
import { METAL, STONE, STONE_SWATCH } from "@/lib/render/materials";
import { PRESET_BLURB, PRESET_NAMES, type PresetName } from "@/lib/presets";
import { useDesign } from "@/lib/store";
import { LooksPanel } from "./LooksStrip";

const PROFILES: Profile[] = ["flat", "court", "bevel", "knife-edge"];
const SETTINGS: Setting[] = ["solitaire", "halo", "pave", "bezel"];
const VIEWS: View[] = ["top", "side", "inside"];
const CUTS: Cut[] = ["round", "oval", "emerald", "princess"];
const TYPES: StoneType[] = ["diamond", "sapphire", "emerald", "ruby"];
const METALS: Metal[] = ["yellow", "white", "rose", "platinum"];

/**
 * UK ring sizes, F to Z in half steps.
 *
 * The tool accepts A-Z because a novelty or child's size is still a valid
 * design; the picker offers only the range an adult finger actually falls in,
 * since a dropdown is a menu of sensible choices rather than a spec of what is
 * parseable. The half symbol has to match what `normalizeUkSize` emits, or the
 * agent and the dropdown would disagree about what "L half" means.
 */
const UK_SIZES: string[] = (() => {
  const out: string[] = [];
  for (let code = "F".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    const letter = String.fromCharCode(code);
    out.push(letter);
    if (letter !== "Z") out.push(`${letter}\u00bd`);
  }
  return out;
})();

const PLACEMENTS = ["inside", "outside"] as const;
const FONTS = ["serif", "script"] as const;

/** Short enough to sit on one line in a four-up segmented control. */
const PROFILE_LABEL: Record<Profile, string> = {
  flat: "Flat",
  court: "Court",
  bevel: "Bevel",
  "knife-edge": "Knife",
};

const SETTING_LABEL: Record<Setting, string> = {
  solitaire: "Solitaire",
  halo: "Halo",
  pave: "Pavé",
  bezel: "Bezel",
};

/**
 * The human's half of the surface. Every control here calls exactly the same
 * store action the corresponding WebMCP tool calls — there is no second code
 * path for the agent. That is the whole architectural claim, so it should be
 * literally true in this file.
 */
export function Controls({ design }: { design: DesignState }) {
  const s = useDesign.getState();
  const centre = centreStone(design);

  return (
    <div className="flex flex-col gap-7">
      <Group label="View">
        <Segmented
          options={VIEWS}
          value={design.view}
          onChange={(v) => s.setView(v)}
          render={(v) => v}
        />
      </Group>

      <Group label="Metal">
        <SwatchGrid
          options={METALS}
          value={design.band.metal}
          onChange={(m) => s.setBand({ metal: m })}
          label={(m) => METAL[m].label}
          swatch={(m) =>
            `linear-gradient(150deg, ${METAL[m].highlight} 0%, ${METAL[m].light} 26%, ${METAL[m].base} 58%, ${METAL[m].shade} 100%)`
          }
        />
      </Group>

      <Group label="Band" value={`${design.band.widthMm.toFixed(1)}mm`}>
        <Slider
          min={BAND_MIN_MM}
          max={BAND_MAX_MM}
          step={0.1}
          value={design.band.widthMm}
          onChange={(v) => s.setBand({ widthMm: v })}
          ariaLabel="Band width in millimetres"
        />
        <Segmented
          options={PROFILES}
          value={design.band.profile}
          onChange={(p) => s.setBand({ profile: p })}
          render={(p) => PROFILE_LABEL[p]}
        />
      </Group>

      <Group label="Ring size" value={`UK ${design.sizeUk}`}>
        <select
          value={design.sizeUk}
          onChange={(e) => s.setSizeUk(e.target.value)}
          aria-label="UK ring size"
          className="w-full appearance-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-[13px] outline-none transition focus:border-black/35"
        >
          {UK_SIZES.map((size) => (
            <option key={size} value={size}>
              UK {size}
            </option>
          ))}
        </select>
      </Group>

      <Group label="Setting">
        <Segmented
          options={SETTINGS}
          value={design.setting}
          onChange={(v) => s.setSetting(v)}
          render={(v) => SETTING_LABEL[v]}
        />
      </Group>

      {centre && (
        <>
          <Group label="Stone" value={`${centre.sizeMm.toFixed(1)}mm`}>
            <Slider
              min={STONE_MIN_MM}
              max={STONE_MAX_MM}
              step={0.1}
              value={centre.sizeMm}
              onChange={(v) => s.placeStone({ id: centre.id, sizeMm: v })}
              ariaLabel="Stone size in millimetres"
            />
            <SwatchGrid
              options={TYPES}
              value={centre.type}
              onChange={(t) => s.placeStone({ id: centre.id, type: t })}
              label={(t) => STONE[t].label}
              swatch={(t) => STONE_SWATCH[t]}
            />
          </Group>

          <Group label="Cut">
            <Segmented
              options={CUTS}
              value={centre.cut}
              onChange={(c) => s.placeStone({ id: centre.id, cut: c })}
              render={(c) => c}
            />
          </Group>
        </>
      )}

      {design.settingChosen && (
        <Group label="Engraving">
          <input
            type="text"
            maxLength={40}
            placeholder="For E, 2026"
            value={design.engraving?.text ?? ""}
            onChange={(e) => {
              const text = e.target.value;
              s.setEngraving(
                text.trim()
                  ? {
                      text,
                      font: design.engraving?.font ?? "serif",
                      placement: design.engraving?.placement ?? "inside",
                    }
                  : null,
              );
            }}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-[13px] outline-none transition placeholder:opacity-35 focus:border-black/35"
            aria-label="Engraving text"
          />
          {design.engraving && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Segmented
                  options={PLACEMENTS}
                  value={design.engraving.placement}
                  onChange={(placement) =>
                    s.setEngraving({ ...design.engraving!, placement })
                  }
                  render={(v) => v}
                />
              </div>
              <div className="flex-1">
                <Segmented
                  options={FONTS}
                  value={design.engraving.font}
                  onChange={(font) => s.setEngraving({ ...design.engraving!, font })}
                  render={(v) => v}
                />
              </div>
            </div>
          )}
        </Group>
      )}

      <Group label="Style">
        <div className="flex flex-col gap-1.5">
          {PRESET_NAMES.map((p: PresetName) => (
            <button
              key={p}
              onClick={() => s.applyPreset(p)}
              className="group rounded-lg border border-black/10 px-3 py-2 text-left transition hover:border-black/30 hover:bg-black/[0.03]"
            >
              <span className="text-[13px] font-medium tracking-tight">{p}</span>
              <span className="mt-0.5 block text-[11px] leading-snug opacity-55">
                {PRESET_BLURB[p]}
              </span>
            </button>
          ))}
        </div>
      </Group>

      {/* Last, and deliberately after Style: presets are the edit most worth
          being able to take back, so the way back sits directly under them. */}
      <LooksPanel />
    </div>
  );
}

/**
 * A material swatch: a tile big enough to judge the colour, with its name
 * underneath.
 *
 * Nine-millimetre circles could not carry a label, so the only way to tell
 * white gold from platinum was to hover one and read a tooltip — which is no
 * way to choose a metal, and impossible on a touch screen.
 */
function SwatchGrid<T extends string>({
  options,
  value,
  onChange,
  label,
  swatch,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
  swatch: (v: T) => string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className="group flex flex-col items-stretch gap-1.5 text-left"
        >
          <span
            className={`h-11 w-full rounded-lg transition ${
              value === o
                ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-[var(--surface)] dark:ring-stone-100"
                : "ring-1 ring-black/10 group-hover:ring-black/30"
            }`}
            style={{ background: swatch(o) }}
          />
          <span
            className={`text-[10px] leading-tight tracking-tight transition ${
              value === o ? "opacity-80" : "opacity-45 group-hover:opacity-70"
            }`}
          >
            {label(o)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * A range input with a visible track and a filled portion.
 *
 * The bare control rendered as a one-pixel line across the panel, which read as
 * a section divider rather than as something you could drag.
 */
function Slider({
  min,
  max,
  step,
  value,
  onChange,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="loom-slider w-full my-2"
      style={{ ["--fill" as string]: `${pct}%` }}
    />
  );
}

function Group({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">
          {label}
        </h3>
        {value && <span className="font-mono text-[11px] opacity-55">{value}</span>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-black/[0.07] p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-[12px] capitalize transition ${
            value === o
              ? "bg-stone-900 font-medium text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
              : "opacity-50 hover:opacity-90"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
