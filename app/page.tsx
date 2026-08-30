"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityFeed, AgentBadge, PriceBreakdown } from "@/components/AgentOverlay";
import { Controls } from "@/components/Controls";
import { useEasedDesign } from "@/components/useEasedDesign";
import type { GemMode } from "@/components/three/Ring3D";
import { describeDesign } from "@/lib/describe";
import { assumeWebGL, hasWebGL, subscribeWebGL } from "@/lib/webgl";
import { initialDesign } from "@/lib/design";
import { installMockModelContext } from "@/lib/mock-model-context";
import { loadDesign, scheduleSave } from "@/lib/persist";
import { orderHandoff } from "@/lib/order";
import { estimatePrice, formatGBP } from "@/lib/price";
import { useDesign } from "@/lib/store";
import { coreTools, engravingTool } from "@/lib/tools";
import {
  getActivity,
  isWebMcpAvailable,
  registerTool,
  registerTools,
  registeredNames,
  subscribeActivity,
  subscribeRegistry,
  unregisterTool,
} from "@/lib/webmcp";

installMockModelContext();

/**
 * WebGL has no server-side equivalent, so the canvas cannot be prerendered.
 * That is a real cost of this renderer and not a detail: the SVG page paints
 * the ring in the server response, this one paints nothing until the bundle
 * lands. The skeleton below is what a judge sees on a cold, slow connection.
 */
const RingScene3D = dynamic(
  () => import("@/components/three/RingScene3D").then((m) => m.RingScene3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-[12px] tracking-wide text-white/35">Preparing the studio…</span>
      </div>
    ),
  },
);

/**
 * The flat renderer, loaded only if WebGL is missing.
 *
 * Deliberately NOT a second first-class surface: it is a still picture of the
 * design so the page is usable rather than blank, and the banner says so. The
 * alternative — keeping both renderers at full parity through engraving,
 * dragging and every setting — is two products, and the cost lands every time
 * either one changes.
 */
const FlatFallback = dynamic(() => import("@/components/RingCanvas").then((m) => m.RingCanvas), {
  ssr: false,
});

const noSubscribe = () => () => {};
const returnFalse = () => false;
const EMPTY: string[] = [];
const emptyList = () => EMPTY;
const EMPTY_ACTIVITY: ReturnType<typeof getActivity> = [];
const noActivity = () => EMPTY_ACTIVITY;

export default function Studio3DPage() {
  const design = useDesign((s) => s.design);
  const [dragging, setDragging] = useState(false);
  const shown = useEasedDesign(design, dragging);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<GemMode>("refractive-core");
  const [exposure, setExposure] = useState(1.7);
  // Read like any other external, unchanging fact about the environment.
  const webgl = useSyncExternalStore(subscribeWebGL, hasWebGL, assumeWebGL);

  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);
  const tools = useSyncExternalStore(subscribeRegistry, registeredNames, emptyList);
  const activity = useSyncExternalStore(subscribeActivity, getActivity, noActivity);

  // Identical to the SVG route, deliberately. The tools do not know or care
  // which renderer is mounted.
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
      if (cancelled) return; // a superseded mount must not claim the restore
      const untouched = useDesign.getState().design === initialDesign;
      if (saved && untouched) useDesign.getState().replace(saved);
      // Only now may saving begin: flipping this on a cancelled pass would let
      // the next design change overwrite good data with the default design.
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
      <section
        className={`relative flex h-[58vh] shrink-0 items-center justify-center lg:h-auto lg:min-h-0 lg:flex-1 ${
          !webgl ? "bg-[var(--surface)]" : "bg-[#141312]"
        }`}
      >
        {!webgl ? (
          <>
            <FlatFallback design={shown} onMoveStone={() => {}} />
            <p className="absolute bottom-5 left-1/2 w-[min(92%,32rem)] -translate-x-1/2 rounded-lg bg-amber-100/90 px-3 py-2 text-center text-[11.5px] leading-snug text-amber-950 shadow-sm">
              This browser has no WebGL, so the ring is shown flat. Every control and every agent
              tool still works — only the 3D view is unavailable.
            </p>
          </>
        ) : (
          <RingScene3D
            design={shown}
            mode={mode}
            exposure={exposure}
            fpsRef={fpsRef}
            onDragChange={setDragging}
          />
        )}

        {/* The canvas is one opaque element to a screen reader, so the design is
            described in text alongside it. */}
        <p className="sr-only" role="img" aria-label={describeDesign(design)} />

        <AgentBadge available={available} count={tools.length} tone={webgl ? "dark" : "light"} />
        <ActivityFeed activity={activity} />

        {/* Every canvas control lives in ONE cluster, bottom-right. They used to
            be split between two corners, which collided with the tools badge as
            soon as the viewport got narrow. Wrapping keeps them apart on a
            phone without needing a breakpoint per control.

            A dark scrim rather than a white one, for the same reason as the
            tools badge: these float over the lit studio, not over the page. */}
        {webgl && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-end gap-2 text-[11px] text-white/75 sm:inset-x-5 sm:bottom-5">
            <span className="mr-auto hidden opacity-70 [text-shadow:0_1px_3px_rgb(0_0_0/0.65)] lg:inline">
              Drag to orbit · scroll to zoom
            </span>

            <span
              ref={fpsRef}
              className="pointer-events-auto rounded-full bg-black/45 px-2.5 py-1.5 font-mono tabular-nums ring-1 ring-white/10 backdrop-blur-md"
              title="Frames per second"
            >
              — fps
            </span>

            <label className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="opacity-75">light</span>
              <input
                type="range"
                min={0.8}
                max={3.2}
                step={0.05}
                value={exposure}
                onChange={(e) => setExposure(Number(e.target.value))}
                aria-label="Studio brightness"
                className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/30 accent-white sm:w-20"
              />
            </label>

            <div className="pointer-events-auto flex overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10 backdrop-blur-md">
              {(["specular", "refractive", "refract+core"] as const).map((label) => {
                const value: GemMode =
                  label === "refract+core" ? "refractive-core" : (label as GemMode);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`px-2.5 py-1.5 transition sm:px-3 ${
                      mode === value ? "bg-white/90 text-stone-900" : "hover:bg-white/15"
                    }`}
                    title="How the centre stone is shaded — see GEM_SPECULAR in materials3d.ts"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </section>

      <aside className="flex w-full shrink-0 flex-col gap-6 border-t border-black/10 bg-[var(--surface)] p-6 lg:h-screen lg:w-[352px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-4">
        <header>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-serif text-[26px] leading-none tracking-tight">Loomlace</h1>
            <Link
              href="/flat"
              className="text-[11px] underline decoration-dotted underline-offset-4 opacity-50 transition hover:opacity-90"
            >
              flat view
            </Link>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed opacity-55">
            Design it yourself, or ask your agent. You are both editing the same ring.
          </p>
        </header>

        <Controls design={design} />

        <div className="mt-auto border-t border-black/10 pt-5">
          <PriceBreakdown lines={price.lines} total={formatGBP(price.totalPence)} />

          {/* The same hand-off `add_to_cart` performs, through the same builder.
              Leaving it agent-only made a whole step of the product invisible to
              anyone who just wanted to click. */}
          <button
            type="button"
            onClick={() => window.open(orderHandoff(design), "_blank", "noopener")}
            className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-[13px] font-medium text-stone-50 transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            Review this ring
          </button>
          <p className="mt-4 text-[11px] leading-relaxed opacity-40">
            Nothing here has left your browser. The design is stored locally and is only sent
            anywhere when you order.
          </p>
        </div>
      </aside>
    </div>
  );
}
