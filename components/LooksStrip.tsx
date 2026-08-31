"use client";

import type { DesignState } from "@/lib/design";
import { METAL } from "@/lib/render/materials";
import { MAX_LOOKS, saveLook, restoreLook, useLooks, type Look } from "@/lib/looks";

/**
 * Whether a save is in flight, read from the store rather than held per
 * component. The canvas strip and the sidebar panel are both on screen at once,
 * so a flag owned by either one would leave the other still offering to save
 * the same ring mid-capture. `saveLook` coalesces such a call anyway; this is
 * what makes the button say so.
 */
const useSaving = () => useLooks((s) => s.saving);

/**
 * The saved looks, down the side of the studio.
 *
 * A strip of pictures rather than a list of names, because the thing being
 * compared is a ring: "the warmer one" is instant as a thumbnail and nearly
 * useless as a line of text. This is the half of the feature the agent can
 * never see — its tools return receipts and words — and that asymmetry is the
 * point, not a shortfall. The human compares by eye; the model compares by
 * description and price.
 *
 * Over the ring rather than only in the sidebar because comparing is a visual
 * act: the tile you are about to click wants to be next to the thing it would
 * replace. The sidebar carries the same looks as a panel (see LooksPanel) for
 * anyone working down the controls rather than looking at the render.
 *
 * `tone` matches AgentBadge: the 3D studio is dark, /flat is light.
 */
export function LooksStrip({
  design,
  tone = "light",
}: {
  design: DesignState;
  tone?: "light" | "dark";
}) {
  const looks = useLooks((s) => s.looks);
  const remove = useLooks((s) => s.remove);
  const saving = useSaving();

  const dark = tone === "dark";
  const chrome = dark
    ? "bg-black/60 ring-1 ring-white/10 text-white/85"
    : "bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10";

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
      <button
        type="button"
        onClick={() => void saveLook()}
        disabled={saving}
        title={`Keep this ring so you can come back to it (${looks.length}/${MAX_LOOKS} saved)`}
        className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] tracking-tight backdrop-blur-md transition ${chrome} ${
          saving ? "opacity-60" : dark ? "hover:bg-black/75" : "hover:bg-black/[0.06]"
        }`}
      >
        <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 opacity-70">
          <path
            d="M2.5 1.5h5.6L10 3.4v7.1H2.5z M4.4 1.5v3h3.4v-3 M4.4 10.5v-3h3.2v3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        {saving ? "Saving…" : "Save look"}
      </button>

      {looks.length > 0 && (
        <ul className="pointer-events-auto flex flex-col gap-2">
          {looks.map((look) => (
            <li key={look.n} className="group relative">
              <button
                type="button"
                onClick={() => restoreLook(look.n)}
                title={`Restore look ${look.n} — ${look.label}`}
                className={`block h-16 w-16 overflow-hidden rounded-xl backdrop-blur-md transition ${
                  // The design on screen IS this look's object until the next
                  // edit replaces it, so reference equality is an exact answer
                  // to "am I looking at this one?" — no field-by-field compare.
                  design === look.design
                    ? dark
                      ? "ring-2 ring-white/85"
                      : "ring-2 ring-stone-900 dark:ring-stone-100"
                    : dark
                      ? "ring-1 ring-white/15 hover:ring-white/50"
                      : "ring-1 ring-black/10 hover:ring-black/35"
                }`}
              >
                <Thumb look={look} />
                <span className="sr-only">
                  Restore look {look.n}: {look.label}
                </span>
              </button>

              <span
                className={`pointer-events-none absolute left-1 top-1 rounded-md px-1.5 py-px font-mono text-[9px] leading-[1.4] ${
                  dark ? "bg-black/65 text-white/80" : "bg-black/60 text-white/90"
                }`}
              >
                {look.n}
              </span>

              {/* Only on hover: six delete crosses sitting permanently over six
                  photographs of a ring is a lot of chrome for the rarest action
                  in the strip. */}
              <button
                type="button"
                onClick={() => remove(look.n)}
                title={`Delete look ${look.n}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-white/90 ring-1 ring-white/25 transition hover:bg-stone-700 group-hover:flex"
              >
                <svg viewBox="0 0 8 8" aria-hidden className="h-2 w-2">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span className="sr-only">Delete look {look.n}</span>
              </button>

              {/* The label reads on hover rather than under every tile — six
                  captions stacked down the edge of the studio compete with the
                  ring for exactly the attention the ring should be winning. */}
              <span
                className={`pointer-events-none absolute right-[4.5rem] top-1/2 hidden max-w-[11rem] -translate-y-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] backdrop-blur-md group-hover:block ${chrome}`}
              >
                {look.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The same looks, as a panel in the controls sidebar.
 *
 * Not a duplicate for its own sake. Every other thing the agent can do has a
 * control in this panel — that parity is the app's whole argument — and until
 * this existed, saving and restoring were the only capabilities a human had to
 * go and find floating over the render to reach. Someone working down the
 * sidebar, or on a phone where the canvas is a short strip at the top, should
 * not have to.
 *
 * Both surfaces drive the same store functions, so there is no question of
 * which one is authoritative: neither is.
 */
export function LooksPanel() {
  const looks = useLooks((s) => s.looks);
  const remove = useLooks((s) => s.remove);
  const saving = useSaving();

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">
          Saved looks
        </h3>
        <span className="font-mono text-[11px] opacity-55">
          {looks.length}/{MAX_LOOKS}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void saveLook()}
        disabled={saving}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] transition hover:border-black/30 hover:bg-black/[0.03] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save this look"}
      </button>

      {looks.length === 0 ? (
        <p className="text-[11px] leading-snug opacity-40">
          Keep a ring you like before you change it — you can put any saved look back with one
          click, and so can your agent.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {looks.map((look) => (
            <li key={look.n} className="group relative">
              <button
                type="button"
                onClick={() => restoreLook(look.n)}
                title={`Restore look ${look.n} — ${look.label}`}
                className="block aspect-square w-full overflow-hidden rounded-lg ring-1 ring-black/10 transition hover:ring-black/35"
              >
                <Thumb look={look} />
                <span className="sr-only">
                  Restore look {look.n}: {look.label}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(look.n)}
                title={`Delete look ${look.n}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-white/90 ring-1 ring-white/25 transition hover:bg-stone-700 group-hover:flex"
              >
                <svg viewBox="0 0 8 8" aria-hidden className="h-2 w-2">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span className="sr-only">Delete look {look.n}</span>
              </button>
              {/* The label reads here rather than on hover: the sidebar has the
                  width for it, and this is the surface someone uses when they
                  are reading rather than looking. */}
              <span className="mt-1 block truncate text-[10px] leading-tight opacity-45">
                {look.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The photograph, or a stand-in for it.
 *
 * `thumb` is null whenever there was no WebGL studio to photograph — /flat, or
 * a browser without WebGL. Rather than drop the strip on those routes, the tile
 * falls back to the look's metal as a gradient: it still distinguishes a rose
 * gold variation from a platinum one at a glance, which is most of what the
 * strip is for, and saving/restoring works identically.
 */
function Thumb({ look }: { look: Look }) {
  if (look.thumb) {
    // A plain <img>: next/image exists to optimise and lazily fetch a remote
    // asset, and this is a data: URL already in memory. There is nothing to
    // optimise and nothing to fetch.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={look.thumb} alt="" className="h-full w-full object-cover" />
    );
  }
  const metal = METAL[look.design.band.metal];
  return (
    <span
      className="flex h-full w-full items-end justify-start p-1.5 text-[9px] leading-tight text-black/55"
      style={{
        background: `linear-gradient(150deg, ${metal.highlight} 0%, ${metal.light} 30%, ${metal.base} 65%, ${metal.shade} 100%)`,
      }}
    >
      {look.design.setting}
    </span>
  );
}
