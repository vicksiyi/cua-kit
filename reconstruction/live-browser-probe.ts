/** Read-only installed-host diagnostic. Not a reconstructed implementation. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { stageRuntimePackages, restoredPackageSources } from "../packages/agent-loop/src/runtime-packages";
import { create_launch_environment } from "../packages/cua-repl/src/launch_environment";
const session = randomUUID(), turn = randomUUID();
const staged = await stageRuntimePackages(restoredPackageSources());
let client: Awaited<ReturnType<typeof McpToolClient.connect>> | undefined;
try {
  client = await McpToolClient.connect({
    command: process.execPath,
    args: ["--import", import.meta.resolve("tsx"), resolve("packages/agent-loop/src/native-supervisor.ts")],
    env: create_launch_environment({
      HOME: process.env.HOME!,
      CUA_NATIVE_SUPERVISOR_PATH: "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
      NODE_REPL_NODE_PATH: "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
      NODE_REPL_DISABLE_ANALYTICS: "1",
      NODE_REPL_NODE_MODULE_DIRS: staged.root,
      NODE_REPL_TRUSTED_CODE_PATHS: staged.root,
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
} finally { await client?.close(); await staged.dispose(); }
