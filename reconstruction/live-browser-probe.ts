/** Read-only installed-host diagnostic. Not a reconstructed implementation. */
import { randomUUID } from "node:crypto";
import { resolve, join, delimiter } from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { stageRuntimePackages, restoredPackageSources } from "../packages/agent-loop/src/runtime-packages";
import { create_launch_environment } from "../packages/cua-repl/src/launch_environment";
const session = randomUUID(), turn = randomUUID();
const staged = await stageRuntimePackages(restoredPackageSources());
let client: Awaited<ReturnType<typeof McpToolClient.connect>> | undefined;
try {
  const diagnostic = process.argv.includes("--diagnostics");
  const originalWorkers = process.argv.includes("--original-workers");
  const registeredService = process.argv.includes("--registered-service");
  const originalService = process.argv.includes("--original-service") || registeredService;
  const registeredServicePath = resolve(process.env.HOME!, ".codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-service.mjs");
  if (diagnostic && originalService) throw Error("Choose diagnostics or original-service, not both");
  const installedRoot = "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules";
  const diagnosticService = join(staged.root, "node_modules/@core/browser-desktop/dist/discovery-diagnostic.mjs");
  if (diagnostic) await writeFile(diagnosticService, `
import { assembleBrowserService, classifyError } from "@core/browser/service";
import { desktopDocumentation } from ${JSON.stringify(pathToFileURL(join(staged.root, "node_modules/@core/browser-desktop/dist/documentation_bundle.js")).href)};
const events = [];
const service = assembleBrowserService({
  host: {
    reportError(error) { events.push({ kind: "error", name: error?.name, code: error?.code, message: String(error?.message ?? error) }); },
    reportDiscoveryFailure(_runtime, details, reason) {
      events.push({ kind: "discovery", reason, counts: details.backendCounts, candidatePipeCount: details.candidatePipeCount, failures: details.failures, pipeListingError: details.pipeListingError, iabCandidates: details.discoveredIabCandidates.length });
    },
  },
  runtime: { documentation: { moduleUrl: import.meta.url, bundle: desktopDocumentation } },
});
export { classifyError };
export function handleRpc(request) { return request.method === "diagnostic" ? events : service.handleRpc(request); }
`);
  client = await McpToolClient.connect({
    command: originalWorkers ? "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl" : process.execPath,
    args: originalWorkers ? [] : ["--import", import.meta.resolve("tsx"), resolve("packages/agent-loop/src/native-supervisor.ts")],
    env: create_launch_environment({
      HOME: process.env.HOME!,
      ...(diagnostic ? { NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: diagnosticService }) } : {}),
      CUA_NATIVE_SUPERVISOR_PATH: "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
      NODE_REPL_NODE_PATH: "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
      NODE_REPL_DISABLE_ANALYTICS: "1",
      NODE_REPL_NODE_MODULE_DIRS: staged.root,
      NODE_REPL_TRUSTED_CODE_PATHS: originalService ? [staged.root, installedRoot, ...(registeredService ? [resolve(registeredServicePath, "..")] : [])].join(delimiter) : staged.root,
      ...(originalService ? { NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: registeredService ? registeredServicePath : join(installedRoot, "@oai/browser-desktop/scripts/browser-service.mjs") }) } : {}),
      CUA_REPL_ENABLED_SURFACES: "browser",
      CUA_REPL_BROWSER_ENV: "codex-app",
      BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
      BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
    }),
    stderr: "pipe",
  }, { requestMeta: () => ({ "x-codex-turn-metadata": { session_id: session, turn_id: turn } }) });
  const result = await client.callTool({ id: "read-only-discovery", name: "js", arguments: {
    code: 'var inventory = await cua.getState({emit:false}); nodeRepl.write(JSON.stringify({browserCount:inventory.browsers.length, appCount:inventory.apps.length, browsers:inventory.browsers.map(b => ({id:b.id,type:b.type,family:b.family})), errors:inventory.errors}));',
  } });
  const text = result.content.filter(item => item.type === "text").map(item => item.text);
  console.log(text.at(-1) ?? "No discovery result");
  if (result.isError) process.exitCode = 1;
  if (diagnostic) {
    const details = await client.callTool({ id: "diagnostics", name: "js", arguments: { code: 'nodeRepl.write(await nodeRepl.rpc("browser", {method:"diagnostic"}));' } });
    for (const item of details.content) if (item.type === "text") console.log(item.text);
    if (details.isError) process.exitCode = 1;
  }
} finally { await client?.close(); await staged.dispose(); }
