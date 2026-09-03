# Loomlace

**A local-first jewellery co-design studio, powered by WebMCP.**

You and your agent sculpt a parametric ring on the same live canvas, in real
time. Design data never leaves the browser until checkout.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI × Devpost).

---

## Run it

```bash
pnpm install
pnpm dev
```

Open the deployed URL in **ChatGPT's in-app browser**, or Chrome with
`chrome://flags/#enable-webmcp-testing`.

No agent handy? Open `http://localhost:3000/?mock=1` for a console-driven shim:

```js
await __mcp.call('apply_style_preset', { style: 'art-deco' })
await __mcp.call('place_stone', { type: 'sapphire', cut: 'oval', sizeMm: 7, x: 0.42 })
await __mcp.call('estimate_price')
__mcp.tools()
```

`NEXT_PUBLIC_STORE_URL` sets where `add_to_cart` hands off the design.
Unset, it falls back to the bundled `/order` page.

## Tool surface

14 tools registered on the page via `document.modelContext.registerTool`
(a 15th, `add_engraving`, appears once a setting is chosen). No iframes, no
declarative form API — ChatGPT's in-app browser supports neither.

| Tool | |
|---|---|
| `get_design_state` | read the live design |
| `set_band` | width, profile, metal |
| `place_stone` / `remove_stone` | add, move, restyle, or remove a stone |
| `set_setting_style` | solitaire / halo / pavé / bezel |
| `apply_style_preset` | art-deco / minimalist / vintage bundle |
| `set_size` | UK ring size — drives band radius and price |
| `set_view` | top / side / inside |
| `add_engraving` | text + placement, once a setting exists |
| `save_look` / `list_looks` / `restore_look` / `delete_look` | frozen design snapshots |
| `estimate_price` | itemised GBP breakdown |
| `add_to_cart` | hand off to the store |

## Key design decision

`DesignState` lives in a **module-level Zustand store, outside React**
(`lib/store.ts`). A tool's `execute` closure is built once at registration but
called minutes later — `getState()` inside it always reads live truth, so a
human can drag a stone mid-conversation and the agent sees it. Everything else
follows: `lib/` never imports React (same code path for human and agent),
registration is idempotent, unregistration uses `AbortSignal`, and tool
results are projected field-by-field (never `...spread`) so a look's
thumbnail never bloats the model's context.

## Layout

```
app/page.tsx           'use client' — the 3D studio; tool registration lives here
app/flat/page.tsx       same tool surface, SVG renderer
app/order/page.tsx      hand-off target: reads the design from the query string

lib/store.ts            single source of truth (Zustand)
lib/design.ts           design shape, bounds, wording
lib/tools.ts            WebMCP tool definitions — read this one first
lib/webmcp.ts           registration, teardown, activity log
lib/presets.ts          style presets
lib/price.ts            price formula
lib/looks.ts            saved looks
lib/persist.ts          IndexedDB

components/three/*      3D studio (camera, ring, drag)
lib/render3d/*          3D geometry, materials, lighting
components/RingCanvas.tsx  SVG renderer (no-WebGL fallback)
lib/render/*            SVG coordinate contract, palette, band geometry

components/Controls.tsx     human controls
components/AgentOverlay.tsx tools badge + activity feed
components/LooksStrip.tsx   saved looks strip
```

## Test prompts

A few from [`wiki/test-cases.md`](./wiki/test-cases.md) — say them to the
agent in the browser tab it controls:

- **Brief → design:** *"Design a vintage rose-gold engagement ring under
  £4,000, with an oval sapphire, engraving, and a comfortable band."* One
  sentence should become a coordinated design (~£2,300–£2,350).
- **Iterate to budget:** *"I want something showy — yellow gold, a big oval
  diamond, vintage look... Actually, keep it under £3,500."* Price scales
  roughly with the stone's diameter⁶, so the agent should shrink the stone
  in a couple of tries, not guess wildly.
- **Co-presence:** *"Apply the art-deco preset, then move the halo tighter."*
  Drag the centre stone yourself while it works, then: *"Now match the halo
  to where I put it."* The agent's next read should reflect where you
  actually put it.
- **Feature gating:** *"Can you engrave this for me?"* before choosing a
  setting should get a "not yet" — `add_engraving` isn't registered until
  `set_setting_style` (or a preset) picks one.
- **Compare looks:** *"Save this as it is. Now show me what minimalist would
  do to it... I liked the first one better — bring it back."* Note: presets
  aren't reversible on their own, so `save_look` first is the real undo.
- **Checkout:** *"I'm happy with this. What does it cost, and can you order
  it?"* `add_to_cart` is the one tool that leaves the browser, so the agent
  should confirm before firing it.

See the full file for more prompts and how prices are hand-verified.

## Licence

MIT — see [LICENSE](./LICENSE).
