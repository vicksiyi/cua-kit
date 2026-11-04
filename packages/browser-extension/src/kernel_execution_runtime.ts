import type { KernelControlClient } from "./kernel_control_client";
export interface ChatGptPagePolicy { allow_all_chatgpt_pages: boolean; allowed_pages: string[] }
function normalizeInstalledPath(path: string) {
  const localized = /^\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*(\/.*)$/i.exec(path)?.[1];
  return localized?.toLowerCase() === "/work/extension/installed" ? localized : path;
}
/** Original EU/IU/Df: protected ChatGPT hosts require HTTPS and an allowed page. */
export function matchesChatGptPagePolicy(url: URL, policy: ChatGptPagePolicy) {
  if (policy.allow_all_chatgpt_pages) return true;
  if (url.protocol !== "https:") return false;
  const path = normalizeInstalledPath(url.pathname.replace(/\/$/, ""));
  return policy.allowed_pages.some(page => {
    try {
      const allowed = new URL(page);
      return url.origin === allowed.origin && path === normalizeInstalledPath(allowed.pathname.replace(/\/$/, ""));
    } catch { return false; }
  });
}
export async function assertKernelBrowserUrlAllowed(value: string, getPolicy: () => Promise<ChatGptPagePolicy>) {
  const url = new URL(value);
  const hostname = (url.protocol === "blob:" && url.origin !== "null" ? new URL(url.origin) : url).hostname.replace(/\.$/, "");
  if (["chatgpt.com", "chat.com"].some(domain => hostname === domain || hostname.endsWith(`.${domain}`)) && !matchesChatGptPagePolicy(url, await getPolicy()))
    throw new Error("The standalone Chrome extension cannot access this ChatGPT page.");
}
export class AfterSubmittedCodeHookTimeoutError extends Error {
  constructor() {
    super("Post-execution hook timed out; this task's JavaScript kernel will be reset.");
    this.name = "AfterSubmittedCodeHookTimeoutError";
  }
}
export interface KernelExecutionOutput { contentItems: unknown[]; responseMeta?: Record<string, unknown> }
type Control = Pick<KernelControlClient, "isBrowserElicitationEnabled" | "getChatGptAccessPolicy" | "fetch" | "createElicitation" | "captureTabPdfToLibrary">;
/** Original AU: one persistent runtime, fresh output and policy cache per execution. */
export function createKernelExecutionRuntime(control: Control, platform: "darwin" | "win32" | "linux", backendApiUrl = "https://chatgpt.com/backend-api") {
  const hooks: { run(): unknown; timeoutMs: number }[] = [];
  const requestMeta: Record<string, unknown> = {};
  let output: KernelExecutionOutput | undefined;
  let policy: Promise<ChatGptPagePolicy> | undefined;
  let terminalError: Error | undefined;
  const current = () => {
    if (terminalError != null) throw terminalError;
    if (output == null) throw new Error("JavaScript kernel is not executing");
    return output;
  };
  const env: Record<string, string> = {
    BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
    BROWSER_USE_BACKEND_API_URL: backendApiUrl,
    NODE_REPL_SENTRY_USER_ID: "",
    BROWSER_USE_SECURITY_MODE: "disabled-for-local-testing",
  };
  return {
    env,
    async initialize() { if (await control.isBrowserElicitationEnabled()) delete env.BROWSER_USE_SECURITY_MODE; },
    platform,
    fetch: control.fetch,
    async assertBrowserUrlAllowed(url: string) {
      current();
      await assertKernelBrowserUrlAllowed(url, () => policy ??= control.getChatGptAccessPolicy());
    },
    createElicitation: control.createElicitation,
    captureTabPdfToLibrary: control.captureTabPdfToLibrary,
    requestMeta,
    beginExecution(metadata: unknown) {
      if (terminalError != null) throw terminalError;
      if (output != null) throw new Error("JavaScript kernel is already executing");
      Object.assign(requestMeta, metadata);
      output = { contentItems: [] };
    },
    async finishExecution() {
      const result = current();
      try {
        for (const { run, timeoutMs } of [...hooks]) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(run),
              new Promise((_resolve, reject) => { timer = setTimeout(() => { terminalError = new AfterSubmittedCodeHookTimeoutError(); reject(terminalError); }, timeoutMs); }),
            ]);
          } catch { if (terminalError != null) throw terminalError; }
          finally { clearTimeout(timer); }
        }
        return result;
      } finally {
        output = undefined; policy = undefined;
        for (const key of Object.keys(requestMeta)) Reflect.deleteProperty(requestMeta, key);
      }
    },
    addAfterSubmittedCodeHook({ run, timeoutMs }: { run(): unknown; timeoutMs: number }) { hooks.push({ run, timeoutMs }); },
    emitContentItem(value: unknown) { current().contentItems.push(value); },
    setResponseMeta(value: Record<string, unknown>) {
      const active = current();
      active.responseMeta = { ...active.responseMeta, ...structuredClone(value) };
    },
  };
}
