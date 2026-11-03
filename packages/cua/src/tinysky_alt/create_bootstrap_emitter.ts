import type * as T from "./types";
import type { NodeReplGlobals } from "../types";
type Options = {
  documentation: T.Documentation;
  target: T.DocumentationTarget;
};
type Writer = NonNullable<NonNullable<NodeReplGlobals["nodeRepl"]>["write"]>;
type RequestMeta = NonNullable<NodeReplGlobals["nodeRepl"]>["requestMeta"];

export function create_bootstrap_emitter(args: Options) {
  const browserDocuments = new Map<string, Promise<string>>();
  let coreText: string | undefined, coreRequestMeta: RequestMeta;
  const emittedBrowserDocuments = new Map<
    string,
    { text: string; request_meta: RequestMeta }
  >();
  let otherBrowserApisEmitted = false;
  let pending = Promise.resolve();
  function serialize(
    operation: (write: Writer, meta: RequestMeta) => Promise<void>,
  ): Promise<void> {
    const repl = (globalThis as NodeReplGlobals).nodeRepl;
    const write = repl?.write?.bind(repl);
    if (write === undefined) return Promise.resolve();
    // Capture host and request metadata at enqueue time, not when the previous emit finishes.
    const meta = repl?.requestMeta;
    const result = pending.then(() => operation(write, meta));
    pending = result.catch(() => {});
    return result;
  }
  return {
    async load_browser_documentation(browser: T.Browser) {
      const repl = (globalThis as NodeReplGlobals).nodeRepl;
      if (repl?.write !== undefined) {
        let document = browserDocuments.get(browser.browserId);
        if (document === undefined) {
          document = browser.documentation().catch((error: unknown) => {
            browserDocuments.delete(browser.browserId);
            throw error;
          });
          browserDocuments.set(browser.browserId, document!);
        }
        await document;
      }
    },
    emit(
      result: unknown = "",
      options?: T.ObservationOptions & { browser?: T.Browser },
    ) {
      return serialize(async (write, meta) => {
        const browser = options?.browser;
        let core = "",
          otherApis = "",
          browserText = "";
        if (coreText === undefined) {
          core = await args.documentation.read_core(args.target);
          const repl = (globalThis as NodeReplGlobals).nodeRepl;
          if (typeof repl?.emitAudio === "function")
            core = `${core}\n${await args.documentation.read("audio")}`;
        }
        if (browser !== undefined) {
          const document = await browserDocuments.get(browser.browserId);
          if (!otherBrowserApisEmitted)
            otherApis = await args.documentation.read("other-browser-apis");
          if (
            document !== undefined &&
            !emittedBrowserDocuments.has(browser.browserId)
          )
            browserText = document;
        }
        let state = "";
        if (options?.emit !== false)
          state = typeof result === "string" ? result : JSON.stringify(result);
        if (core !== "") {
          await write(core, "cua.core");
          coreRequestMeta = meta;
        }
        coreText ??= core;
        const combined = [otherApis, browserText]
          .filter((value) => value !== "")
          .join("\n\n");
        if (browser !== undefined && combined !== "") {
          await write(combined, `cua.browser.${browser.browserId}`);
          emittedBrowserDocuments.set(browser.browserId, {
            text: combined,
            request_meta: meta,
          });
        }
        if (browser !== undefined) otherBrowserApisEmitted = true;
        if (state !== "") await write(state, "cua.state");
      });
    },
    rewrite_documentation() {
      return serialize(async (write, meta) => {
        if (coreText && !(meta != null && meta === coreRequestMeta)) {
          await write(coreText, "cua.core");
          coreRequestMeta = meta;
        }
        for (const [browserId, document] of emittedBrowserDocuments) {
          if (meta != null && meta === document.request_meta) continue;
          await write(document.text, `cua.browser.${browserId}`);
          document.request_meta = meta;
        }
      });
    },
  };
}
