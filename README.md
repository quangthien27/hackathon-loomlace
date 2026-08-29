# Loomlace

**A local-first jewellery co-design studio, powered by WebMCP.**

You and your agent sculpt a parametric ring on the same live canvas. The design
redraws in real time as either of you changes it, and the design data never
leaves the browser until checkout.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI × Devpost).

---

## Status

**Day 1 — gate harness, passing.** The page currently shows an instrumentation
panel, not the product. Its job was to prove the WebMCP pipeline works before
any renderer is written. Verified against real `document.modelContext` on
Chrome 152: tool discovery, dynamic registration, `toolchange`, teardown and
re-registration via `AbortSignal`, and live-state reads under concurrent human
editing. The parametric ring lands next.

### Gotcha worth knowing

Chrome 152 diverges from the spec IDL on `executeTool`. The IDL declares
`executeTool(RegisteredTool tool, optional object inputObject)`, but Chrome
requires the input as a **JSON string** and makes both arguments mandatory:

```js
await mc.executeTool(tool, JSON.stringify({ widthMm: 3.4 }))  // ✅
await mc.executeTool(tool, { widthMm: 3.4 })                  // ❌ "Failed to parse input arguments"
```

The result comes back JSON-serialised as a `DOMString`. This affects callers
only — tool definitions are unaffected. The `?mock=1` shim mirrors the shipped
behaviour rather than the specified one.

## Run it

```bash
pnpm install
pnpm dev
```

To exercise the tools **without** ChatGPT's browser or the Chrome flag, open
<http://localhost:3000/?mock=1>. That installs a local shim for
`document.modelContext` implementing the slice of the spec this app uses, and
exposes a console driver:

```js
await __mcp.call('set_setting_style', { setting: 'halo' })
await __mcp.call('set_band', { widthMm: 3.4, metal: 'rose' })
await __mcp.call('get_design_state')
__mcp.tools()
```

For the real API, open the deployed URL in ChatGPT's in-app browser, or in
Chrome with `chrome://flags/#enable-webmcp-testing` enabled.

## How WebMCP is used

Tools are registered **imperatively on the top-level page** via
`document.modelContext.registerTool` — no iframes, no declarative form API,
since ChatGPT's browser supports neither.

| Tool | |
|---|---|
| `get_design_state` | read the live design (`readOnlyHint`) |
| `set_band` | width, profile, metal |
| `set_setting_style` | solitaire / halo / pavé / bezel |
| `set_view` | top / side / inside |
| `add_engraving` | **registered only after a setting is chosen** |

### The one architectural decision that matters

`DesignState` lives in a **module-level Zustand store, outside the React tree**
(`lib/store.ts`).

A tool's `execute` closure is built once at registration and called minutes
later. If state lived in `useReducer`, `get_design_state` would return whatever
the ring looked like when the effect last ran — so the agent would read a
pre-drag design and build on geometry that no longer exists. `getState()` inside
`execute` always reads live truth, which is exactly what lets a human drag a
stone mid-conversation and have the agent see it.

`lib/render/*` and `lib/price.ts` are plain TypeScript with no React imports, so
the agent path and the human path call literally the same functions.

Unregistration is by `AbortSignal` — the spec has no `unregisterTool()`.

## Layout

```
app/page.tsx              'use client' — tool registration lives here
lib/design.ts             DesignState types, clamps, initial design
lib/store.ts              Zustand store — single source of truth
lib/tools.ts              WebMCP tool definitions
lib/webmcp.ts             idempotent registration, AbortSignal teardown
lib/mock-model-context.ts local dev shim (?mock=1)
types/webmcp.d.ts         ambient types mirroring the spec IDL
```

## Licence

MIT — see [LICENSE](./LICENSE).
