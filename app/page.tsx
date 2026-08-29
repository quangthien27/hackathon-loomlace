"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BAND_MAX_MM, BAND_MIN_MM, type Metal } from "@/lib/design";
import { useDesign } from "@/lib/store";
import { installMockModelContext } from "@/lib/mock-model-context";
import { coreTools, engravingTool } from "@/lib/tools";
import {
  browserReportedTools,
  isWebMcpAvailable,
  modelContext,
  registerTools,
  registeredNames,
  registerTool,
  subscribeRegistry,
  unregisterTool,
} from "@/lib/webmcp";

// Runs at module-eval time on the client, i.e. before any effect registers a
// tool. ?mock=1 only; a no-op in the real browser, which already has the API.
installMockModelContext();

const METALS: Metal[] = ["yellow", "white", "rose", "platinum"];

// Stable identities for useSyncExternalStore.
const noSubscribe = () => () => {};
const returnFalse = () => false;
const EMPTY: string[] = [];
const emptyList = () => EMPTY;

export default function Page() {
  const design = useDesign((s) => s.design);
  const setBand = useDesign((s) => s.setBand);
  const setSetting = useDesign((s) => s.setSetting);
  const setEngraving = useDesign((s) => s.setEngraving);

  const [reported, setReported] = useState<string[]>([]);

  // Availability is read after hydration, never during SSR — document.modelContext
  // does not exist on the server.
  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);

  const ourTools = useSyncExternalStore(subscribeRegistry, registeredNames, emptyList);
  const toolKey = ourTools.join(",");

  // Register the always-on tools exactly once. No cleanup: these live for the
  // lifetime of the page, so Strict Mode's double-invoke is a no-op.
  useEffect(() => {
    registerTools(coreTools);
  }, []);

  // add_engraving is registered/unregistered as the design progresses.
  const settingChosen = design.settingChosen;
  useEffect(() => {
    if (settingChosen) registerTool(engravingTool);
    else unregisterTool(engravingTool.name);
  }, [settingChosen]);

  // Ask the browser what it actually sees, and re-ask on every toolchange.
  useEffect(() => {
    const mc = modelContext();
    const refresh = () => void browserReportedTools().then(setReported);
    refresh();
    mc?.addEventListener("toolchange", refresh);
    return () => mc?.removeEventListener("toolchange", refresh);
  }, [toolKey]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8 font-mono text-sm">
      <header className="flex flex-col gap-1">
        <h1 className="font-sans text-2xl font-medium tracking-tight">Loomlace</h1>
        <p className="opacity-60">Day 1 gate harness — not the product.</p>
      </header>

      <section className="rounded border border-current/15 p-4">
        <h2 className="mb-2 font-sans font-medium">1 · WebMCP detected</h2>
        <p>
          {available
            ? "✅ document.modelContext.registerTool is a function"
            : "❌ not available — open in ChatGPT's in-app browser, or Chrome with chrome://flags/#enable-webmcp-testing"}
        </p>
      </section>

      <section className="rounded border border-current/15 p-4">
        <h2 className="mb-2 font-sans font-medium">2 · Registered tools</h2>
        <p className="opacity-60">this page thinks: {ourTools.join(", ") || "—"}</p>
        <p className="opacity-60">
          browser reports: {reported.join(", ") || "— (getTools unsupported or empty)"}
        </p>
      </section>

      <section className="rounded border border-current/15 p-4">
        <h2 className="mb-2 font-sans font-medium">3 · Dynamic registration</h2>
        <p className="mb-3 opacity-60">
          add_engraving should appear only once a setting is chosen.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-current/30 px-3 py-1"
            onClick={() => setSetting("halo")}
          >
            choose halo setting
          </button>
          <button
            className="rounded border border-current/30 px-3 py-1"
            onClick={() => {
              setEngraving(null);
              useDesign.getState().reset();
            }}
          >
            reset to bare band
          </button>
        </div>
      </section>

      <section className="rounded border border-current/15 p-4">
        <h2 className="mb-2 font-sans font-medium">4 · Human edits, same store</h2>
        <p className="mb-3 opacity-60">
          Move these while the agent works — then ask it to call get_design_state.
        </p>
        <label className="flex items-center gap-3">
          <span className="w-24">width</span>
          <input
            type="range"
            min={BAND_MIN_MM}
            max={BAND_MAX_MM}
            step={0.1}
            value={design.band.widthMm}
            onChange={(e) => setBand({ widthMm: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-14 text-right">{design.band.widthMm.toFixed(1)}mm</span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {METALS.map((m) => (
            <button
              key={m}
              onClick={() => setBand({ metal: m })}
              className={`rounded border px-3 py-1 ${
                design.band.metal === m ? "border-current" : "border-current/20 opacity-60"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded border border-current/15 p-4">
        <h2 className="mb-2 font-sans font-medium">5 · Live state</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs opacity-80">
          {JSON.stringify(design, null, 2)}
        </pre>
      </section>
    </main>
  );
}
