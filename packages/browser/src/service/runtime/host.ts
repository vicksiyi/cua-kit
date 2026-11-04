import { createBrowserConfig } from "./config_bridge";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { isAbsolute } from "node:path";
/** Original fH: text and byte reads intentionally have distinct return types. */
export const browserHostFilesystem = {
  tmpDir: tmpdir(),
  async mkdir(path: string, options: Parameters<typeof mkdir>[1]) {
    await mkdir(path, options);
  },
  async rm(path: string, options: Parameters<typeof rm>[1]) {
    await rm(path, options);
  },
  async readFile(path: string) {
    return await readFile(path, "utf8");
  },
  async readBytes(path: string) {
    return await readFile(path);
  },
  async writeFile(path: string, content: string | Uint8Array) {
    await writeFile(path, content);
  },
};
export interface BrowserHostDependencies {
  getPrivilegedRepl(): any;
  createAccessAssertion(runtime: any): () => Promise<void>;
  registerAutomatedReviewHost(runtime: any): unknown;
  createConfig?(repl: any): any;
  BrowserDirectory: new (...args: any[]) => any;
  extensionSelection(runtime: any): any;
  Preferences: new (...args: any[]) => any;
  commandTiming: any;
  createErrorReporter(runtime: any): any;
  performanceSpan: any;
  trackElicitation(request: any, perform: () => Promise<any>): Promise<any>;
  initializeCredentialObservation(runtime: any): Promise<unknown>;
  getNativeCredentialObservationStatus(runtime: any, ...args: any[]): any;
  createBrowserAuthBrokerChallenge(runtime: any, ...args: any[]): any;
  filesystem?: typeof browserHostFilesystem;
  platform?: () => string;
  isAbsolute?: (path: string) => boolean;
}
export const defaultGaasConfigPath =
  "/home/oai/.config/gaas-browser/config.json";
/** Original W6. The presence of config is the original privilege gate. */
export function privilegedNodeRepl() {
  const repl = (globalThis as any).nodeRepl;
  return repl?.config == null ? undefined : repl;
}
/** Original mH/nhe/ohe. Host-only dependencies remain explicit, never silently substituted. */
export function createBrowserHostFactory(deps: BrowserHostDependencies) {
  const filesystem = deps.filesystem ?? browserHostFilesystem;
  async function loadGaas(repl: any, runtime: any) {
    if (
      repl.env.BROWSER_USE_SECURITY_MODE?.trim() !== "gaas-browser-environment"
    )
      return;
    let config;
    try {
      const path =
        repl.env.BROWSER_USE_CONFIG_PATH?.trim() || defaultGaasConfigPath;
      config = JSON.parse(await filesystem.readFile(path));
    } catch {
      config = {};
    }
    return {
      browserConfig: repl.gaasBrowserConfig ?? {},
      config,
      ...(repl.env.BROWSER_AUTH_BROKER_SOCKET_PATH?.trim()
        ? {
            getNativeCredentialObservationStatus(...args: any[]) {
              return deps.getNativeCredentialObservationStatus(
                runtime,
                ...args,
              );
            },
            getBrowserAuthBrokerChallenge(tab: any, fields: any, options: any) {
              return deps.createBrowserAuthBrokerChallenge(
                runtime,
                tab,
                fields,
                options,
              );
            },
          }
        : {}),
    };
  }
  async function createRuntime(repl: any) {
    const elicit = repl.createElicitation.bind(repl);
    const runtime = {
      ...repl,
      platform: (deps.platform ?? platform)(),
      setResponseMeta: repl.setResponseMeta,
      get requestMeta() {
        return repl.requestMeta;
      },
      async createElicitation(request: any) {
        return await deps.trackElicitation(request, async () => {
          const { meta, ...result } = await elicit(request);
          return { ...result, _meta: result._meta ?? meta };
        });
      },
    };
    const gaas = await loadGaas(repl, runtime);
    if (gaas != null) runtime.gaas = gaas;
    await deps.initializeCredentialObservation(runtime);
    return runtime;
  }
  async function createHost() {
    const repl = deps.getPrivilegedRepl();
    if (repl == null)
      throw new Error("Browser use requires privileged Node REPL capabilities");
    const runtime = await createRuntime(repl);
    runtime.assertBrowserAccess = deps.createAccessAssertion(runtime);
    const wasmPath =
      runtime.env.BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH?.trim();
    if (wasmPath && !(deps.isAbsolute ?? isAbsolute)(wasmPath))
      throw new Error("Accessibility core WebAssembly path must be absolute");
    deps.registerAutomatedReviewHost(runtime);
    const config = (deps.createConfig ?? createBrowserConfig)(repl);
    return Object.assign(runtime, {
      config,
      browserContext: new deps.BrowserDirectory(
        runtime,
        deps.extensionSelection(runtime),
        new deps.Preferences(config, runtime),
      ),
      commandTiming: deps.commandTiming,
      errorReporter: deps.createErrorReporter(runtime),
      filesystem,
      performanceSpan: deps.performanceSpan,
    });
  }
  return { createHost, createRuntime, loadGaas };
}
