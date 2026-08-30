"use client";

import { useEffect, useState } from "react";
import type { getActivity } from "@/lib/webmcp";

type Activity = ReturnType<typeof getActivity>;

/**
 * The two overlays that tell a human what the agent is doing. Shared by both
 * renderers, because "what the agent just did" is a property of the session and
 * not of how the ring happens to be drawn.
 *
 * `tone` exists because the 3D canvas is dark and the SVG one is light; nothing
 * else differs.
 *
 * The dark tone is a dark scrim, not a light one. A white veil was the obvious
 * choice against a #141312 page, but the badge does not sit on the page — it
 * sits on the rendered studio, which has a lit backdrop behind the ring and can
 * be brighter than the pill. Light text on a light wash disappeared exactly
 * where the ring is brightest. A dark scrim only ever adds contrast.
 */
export function AgentBadge({
  available,
  count,
  tone = "light",
}: {
  available: boolean;
  count: number;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md ${
        dark ? "bg-black/45 ring-1 ring-white/10" : "bg-black/[0.055]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          available ? (dark ? "bg-emerald-400" : "bg-emerald-600") : "bg-stone-400"
        }`}
      />
      <span className={`text-[11px] tracking-tight ${dark ? "text-white/85" : "opacity-65"}`}>
        {available ? `${count} tools available to your agent` : "Agent tools idle"}
      </span>
    </div>
  );
}

/**
 * Each entry shows for a few seconds so the human can watch the agent work
 * without the feed becoming a wall of text during a fast sequence of edits.
 * Visibility is derived during render; the timer only marks what's been seen.
 */
export function ActivityFeed({ activity }: { activity: Activity }) {
  const [dismissedId, setDismissedId] = useState(0);
  const latest = activity[0];
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

/** The itemised estimate. Every line is derived, never a rounded guess. */
export function PriceBreakdown({
  lines,
  total,
}: {
  lines: { label: string; detail: string; pence: number }[];
  total: string;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">
          Estimate
        </span>
        <span className="font-serif text-[22px] tracking-tight">{total}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3 text-[11.5px]">
            <span className="opacity-55">{l.detail}</span>
            <span className="shrink-0 font-mono opacity-70">
              {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(l.pence / 100)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
