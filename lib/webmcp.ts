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

const controllers = new Map<string, { ac: AbortController; tool: ModelContextTool }>();
const listeners = new Set<Listener>();

/**
 * A registered tool as the badge's panel shows it.
 *
 * Derived from the tool that was actually registered, never written out a
 * second time by hand. A hard-coded list beside the badge would be a list of
 * the tools we BELIEVE are live, and the entire reason to show it is that it is
 * the real surface — including `add_engraving`, which comes and goes.
 */
export type ToolCard = { name: string; summary: string; readOnly: boolean };

/**
 * The first sentence of the description the agent itself receives.
 *
 * Deliberately not a separate human-facing blurb. These descriptions are the
 * prompt — showing the real first line is the honest thing, and it keeps the
 * panel from drifting away from what the model is told.
 */
function summarize(description: string): string {
  const stop = description.indexOf(". ");
  return stop === -1 ? description : description.slice(0, stop + 1);
}

/**
 * Cached snapshot. useSyncExternalStore compares getSnapshot() by identity, so
 * returning a fresh array on every call is an infinite render loop. Recompute
 * once per actual registry change instead.
 */
let toolsSnapshot: ToolCard[] = [];

function emit() {
  toolsSnapshot = [...controllers.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, { tool }]) => ({
      name,
      summary: summarize(tool.description),
      readOnly: tool.annotations?.readOnlyHint === true,
    }));
  for (const l of listeners) l();
}

export function modelContext(): ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  const mc = document.modelContext;
  return typeof mc?.registerTool === "function" ? mc : undefined;
}

export const isWebMcpAvailable = () => modelContext() !== undefined;

/**
 * A running log of what the agent has done, so the human can see it happen.
 *
 * Wired here rather than inside each tool: registerTool wraps every execute()
 * on the way past, so the log can never drift out of sync with the actual tool
 * surface, and tool authors don't have to remember to log.
 */
export type Activity = { id: number; tool: string; summary: string; at: number };

const MAX_ACTIVITY = 24;
let activity: Activity[] = [];
let activitySeq = 0;
const activityListeners = new Set<Listener>();

export const getActivity = (): Activity[] => activity;

export function subscribeActivity(l: Listener): () => void {
  activityListeners.add(l);
  return () => activityListeners.delete(l);
}

function pushActivity(tool: string, summary: string) {
  activity = [{ id: ++activitySeq, tool, summary, at: Date.now() }, ...activity].slice(
    0,
    MAX_ACTIVITY,
  );
  for (const l of activityListeners) l();
}

function withLogging(tool: ModelContextTool): ModelContextTool {
  return {
    ...tool,
    execute: async (input, options) => {
      const result = await tool.execute(input, options);
      const summary =
        result && typeof result === "object" && "summary" in result
          ? String((result as { summary: unknown }).summary)
          : "done";
      pushActivity(tool.name, summary);
      return result;
    },
  };
}

/** Register a tool. Safe to call repeatedly — later calls for a live name no-op. */
export function registerTool(tool: ModelContextTool): void {
  if (controllers.has(tool.name)) return;
  const mc = modelContext();
  if (!mc) return;

  const ac = new AbortController();
  controllers.set(tool.name, { ac, tool });
  emit();

  Promise.resolve(mc.registerTool(withLogging(tool), { signal: ac.signal })).catch((err) => {
    console.error(`[loomlace] registerTool(${tool.name}) failed`, err);
    controllers.delete(tool.name);
    emit();
  });
}

/** Unregistration happens via the AbortSignal — the spec has no unregisterTool(). */
export function unregisterTool(name: string): void {
  const live = controllers.get(name);
  if (!live) return;
  live.ac.abort();
  controllers.delete(name);
  emit();
}

export function registerTools(tools: ModelContextTool[]): void {
  for (const t of tools) registerTool(t);
}

/** What this page believes is currently registered (our own bookkeeping). */
export const registeredTools = (): ToolCard[] => toolsSnapshot;

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
