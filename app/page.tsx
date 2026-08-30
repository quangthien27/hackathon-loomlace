"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ActivityFeed, AgentBadge, PriceBreakdown } from "@/components/AgentOverlay";
import { Controls } from "@/components/Controls";
import { RingCanvas } from "@/components/RingCanvas";
import { useEasedDesign } from "@/components/useEasedDesign";
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
  registeredNames,
  subscribeActivity,
  subscribeRegistry,
  unregisterTool,
} from "@/lib/webmcp";

// Runs at module-eval time on the client, before any effect registers a tool.
// ?mock=1 only; a no-op in a browser that already has the real API.
installMockModelContext();

const noSubscribe = () => () => {};
const returnFalse = () => false;
const EMPTY: string[] = [];
const emptyList = () => EMPTY;
const EMPTY_ACTIVITY: ReturnType<typeof getActivity> = [];
const noActivity = () => EMPTY_ACTIVITY;

export default function Page() {
  const design = useDesign((s) => s.design);
  const shown = useEasedDesign(design);

  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);
  const tools = useSyncExternalStore(subscribeRegistry, registeredNames, emptyList);
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
      <section className="relative flex min-h-[52vh] flex-1 items-center justify-center lg:min-h-0">
        <RingCanvas
          design={shown}
          onMoveStone={(id, x, y) => useDesign.getState().placeStone({ id, x, y })}
        />
        <AgentBadge available={available} count={tools.length} />
        <ActivityFeed activity={activity} />
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-6 border-t border-black/10 bg-[var(--surface)] p-6 lg:h-screen lg:w-[352px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-8">
        <header>
          <h1 className="font-serif text-[26px] leading-none tracking-tight">Loomlace</h1>
          <p className="mt-2 text-[13px] leading-relaxed opacity-55">
            Design it yourself, or ask your agent. You are both editing the same ring.
          </p>
        </header>

        <Controls design={design} />

        <div className="mt-auto border-t border-black/10 pt-5">
          <PriceBreakdown lines={price.lines} total={formatGBP(price.totalPence)} />
          <p className="mt-4 text-[11px] leading-relaxed opacity-40">
            Nothing here has left your browser. The design is stored locally and is
            only sent anywhere when you order.
          </p>
        </div>
      </aside>
    </div>
  );
}
