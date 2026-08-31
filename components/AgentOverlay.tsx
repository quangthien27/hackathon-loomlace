"use client";

import { useEffect, useRef, useState } from "react";
import type { getActivity, ToolCard } from "@/lib/webmcp";

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
  tools,
  tone = "light",
}: {
  available: boolean;
  tools: ToolCard[];
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const [open, setOpen] = useState(false);

  // Names present when the panel was opened. Anything that arrives after that
  // is highlighted, which is the point of the whole panel: pick a setting with
  // it open and you WATCH add_engraving register itself. Seeded on open rather
  // than on mount, because at mount every tool is new and the flash would just
  // be page load.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<readonly string[]>([]);

  // Closing clears the highlight from the handler rather than from the effect
  // below: an effect that setStates on every close is a cascading render, and
  // there are only three ways to close.
  const close = () => {
    setOpen(false);
    setFresh([]);
  };

  useEffect(() => {
    if (!open) {
      seen.current = null;
      return;
    }
    const names = tools.map((t) => t.name);
    if (seen.current === null) {
      seen.current = new Set(names);
      return;
    }
    const added = names.filter((n) => !seen.current!.has(n));
    seen.current = new Set(names);
    if (!added.length) return;
    setFresh(added);
    const timer = setTimeout(() => setFresh([]), 3200);
    return () => clearTimeout(timer);
  }, [open, tools]);

  // Escape closes it, and so does the pill. Clicking elsewhere does NOT, which
  // is a deliberate break from how a popover normally behaves: the whole point
  // of this panel is to watch the tool list change while you use the studio,
  // and dismiss-on-outside-click would shut it on the very click that makes
  // `add_engraving` appear.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const pill = dark
    ? "bg-black/60 ring-1 ring-white/10 text-white/85"
    : "bg-black/[0.055] ring-1 ring-black/5";
  // Heavier than the pill. It carries a paragraph of small text rather than one
  // line, and it sits over whichever part of the studio happens to be brightest.
  const panel = dark
    ? "bg-black/70 ring-1 ring-white/10 text-white/85"
    // Opaque --surface rather than a white wash. The light tone is used on
    // /flat, which follows prefers-color-scheme — a white panel there put dark
    // theme's near-white text on a near-white ground and the list vanished.
    // The token flips with the theme; the text keeps inheriting.
    : "bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10";

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 sm:left-5 sm:top-5"
    >
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={!available}
        aria-expanded={open}
        aria-label={available ? "Show the tools registered with your agent" : undefined}
        className={`pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md transition ${pill} ${
          available ? (dark ? "hover:bg-black/75" : "hover:bg-black/10") : "cursor-default"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            available ? (dark ? "bg-emerald-400" : "bg-emerald-600") : "bg-stone-400"
          }`}
        />
        <span className={`text-[11px] tracking-tight ${dark ? "" : "opacity-65"}`}>
          {available ? `${tools.length} tools available to your agent` : "Agent tools idle"}
        </span>
        {available && (
          <svg
            viewBox="0 0 10 6"
            aria-hidden
            className={`h-[6px] w-[10px] shrink-0 transition-transform ${open ? "rotate-180" : ""} ${
              dark ? "opacity-60" : "opacity-45"
            }`}
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>

      {open && available && (
        <div
          className={`pointer-events-auto max-h-[min(24rem,55vh)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl p-1 shadow-xl backdrop-blur-md ${panel}`}
        >
          <ul className="flex flex-col">
            {tools.map((t) => (
              <li
                key={t.name}
                className={`rounded-lg px-2.5 py-2 transition ${
                  fresh.includes(t.name)
                    ? dark
                      ? "bg-emerald-400/15 ring-1 ring-emerald-400/40"
                      : "bg-emerald-500/10 ring-1 ring-emerald-600/30"
                    : ""
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <code className="font-mono text-[11px] tracking-tight">{t.name}</code>
                  <span
                    className={`ml-auto shrink-0 text-[9px] uppercase tracking-[0.1em] ${
                      dark ? "opacity-45" : "opacity-40"
                    }`}
                  >
                    {t.readOnly ? "reads" : "edits"}
                  </span>
                </div>
                <p className={`mt-0.5 text-[11px] leading-snug ${dark ? "opacity-60" : "opacity-55"}`}>
                  {t.summary}
                </p>
              </li>
            ))}
          </ul>
          <p
            className={`border-t px-2.5 pb-1.5 pt-2 text-[10.5px] leading-snug ${
              dark ? "border-white/10 opacity-50" : "border-black/10 opacity-45"
            }`}
          >
            Registered on <code className="font-mono">document.modelContext</code>. The list is
            live — <code className="font-mono">add_engraving</code> registers itself once a
            setting is chosen, and unregisters if you clear it.
          </p>
        </div>
      )}
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
        {/* Keyed by position, not by label: two stones of the same type and cut
            produce two lines called "Diamond (round)", and React drops one of
            them for a duplicate key. A price line has no identity beyond where
            it sits in a list that is rebuilt from the design on every render. */}
        {lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 text-[11.5px]">
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
