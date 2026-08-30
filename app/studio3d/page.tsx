"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Controls } from "@/components/Controls";
import { useEasedDesign } from "@/components/useEasedDesign";
import { initialDesign } from "@/lib/design";
import { installMockModelContext } from "@/lib/mock-model-context";
import { loadDesign, scheduleSave } from "@/lib/persist";
import { estimatePrice, formatGBP } from "@/lib/price";
import { useDesign } from "@/lib/store";
import { coreTools, engravingTool } from "@/lib/tools";
import {
  isWebMcpAvailable,
  registerTool,
  registerTools,
  registeredNames,
  unregisterTool,
  subscribeRegistry,
} from "@/lib/webmcp";

installMockModelContext();

/**
 * WebGL has no server-side equivalent, so the canvas cannot be prerendered.
 * That is a real cost of this route and not a detail: the SVG page paints the
 * ring in the server response, this one paints nothing until the bundle lands.
 */
import type { GemMode } from "@/components/three/Ring3D";

const RingScene3D = dynamic(
  () => import("@/components/three/RingScene3D").then((m) => m.RingScene3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-[12px] opacity-40">
        Loading renderer…
      </div>
    ),
  },
);

const noSubscribe = () => () => {};
const returnFalse = () => false;
const EMPTY: string[] = [];
const emptyList = () => EMPTY;

export default function Studio3DPage() {
  const design = useDesign((s) => s.design);
  const shown = useEasedDesign(design);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<GemMode>("specular");

  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);
  const tools = useSyncExternalStore(subscribeRegistry, registeredNames, emptyList);

  // Identical to the SVG route, deliberately. The tools do not know or care
  // which renderer is mounted — that is the claim this route is testing.
  useEffect(() => {
    registerTools(coreTools);
  }, []);

  useEffect(() => {
    if (design.settingChosen) registerTool(engravingTool);
    else unregisterTool(engravingTool.name);
  }, [design.settingChosen]);

  const restored = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadDesign().then((saved) => {
      const untouched = useDesign.getState().design === initialDesign;
      if (!cancelled && saved && untouched) useDesign.getState().replace(saved);
      restored.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restored.current) scheduleSave(design);
  }, [design]);

  const price = estimatePrice(design);

  return (
    <div className="flex min-h-full flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      <section className="relative flex min-h-[52vh] flex-1 items-center justify-center bg-[#141312] lg:min-h-0">
        <RingScene3D design={shown} mode={mode} fpsRef={fpsRef} />

        <div className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-400" : "bg-stone-500"}`} />
          <span className="text-[11px] tracking-tight text-white/70">
            {available ? `${tools.length} tools available to your agent` : "Agent tools idle"}
          </span>
        </div>

        <div className="absolute right-5 top-5 flex items-center gap-3 text-[11px] text-white/55">
          <span ref={fpsRef} className="font-mono tabular-nums">— fps</span>
          <div className="flex overflow-hidden rounded-full bg-white/10 backdrop-blur-sm">
            {(["specular", "refractive", "refractive-core"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 transition ${mode === m ? "bg-white/80 text-stone-900" : "hover:bg-white/20"}`}
                title="How the centre stone is shaded — see GEM_SPECULAR in materials3d.ts"
              >
                {m === "refractive-core" ? "refract+core" : m}
              </button>
            ))}
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-5 left-5 text-[11px] text-white/40">
          Drag to orbit · scroll to zoom
        </p>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-6 border-t border-black/10 bg-[var(--surface)] p-6 lg:h-screen lg:w-[352px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-8">
        <header>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-serif text-[26px] leading-none tracking-tight">Loomlace 3D</h1>
            <Link href="/" className="text-[11px] underline decoration-dotted underline-offset-4 opacity-50 hover:opacity-90">
              SVG version
            </Link>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed opacity-55">
            Same store, same tools, same controls — only the renderer is different.
          </p>
        </header>

        <Controls design={design} />

        <div className="mt-auto border-t border-black/10 pt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">Estimate</span>
            <span className="font-serif text-[22px] tracking-tight">{formatGBP(price.totalPence)}</span>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed opacity-40">
            Spike route. Engraving and drag-to-move are not implemented here — see
            the note in wiki/3d-spike.md before choosing a direction.
          </p>
        </div>
      </aside>
    </div>
  );
}
