"use client";

import type { Cut, DesignState, Metal, Profile, Setting, StoneType, View } from "@/lib/design";
import { BAND_MAX_MM, BAND_MIN_MM, centreStone, STONE_MAX_MM, STONE_MIN_MM } from "@/lib/design";
import { METAL, STONE } from "@/lib/render/materials";
import { PRESET_BLURB, PRESET_NAMES, type PresetName } from "@/lib/presets";
import { useDesign } from "@/lib/store";

const PROFILES: Profile[] = ["flat", "court", "knife-edge"];
const SETTINGS: Setting[] = ["solitaire", "halo", "pave", "bezel"];
const VIEWS: View[] = ["top", "side", "inside"];
const CUTS: Cut[] = ["round", "oval", "emerald", "princess"];
const TYPES: StoneType[] = ["diamond", "sapphire", "emerald", "ruby"];
const METALS: Metal[] = ["yellow", "white", "rose", "platinum"];

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
        <div className="flex gap-2">
          {METALS.map((m) => (
            <button
              key={m}
              onClick={() => s.setBand({ metal: m })}
              title={METAL[m].label}
              aria-label={METAL[m].label}
              aria-pressed={design.band.metal === m}
              className={`h-9 w-9 rounded-full transition ${
                design.band.metal === m
                  ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-[var(--surface)]"
                  : "ring-1 ring-black/10 hover:ring-black/25"
              }`}
              style={{
                background: `linear-gradient(140deg, ${METAL[m].highlight}, ${METAL[m].base} 55%, ${METAL[m].shade})`,
              }}
            />
          ))}
        </div>
      </Group>

      <Group label="Band" value={`${design.band.widthMm.toFixed(1)}mm`}>
        <input
          type="range"
          min={BAND_MIN_MM}
          max={BAND_MAX_MM}
          step={0.1}
          value={design.band.widthMm}
          onChange={(e) => s.setBand({ widthMm: Number(e.target.value) })}
          className="w-full accent-stone-800"
          aria-label="Band width in millimetres"
        />
        <Segmented
          options={PROFILES}
          value={design.band.profile}
          onChange={(p) => s.setBand({ profile: p })}
          render={(p) => p}
        />
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
            <input
              type="range"
              min={STONE_MIN_MM}
              max={STONE_MAX_MM}
              step={0.1}
              value={centre.sizeMm}
              onChange={(e) =>
                s.placeStone({ id: centre.id, sizeMm: Number(e.target.value) })
              }
              className="w-full accent-stone-800"
              aria-label="Stone size in millimetres"
            />
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => s.placeStone({ id: centre.id, type: t })}
                  title={STONE[t].label}
                  aria-label={STONE[t].label}
                  aria-pressed={centre.type === t}
                  className={`h-9 w-9 rounded-full transition ${
                    centre.type === t
                      ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-[var(--surface)]"
                      : "ring-1 ring-black/10 hover:ring-black/25"
                  }`}
                  style={{
                    background: `radial-gradient(circle at 35% 28%, ${STONE[t].highlight}, ${STONE[t].base} 60%, ${STONE[t].deep})`,
                  }}
                />
              ))}
            </div>
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
    </div>
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
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] capitalize transition ${
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
