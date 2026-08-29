/**
 * Ambient types for the WebMCP API.
 *
 * Mirrors the WebIDL in the W3C WebML CG spec (webmachinelearning.github.io/webmcp).
 * Deliberately permissive: the judging browser (ChatGPT in-app) implements a
 * subset, so nothing here is assumed to exist at runtime — always feature-detect
 * with `typeof document.modelContext?.registerTool === 'function'`.
 */

interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

interface ToolExecuteCallbackOptions {
  signal: AbortSignal;
}

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    options?: ToolExecuteCallbackOptions,
  ) => Promise<unknown>;
}

interface ModelContextRegisterToolOptions {
  exposedTo?: string[];
  signal?: AbortSignal;
}

interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  origin: string;
  annotations?: ToolAnnotations;
}

interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): Promise<void>;
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

interface Document {
  readonly modelContext?: ModelContext;
}
