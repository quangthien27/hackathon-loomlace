"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ActivityFeed, AgentBadge, PriceBreakdown } from "@/components/AgentOverlay";
import { Controls } from "@/components/Controls";
import { RingCanvas } from "@/components/RingCanvas";
import { useEasedDesign } from "@/components/useEasedDesign";
import { orderHandoff } from "@/lib/order";
import { estimatePrice, formatGBP } from "@/lib/price";
import { loadDesign, scheduleSave } from "@/lib/persist";
import { installMockModelContext } from "@/lib/mock-model-context";
import { initialDesign } from "@/lib/design";
import { useDesign } from "@/lib/store";
import { coreTools, engravingTool } from "@/lib/tools";
import {
  getActivity,
  isWebMcpAvailable,
  registerTool,
  registerTools,
  registeredTools,
  subscribeActivity,
  subscribeRegistry,
  unregisterTool,
} from "@/lib/webmcp";
import type { ToolCard } from "@/lib/webmcp";

// Runs at module-eval time on the client, before any effect registers a tool.
// ?mock=1 only; a no-op in a browser that already has the real API.
installMockModelContext();

const noSubscribe = () => () => {};
const returnFalse = () => false;
const EMPTY_TOOLS: ToolCard[] = [];
const emptyTools = () => EMPTY_TOOLS;
const EMPTY_ACTIVITY: ReturnType<typeof getActivity> = [];
const noActivity = () => EMPTY_ACTIVITY;

export default function Page() {
  const design = useDesign((s) => s.design);
  const shown = useEasedDesign(design);

  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);
  const tools = useSyncExternalStore(subscribeRegistry, registeredTools, emptyTools);
  const activity = useSyncExternalStore(subscribeActivity, getActivity, noActivity);

  // Register the always-on tools exactly once. No cleanup: they live for the
  // lifetime of the page, so Strict Mode's double-invoke is a no-op.
  useEffect(() => {
    registerTools(coreTools);
  }, []);

  // add_engraving exists only once a setting has been committed to.
  useEffect(() => {
    if (design.settingChosen) registerTool(engravingTool);
    else unregisterTool(engravingTool.name);
  }, [design.settingChosen]);

  // Restore, then persist every change. IndexedDB may answer after the human
  // has already touched something, so only restore over a design that is still
  // untouched — otherwise a slow disk silently undoes their first edit.
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
      <section className="relative flex h-[58vh] shrink-0 items-center justify-center lg:h-auto lg:min-h-0 lg:flex-1">
        <RingCanvas
          design={shown}
          onMoveStone={(id, x, y) => useDesign.getState().placeStone({ id, x, y })}
        />
        <AgentBadge available={available} tools={tools} />
        <ActivityFeed activity={activity} />
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-6 border-t border-black/10 bg-[var(--surface)] p-6 lg:h-screen lg:w-[352px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-4">
        <header>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-serif text-[26px] leading-none tracking-tight">Loomlace</h1>
            <Link
              href="/"
              className="text-[11px] underline decoration-dotted underline-offset-4 opacity-50 transition hover:opacity-90"
            >
              3D studio
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
            Nothing here has left your browser. The design is stored locally and is
            only sent anywhere when you order.
          </p>
        </div>
      </aside>
    </div>
  );
}
