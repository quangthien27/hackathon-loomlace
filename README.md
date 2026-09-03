# Loomlace

**A local-first jewellery co-design studio, powered by WebMCP.**

You and your agent sculpt a parametric ring on the same live canvas. The design
redraws in real time as either of you changes it, and the design data never
leaves the browser until checkout.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI × Devpost).

---

## Run it

```bash
pnpm install
pnpm dev
```

Open the deployed URL in **ChatGPT's in-app browser**, or in Chrome with
`chrome://flags/#enable-webmcp-testing` enabled.

To exercise the tools without either, open <http://localhost:3000/?mock=1>. That
installs a local shim for `document.modelContext` and exposes a console driver:

```js
await __mcp.call('apply_style_preset', { style: 'art-deco' })
await __mcp.call('place_stone', { type: 'sapphire', cut: 'oval', sizeMm: 7, x: 0.42 })
await __mcp.call('estimate_price')
__mcp.tools()
```

### Configuration

`NEXT_PUBLIC_STORE_URL` — where `add_to_cart` hands the finished design off for
checkout. Unset, it falls back to `/order`, a self-contained page in this repo
that reads the design straight out of the query string, so the hand-off works
end to end with no configuration at all.

## The tool surface

Fourteen tools registered imperatively on the top-level page via
`document.modelContext.registerTool`, plus a fifteenth that appears only once
the design is far enough along to need it. No iframes and no declarative form
API, since ChatGPT's in-app browser supports neither.

**The design**

| Tool | |
|---|---|
| `get_design_state` | read the live design (`readOnlyHint`) |
| `set_band` | width in mm, cross-section profile, metal |
| `place_stone` | add or move/restyle a stone; returns the new stone's id |
| `remove_stone` | remove by id; lists valid ids if the id is wrong |
| `set_setting_style` | solitaire / halo / pavé / bezel |
| `apply_style_preset` | art-deco / minimalist / vintage → a coordinated bundle |
| `set_size` | UK ring size — a real dimension, not a label: it drives the band radius, both renderers and the metal price |
| `set_view` | top / side / inside — moves the camera, changes nothing about the ring |
| `add_engraving` | **registered only once a setting is chosen** |

**Saved looks** — the design's undo, in the only shape that suits a parametric
object with no linear edit history. A look is a whole frozen design, so the
agent can offer a real choice instead of a one-way edit.

| Tool | |
|---|---|
| `save_look` | freeze the ring as it stands; returns the number to restore it by |
| `list_looks` | every live look, described and priced (`readOnlyHint`) |
| `restore_look` | put one back on the canvas |
| `delete_look` | forget one |

**Money**

| Tool | |
|---|---|
| `estimate_price` | itemised GBP breakdown (`readOnlyHint`) |
| `add_to_cart` | hands off to the store — the consequential one |

## The one architectural decision that matters

`DesignState` lives in a **module-level Zustand store, outside the React tree**
(`lib/store.ts`).

A tool's `execute` closure is built once at registration and called minutes
later. If state lived in `useReducer`, `get_design_state` would return whatever
the ring looked like when the effect last ran — so the agent would read a
pre-drag design and build on geometry that no longer exists. `getState()` inside
`execute` always reads live truth, which is exactly what lets a human drag a
stone mid-conversation and have the agent see it.

Everything else follows from that:

- **Nothing under `lib/` imports React** — not the geometry, not either
  renderer's maths, not the price formula. `grep -rl 'from "react"' lib/`
  returns nothing, and that is the check. The agent path and the human path
  call literally the same functions rather than two implementations that drift.
- Registration is **idempotent by tool name**, so Strict Mode's double-invoke is
  a no-op.
- Unregistration is by **`AbortSignal`** — the spec has no `unregisterTool()`.
- `registerTool` wraps every `execute` on the way past to feed the on-screen
  activity log, so what the human sees can't drift from the real tool surface.
  Refusals are logged with the reason they were refused, not as a bare "done" —
  the agent being told no and correcting itself is the most informative thing
  the log ever has to show, and it was the one thing it used to hide.
- Handlers clamp their inputs and return the **resulting state** with a
  human-readable summary, so an agent can chain edits without a
  `get_design_state` round trip between each one.
- Tool results are **projected field by field, never spread**. A saved look
  carries a base64 JPEG thumbnail for the human's strip on the canvas;
  `...look` would push tens of kilobytes of unreadable image into the model's
  context on every `list_looks`. What the human can see and what the model is
  told are two different payloads on purpose.

The store always holds the true, final design. The *canvas* eases towards it
over ~400ms (`components/useEasedDesign.ts`) so an agent's edit redraws legibly
instead of snapping — but an agent reading a half-finished tween would be worse
than no animation at all, so the easing never touches the truth.

## Gotcha: Chrome diverges from the spec on `executeTool`

The IDL declares `executeTool(RegisteredTool tool, optional object inputObject)`.
Chrome 152 requires the input as a **JSON string** and makes both arguments
mandatory:

```js
await mc.executeTool(tool, JSON.stringify({ widthMm: 3.4 }))  // ✅
await mc.executeTool(tool, { widthMm: 3.4 })                  // ❌ "Failed to parse input arguments"
```

The result comes back JSON-serialised as a `DOMString`. This affects callers
only — tool definitions are unaffected. The `?mock=1` shim mirrors the shipped
behaviour rather than the specified one, so local testing stays a fair rehearsal.

## Gotcha: `inputSchema` is advertised, not enforced

Chrome shows a tool's `inputSchema` to the model but does not validate against
it. A call with the wrong property name, or a value outside a declared enum,
reaches `execute` as plain `undefined` — it is not rejected before it gets
there.

That is not theoretical. `set_setting_style` declares one required property,
`setting`, with a four-value enum. Calling it as `{ style: "solitaire" }` — a
plausible slip, since the tool is *named* `set_setting_style` — wrote
`undefined` into the store and turned the price into `£NaN`. Nothing warned.

So every tool re-checks its own arguments at the boundary (`enumArg` and `fail`
in `lib/tools.ts`) and returns a message naming the field and its legal values,
which is something a model can actually recover from:

```
{ ok: false, error: "\"setting\" must be one of: solitaire, halo, pave, bezel." }
```

Treat `inputSchema` as documentation for the model, and validate as if the input
came off the network — because in effect it did.

## Layout

```
app/page.tsx                  'use client' — the 3D studio; tool registration lives here
app/flat/page.tsx             the same page over the SVG renderer, same tool surface
app/order/page.tsx            the hand-off target: reads the design out of the query string

lib/store.ts                  Zustand store — the single source of truth
lib/design.ts                 the design shape, its bounds, and the words for it
lib/tools.ts                  WebMCP tool definitions — read this one first
lib/webmcp.ts                 idempotent registration, AbortSignal teardown, activity log
lib/mock-model-context.ts     local dev shim (?mock=1)
types/webmcp.d.ts             ambient types mirroring the spec IDL

lib/presets.ts                style presets as functions of the current design
lib/price.ts                  deterministic, auditable price formula
lib/looks.ts                  saved looks — frozen designs plus a thumbnail
lib/capture.ts                photographs the live studio canvas
lib/order.ts                  the one hand-off URL builder, shared by tool and button
lib/describe.ts               the design as a sentence, for screen readers
lib/persist.ts                IndexedDB, with validation on load
lib/animate.ts                pure interpolation helpers
lib/webgl.ts                  the capability check that picks a renderer

components/three/RingScene3D.tsx   the studio: camera rig, turntable, backdrop
components/three/Ring3D.tsx        the ring itself
components/three/useStoneDrag.ts   drag-to-move, in 3D
lib/render3d/scene.ts              where every stone and bead sits, in millimetres
lib/render3d/geometry.ts           band and gem meshes, built facet by facet
lib/render3d/materials3d.ts        metal and gem shading
lib/render3d/studio.ts             lights and backdrop sweeps

components/RingCanvas.tsx     the SVG renderer — the no-WebGL fallback
components/stones/*           hand-authored facet art, one per cut
components/settings/*         claws, halo, pavé, bezel metalwork
components/SvgDefs.tsx        gradients generated from the palette tokens
lib/render/contract.ts        the SVG coordinate contract — read before any geometry
lib/render/materials.ts       the palette
lib/render/band.ts            band geometry per view

components/Controls.tsx       human controls — same store actions as the tools
components/AgentOverlay.tsx   the tools badge and the activity feed
components/LooksStrip.tsx     saved looks, down the side of the canvas
components/useEasedDesign.ts  rAF easing, render-only
```

## Licence

MIT — see [LICENSE](./LICENSE).
