"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RingCanvas } from "@/components/RingCanvas";
import { initialDesign, type DesignState } from "@/lib/design";
import { estimatePrice, formatGBP } from "@/lib/price";
import { METAL, STONE } from "@/lib/render/materials";

const SETTING_LABEL: Record<DesignState["setting"], string> = {
  solitaire: "Solitaire",
  halo: "Halo",
  pave: "Pavé",
  bezel: "Bezel",
};

const PROFILE_LABEL: Record<DesignState["band"]["profile"], string> = {
  flat: "flat",
  court: "court",
  "knife-edge": "knife-edge",
};

/**
 * The checkout hand-off.
 *
 * `add_to_cart` opens this with the whole design encoded in the query string,
 * so this page is a plain, stateless renderer of whatever it was handed — the
 * same shape a real storefront's custom-order page would receive. Point
 * NEXT_PUBLIC_STORE_URL elsewhere and this page simply stops being the target.
 *
 * This is the FIRST moment any design data leaves the canvas, which is worth
 * saying out loud on the page itself.
 */
export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderSummary />
    </Suspense>
  );
}

function OrderSummary() {
  const params = useSearchParams();
  const design = parseDesign(params.get("design"));
  const note = params.get("note");

  if (!design) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-serif text-3xl tracking-tight">Nothing to order yet</h1>
        <p className="text-sm leading-relaxed opacity-60">
          This page receives a design from the studio. Head back and ask your agent
          to add your ring to the cart when you&rsquo;re happy with it.
        </p>
        <Link href="/" className="mt-2 rounded-full bg-stone-900 px-5 py-2.5 text-[13px] text-stone-50">
          Back to the studio
        </Link>
      </main>
    );
  }

  const price = estimatePrice(design);
  const stone = design.stones[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 p-6 lg:flex-row lg:items-center lg:gap-14 lg:p-12">
      <div className="aspect-square w-full shrink-0 overflow-hidden rounded-2xl lg:w-[46%]">
        <RingCanvas design={design} onMoveStone={() => {}} />
      </div>

      <div className="flex flex-1 flex-col gap-7">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-45">
            Your order
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-none tracking-tight">
            A one-of-one ring
          </h1>
        </header>

        <dl className="flex flex-col divide-y divide-black/10 border-y border-black/10 text-[13px]">
          <Row label="Band">
            {design.band.widthMm.toFixed(1)}mm {PROFILE_LABEL[design.band.profile]} in{" "}
            {METAL[design.band.metal].label}
          </Row>
          <Row label="Setting">{SETTING_LABEL[design.setting]}</Row>
          {stone && (
            <Row label="Centre stone">
              {stone.sizeMm.toFixed(1)}mm {stone.cut} cut {STONE[stone.type].label}
            </Row>
          )}
          <Row label="Size">UK {design.sizeUk}</Row>
          {design.engraving && (
            <Row label="Engraving">
              &ldquo;{design.engraving.text}&rdquo; — {design.engraving.font},{" "}
              {design.engraving.placement}
            </Row>
          )}
          {note && <Row label="Note">{note}</Row>}
        </dl>

        <div>
          <ul className="flex flex-col gap-1.5">
            {price.lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-4 text-[12.5px]">
                <span className="opacity-60">{l.detail}</span>
                <span className="shrink-0 font-mono opacity-75">{formatGBP(l.pence)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-black/10 pt-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-45">
              Total
            </span>
            <span className="font-serif text-[30px] tracking-tight">
              {formatGBP(price.totalPence)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-full bg-stone-900 px-6 py-3 text-[13px] font-medium text-stone-50 transition hover:bg-stone-700">
            Confirm and pay {formatGBP(price.totalPence)}
          </button>
          <Link href="/" className="text-[13px] underline underline-offset-4 opacity-60 hover:opacity-100">
            Keep editing
          </Link>
        </div>

        <p className="text-[11px] leading-relaxed opacity-40">
          This is where the design first leaves your browser — everything up to this
          point happened locally. Checkout is a demonstration and takes no payment.
        </p>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-2.5">
      <dt className="shrink-0 opacity-45">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Never trust a query string — validate before rendering geometry from it. */
function parseDesign(raw: string | null): DesignState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DesignState>;
    if (!parsed || typeof parsed !== "object" || !parsed.band || !Array.isArray(parsed.stones)) {
      return null;
    }
    // Fill any missing field from the default, so an older or partial payload
    // renders something sensible instead of throwing inside the renderer.
    return { ...initialDesign, ...parsed, view: "top" };
  } catch {
    return null;
  }
}
