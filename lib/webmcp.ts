/**
 * WebMCP registration plumbing.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Registration is IDEMPOTENT by tool name. React Strict Mode double-invokes
 *    effects in dev; without this you chase a phantom double-registration.
 * 2. Nothing here runs during SSR, and every call is feature-detected — the
 *    judging browser implements only a subset of the spec.
 */

type Listener = () => void;

const controllers = new Map<string, AbortController>();
const listeners = new Set<Listener>();

/**
 * Cached snapshot. useSyncExternalStore compares getSnapshot() by identity, so
 * returning a fresh array on every call is an infinite render loop. Recompute
 * once per actual registry change instead.
 */
let namesSnapshot: string[] = [];

function emit() {
  namesSnapshot = [...controllers.keys()].sort();
  for (const l of listeners) l();
}

export function modelContext(): ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  const mc = document.modelContext;
  return typeof mc?.registerTool === "function" ? mc : undefined;
}

export const isWebMcpAvailable = () => modelContext() !== undefined;

/** Register a tool. Safe to call repeatedly — later calls for a live name no-op. */
export function registerTool(tool: ModelContextTool): void {
  if (controllers.has(tool.name)) return;
  const mc = modelContext();
  if (!mc) return;

  const ac = new AbortController();
  controllers.set(tool.name, ac);
  emit();

  Promise.resolve(mc.registerTool(tool, { signal: ac.signal })).catch((err) => {
    console.error(`[loomlace] registerTool(${tool.name}) failed`, err);
    controllers.delete(tool.name);
    emit();
  });
}

/** Unregistration happens via the AbortSignal — the spec has no unregisterTool(). */
export function unregisterTool(name: string): void {
  const ac = controllers.get(name);
  if (!ac) return;
  ac.abort();
  controllers.delete(name);
  emit();
}

export function registerTools(tools: ModelContextTool[]): void {
  for (const t of tools) registerTool(t);
}

/** Names this page believes are currently registered (our own bookkeeping). */
export const registeredNames = (): string[] => namesSnapshot;

export function subscribeRegistry(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** What the browser itself reports back — the real proof, used by the gate UI. */
export async function browserReportedTools(): Promise<string[]> {
  const mc = modelContext();
  if (!mc || typeof mc.getTools !== "function") return [];
  try {
    const tools = await mc.getTools();
    return tools.map((t) => t.name).sort();
  } catch (err) {
    console.error("[loomlace] getTools failed", err);
    return [];
  }
}
