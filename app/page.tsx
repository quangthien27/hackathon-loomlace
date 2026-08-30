"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

export default function Page() {
  const design = useDesign((s) => s.design);
  const shown = useEasedDesign(design);

  const available = useSyncExternalStore(noSubscribe, isWebMcpAvailable, returnFalse);
  const tools = useSyncExternalStore(subscribeRegistry, registeredNames, emptyList);
  const activity = useSyncExternalStore(subscribeActivity, getActivity, () => EMPTY_ACTIVITY);

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
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">
              Estimate
            </span>
            <span className="font-serif text-[22px] tracking-tight">
              {formatGBP(price.totalPence)}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1">
            {price.lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-3 text-[11.5px]">
                <span className="opacity-55">{l.detail}</span>
                <span className="shrink-0 font-mono opacity-70">{formatGBP(l.pence)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed opacity-40">
            Nothing here has left your browser. The design is stored locally and is
            only sent anywhere when you order.
          </p>
        </div>
      </aside>
    </div>
  );
}

const EMPTY_ACTIVITY: ReturnType<typeof getActivity> = [];

function AgentBadge({ available, count }: { available: boolean; count: number }) {
  return (
    <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-black/[0.055] px-3 py-1.5 backdrop-blur-sm">
      <span
        className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-600" : "bg-stone-400"}`}
      />
      <span className="text-[11px] tracking-tight opacity-65">
        {available ? `${count} tools available to your agent` : "Agent tools idle"}
      </span>
    </div>
  );
}

function ActivityFeed({ activity }: { activity: ReturnType<typeof getActivity> }) {
  const [dismissedId, setDismissedId] = useState(0);
  const latest = activity[0];

  // Each entry shows for a few seconds, so the human can watch the agent work
  // without the feed becoming a wall of text during a fast sequence of edits.
  // Visibility is derived during render; the timer only marks what's been seen.
  const visible = latest && latest.id > dismissedId ? activity.slice(0, 3) : [];

  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(() => setDismissedId(latest.id), 4200);
    return () => clearTimeout(t);
  }, [latest]);

  if (!visible.length) return null;

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-col gap-1.5 lg:right-auto lg:max-w-sm">
      {visible.map((a, i) => (
        <div
          key={a.id}
          className="rounded-lg bg-stone-900/85 px-3 py-2 text-[11.5px] leading-snug text-stone-50 shadow-lg backdrop-blur-sm"
          style={{ opacity: 1 - i * 0.32 }}
        >
          <span className="font-mono text-[10px] opacity-55">{a.tool}</span>
          <span className="ml-2">{a.summary}</span>
        </div>
      ))}
    </div>
  );
}
