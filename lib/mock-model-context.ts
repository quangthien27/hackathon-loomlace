/**
 * Local development shim for `document.modelContext`.
 *
 * Enabled with ?mock=1. Lets you exercise the whole tool pipeline without
 * ChatGPT's browser or chrome://flags/#enable-webmcp-testing. It implements
 * exactly the spec surface Loomlace uses — registerTool with an AbortSignal,
 * getTools, and the toolchange event — so anything that works here is a fair
 * test of the registration logic (though NOT of the judging browser itself;
 * only the real gate proves that).
 *
 * Once installed, drive tools from the devtools console:
 *   await __mcp.call('set_band', { widthMm: 3.4, metal: 'rose' })
 *   __mcp.tools()
 */

type Entry = { tool: ModelContextTool };

export function installMockModelContext(): boolean {
  if (typeof window === "undefined") return false;
  if (document.modelContext) return false;
  if (new URLSearchParams(window.location.search).get("mock") !== "1") return false;

  const entries = new Map<string, Entry>();
  const target = new EventTarget();

  const mock = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    ontoolchange: null,

    async registerTool(
      tool: ModelContextTool,
      options?: ModelContextRegisterToolOptions,
    ): Promise<void> {
      entries.set(tool.name, { tool });
      options?.signal?.addEventListener("abort", () => {
        entries.delete(tool.name);
        target.dispatchEvent(new Event("toolchange"));
      });
      target.dispatchEvent(new Event("toolchange"));
    },

    async getTools(): Promise<RegisteredTool[]> {
      return [...entries.values()].map(({ tool }) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        origin: window.location.origin,
        annotations: tool.annotations,
      }));
    },
  };

  Object.defineProperty(document, "modelContext", {
    value: mock,
    configurable: true,
  });

  Object.defineProperty(window, "__mcp", {
    value: {
      tools: () => [...entries.keys()].sort(),
      call: async (name: string, input: Record<string, unknown> = {}) => {
        const entry = entries.get(name);
        if (!entry) throw new Error(`no such tool: ${name}`);
        return entry.tool.execute(input, { signal: new AbortController().signal });
      },
    },
    configurable: true,
  });

  console.log("[loomlace] mock modelContext installed — try __mcp.tools()");
  return true;
}
