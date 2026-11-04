import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  codexTurnMetadata,
  metadataSession,
} from "../preferences/request_context";
import { environmentString } from "../capability_filter";
const env = (runtime: any, key: string) =>
  environmentString(runtime, key)?.trim() || undefined;
export function backendPipeDirectory(platform: string) {
  return platform === "win32"
    ? "\\\\.\\pipe\\codex-browser-use"
    : "/tmp/codex-browser-use";
}
/** Original zle/Kle/Xle. Explicit paths preserve whitespace, unlike scalar settings. */
export async function listBackendPipes(
  runtime: any,
  readDirectory: (name: string) => Promise<string[]> = readdir,
) {
  const configured = runtime.env.BROWSER_USE_BACKEND_PATHS;
  if (configured != null) {
    const split = configured.split(runtime.platform === "win32" ? ";" : ":"),
      paths = runtime.platform === "win32" ? path.win32 : path.posix,
      result: string[] = [];
    for (const entry of split)
      if (entry !== "") {
        if (!paths.isAbsolute(entry))
          throw new Error("BROWSER_USE_BACKEND_PATHS entries must be absolute");
        result.push(entry);
      }
    return [...new Set(result)];
  }
  const directory = backendPipeDirectory(runtime.platform);
  if (runtime.platform === "win32") {
    const root = "\\\\.\\pipe\\";
    return (await readDirectory(root))
      .map((name) => path.resolve(root, name))
      .filter((name) => name.startsWith(directory));
  }
  return (await readDirectory(directory)).map((name) =>
    path.resolve(directory, name),
  );
}
export function discoveryError(error: any) {
  if (typeof error === "string") return error;
  if (error == null || typeof error !== "object") return String(error);
  const string = (key: string) => {
    const value = error[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  const name = string("name"),
    message = string("message")?.trim() ?? "",
    code = string("code"),
    prefix = [
      name,
      code != null && !message.startsWith(`${code}:`) ? code : null,
    ]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join(": ");
  return prefix.length > 0
    ? message.length === 0
      ? prefix
      : `${prefix}: ${message}`
    : message.length > 0
      ? message
      : String(error);
}
/** Original Lle mutates default discoveryScope before matching and sorts global before session. */
export function filterSessionBrowsers(
  browsers: any[],
  session: any,
  flavor: any,
) {
  return browsers
    .filter(
      ({ info }) =>
        (info.discoveryScope ??=
          info.type === "iab" || info.type === "mcpapps"
            ? "session"
            : "global") !== "session" ||
        (session != null &&
          info.metadata?.codexSessionId === session &&
          (flavor == null || info.metadata.codexAppBuildFlavor === flavor)),
    )
    .sort(
      (left, right) =>
        +(left.info.discoveryScope === "session") -
        +(right.info.discoveryScope === "session"),
    );
}
export interface BrowserDiscoveryDependencies {
  connect(pipe: string): Promise<any>;
  readInfo(runtime: any, api: any, preferences: any): Promise<any>;
  span(
    name: string,
    attributes: any,
    perform: () => Promise<any>,
    options?: any,
  ): Promise<any>;
  surfaceEnabled(runtime: any, surface: any): boolean;
  surfaceForType(type: string): any;
  reportError(error: any): void;
  reportDiscoveryFailure(
    runtime: any,
    details: any,
    reason: string,
    iabCandidates: number,
  ): void;
  ignoredHandshakeError: any;
  listPipes?: (runtime: any) => Promise<string[]>;
}
/** Original M6/qle and connection/filter helpers; connection ids are shared by this discovery instance. */
export function createBrowserDiscovery(deps: BrowserDiscoveryDependencies) {
  let nextId = 1;
  async function connectCandidate(
    runtime: any,
    pipe: string,
    createApi: (transport: any) => any,
    preferences: any,
  ) {
    let api: any = null,
      stage = "pipe-connect";
    try {
      const transport = await deps.span("browser_use.browser.connect", {}, () =>
        deps.connect(pipe),
      );
      api = createApi(transport);
      stage = "backend-info-request";
      const info = await deps.span(
        "browser_use.browser.handshake",
        {},
        () => deps.readInfo(runtime, api, preferences),
        { resultAttrs: (info: any) => ({ "browser_use.backend": info.type }) },
      );
      return { browser: { id: String(nextId++), api, info, pipe } };
    } catch (error) {
      await api?.close();
      if (
        stage !== "backend-info-request" ||
        error !== deps.ignoredHandshakeError
      )
        deps.reportError(error);
      return { failure: `${stage}/${discoveryError(error)}` };
    }
  }
  async function discover(
    runtime: any,
    createApi: (transport: any) => any,
    previous: any[] = [],
    preferences?: any,
  ) {
    return deps.span(
      "browser_use.browser.discover",
      { "browser_use.browser.existing_count": previous.length },
      async () => {
        const requiredMetadata = codexTurnMetadata(runtime),
          missing = ["session_id", "turn_id"].filter(
            (key) => typeof requiredMetadata?.[key] !== "string",
          );
        if (missing.length)
          throw new Error(
            `Missing required Codex turn metadata: ${missing.join(", ")}`,
          );
        const metadata = codexTurnMetadata(runtime);
        const session = metadataSession(metadata),
          threadId =
            typeof metadata?.thread_id === "string"
              ? metadata.thread_id
              : undefined,
          threadSource =
            typeof metadata?.thread_source === "string"
              ? metadata.thread_source
              : undefined,
          turnId =
            typeof metadata?.turn_id === "string"
              ? metadata.turn_id
              : undefined;
        let listing: { error: string | null; pipes: string[] };
        try {
          listing = {
            error: null,
            pipes: await (deps.listPipes ?? listBackendPipes)(runtime),
          };
        } catch (error) {
          listing = { error: discoveryError(error), pipes: [] };
        }
        const exact = env(runtime, "CDP_BROWSER_BACKEND_PIPE_PATH"),
          pipes =
            env(runtime, "BROWSER_AUTH_EVAL_EXACT_CDP_BACKEND_SOCKET") !==
              "true" || exact == null
              ? listing.pipes
              : listing.pipes.filter((pipe) => pipe === exact);
        const cached = new Map(
          previous.map((browser) => [browser.pipe, browser]),
        );
        const outcomes = await Promise.all(
          pipes.map((pipe) =>
            cached.has(pipe)
              ? Promise.resolve({ browser: cached.get(pipe) })
              : connectCandidate(runtime, pipe, createApi, preferences),
          ),
        );
        const available = new Set(pipes);
        await Promise.all(
          previous
            .filter((browser) => !available.has(browser.pipe))
            .map(({ api }) => api.close()),
        );
        const connected = outcomes
          .map((result) => ("browser" in result ? result.browser : null))
          .filter((browser) => browser != null);
        const scoped = filterSessionBrowsers(
          connected,
          session,
          env(runtime, "BROWSER_USE_CODEX_APP_BUILD_FLAVOR"),
        );
        await Promise.all(
          connected
            .filter((browser) => !scoped.includes(browser))
            .map(({ api }) => api.close()),
        );
        const allowed: any[] = [],
          denied: any[] = [];
        for (const browser of scoped)
          (deps.surfaceEnabled(runtime, deps.surfaceForType(browser.info.type))
            ? allowed
            : denied
          ).push(browser);
        await Promise.all(denied.map(({ api }) => api.close()));
        const backendCounts: any = { cdp: 0, extension: 0, iab: 0, mcpapps: 0 };
        for (const browser of allowed) backendCounts[browser.info.type] += 1;
        const details = {
          backendCounts,
          browserCount: allowed.length,
          candidatePipeCount: outcomes.length,
          currentCodexSessionId: session ?? null,
          currentThreadId: threadId ?? null,
          currentThreadSource: threadSource ?? null,
          currentTurnId: turnId ?? null,
          discoveredIabCandidates: connected
            .filter((browser) => browser.info.type === "iab")
            .map((browser) => ({
              codexAppBuildFlavor:
                browser.info.metadata?.codexAppBuildFlavor ?? null,
              codexSessionId: browser.info.metadata?.codexSessionId ?? null,
            })),
          failures: outcomes
            .map((result) => ("failure" in result ? result.failure : null))
            .filter((failure) => failure != null)
            .slice(0, 8),
          iabBrowserCount: allowed.filter(
            (browser) => browser.info.type === "iab",
          ).length,
          pipeListingError: listing.error,
          pipeListingPipeCount: listing.pipes.length,
        };
        const iabCandidates = connected.filter(
          (browser) => browser.info.type === "iab",
        ).length;
        if (details.iabBrowserCount === 0) {
          const reason =
            metadataSession(codexTurnMetadata(runtime)) == null
              ? "missing-session-metadata"
              : iabCandidates === 0
                ? "no-iab-backends"
                : "no-session-match";
          deps.reportDiscoveryFailure(runtime, details, reason, iabCandidates);
        }
        return allowed;
      },
      {
        resultAttrs: (browsers: any[]) => ({
          "browser_use.browser.available_count": browsers.length,
        }),
      },
    );
  }
  return { discover, connectCandidate };
}
