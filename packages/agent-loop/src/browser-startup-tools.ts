/** Standalone host orchestration of the bundled plugin's browser preparation workflow. */
import type { ToolClient, ToolCall, ToolResult } from "./contracts";
import { discoverOrStartChrome } from "./browser-startup";
const name = "prepare_browser";
export class BrowserStartupTools implements ToolClient {
  private preparation?: Promise<ToolResult>;
  private lifecycle = new AbortController();
  constructor(
    private readonly inner: ToolClient,
    private readonly options: {
      directory: string;
      prepare?: (directory: string, signal?: AbortSignal) => Promise<unknown>;
    },
  ) {}
  getInstructions() {
    return this.inner.getInstructions?.() ?? "";
  }
  async listTools(signal?: AbortSignal) {
    const tools = await this.inner.listTools(signal);
    if (tools.some((tool) => tool.name === name))
      throw Error(
        "Browser preparation tool name conflicts with configured MCP tools",
      );
    return [
      ...tools,
      {
        name,
        description:
          "For a user-requested browser task when Chrome is unavailable: check the configured Chrome extension connection and, if needed, open the selected existing Chrome profile. Does not install or repair extensions or switch profiles/backends. After success, call cua.getState() to observe available browsers. At most one preparation attempt per run. This is a standalone host tool, not a CUA API method.",
        inputSchema: {
          type: "object",
          properties: { browser: { type: "string", enum: ["chrome"] } },
          required: ["browser"],
          additionalProperties: false,
        },
      },
    ];
  }
  async callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    if (call.name !== name) return this.inner.callTool(call, signal);
    signal = signal
      ? AbortSignal.any([signal, this.lifecycle.signal])
      : this.lifecycle.signal;
    signal.throwIfAborted();
    if (
      !call.arguments ||
      typeof call.arguments !== "object" ||
      Array.isArray(call.arguments) ||
      call.arguments.browser !== "chrome" ||
      Object.keys(call.arguments).some((key) => key !== "browser")
    )
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "prepare_browser accepts only {browser: 'chrome'}; deployment paths and profiles are host-configured.",
          },
        ],
      };
    const reused = this.preparation !== undefined;
    this.preparation ??= (async () => {
      try {
        const prepare =
          this.options.prepare ??
          ((directory, signal) =>
            discoverOrStartChrome(directory, undefined, 15000, signal));
        await prepare(this.options.directory, signal);
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                browser: "chrome",
                connected: true,
                next: "Call cua.getState() before selecting a browser. No page task has been completed.",
              }),
            },
          ],
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Browser preparation failed: ${error instanceof Error ? error.message : String(error)}. No additional launch attempt will be made in this run.`,
            },
          ],
        };
      }
    })();
    const result = await this.preparation;
    signal?.throwIfAborted();
    return reused
      ? {
          ...result,
          content: [
            {
              type: "text",
              text: "Reusing the earlier preparation result; no new launch or connection check was performed. Re-observe browser inventory.",
            },
            ...result.content,
          ],
        }
      : result;
  }
  async endTurn() {
    this.lifecycle.abort(new Error("Browser preparation turn ended"));
    try {
      await this.inner.endTurn?.();
    } finally {
      this.preparation = undefined;
      this.lifecycle = new AbortController();
    }
  }
  async close() {
    this.lifecycle.abort(new Error("Browser preparation client closed"));
    await this.inner.close();
  }
}
