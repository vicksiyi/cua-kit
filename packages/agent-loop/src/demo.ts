import { browserPreflight } from "./browser-preflight";
import { createTerminalTrace } from "./terminal-trace";
import { createTerminalElicitation } from "./terminal-elicitation";
import { NodeReplTurnClient, parseNodeReplTurnEvent } from "./node-repl-turn";
import { AgentLoop } from "./loop";
import { McpToolClient } from "./mcp-client";
import { createDemoModel } from "./provider";
const question = process.argv.slice(2).join(" ").trim();
if (!question)
  throw new Error('Usage: npm run demo -w @core/agent-loop -- "question"');
const checkBrowser =
  process.argv.length === 3 && process.argv[2] === "--check-browser";
const command = process.env.CUA_MCP_COMMAND;
if (!command)
  throw new Error("Set CUA_MCP_COMMAND to the MCP server executable.");
const args: unknown = JSON.parse(process.env.CUA_MCP_ARGS ?? "[]");
if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string"))
  throw new Error("CUA_MCP_ARGS must be a JSON string array.");
const serverEnv: unknown = JSON.parse(process.env.CUA_MCP_ENV ?? "{}");
if (
  !serverEnv ||
  typeof serverEnv !== "object" ||
  Array.isArray(serverEnv) ||
  !Object.values(serverEnv).every((value) => typeof value === "string")
)
  throw new Error("CUA_MCP_ENV must be a JSON string map.");
if (Object.keys(serverEnv).some((key) => /(?:DEEPSEEK|CUA_MODEL)/i.test(key)))
  throw new Error(
    "Model credentials/configuration must not be forwarded to the MCP server.",
  );
const browserEnabled = (
  serverEnv as Record<string, string>
).CUA_REPL_ENABLED_SURFACES?.split(",").some(
  (surface) => surface.trim() === "browser",
);
if (checkBrowser && !browserEnabled)
  throw new Error(
    "--check-browser requires the browser surface in CUA_MCP_ENV.",
  );
const model = checkBrowser ? undefined : createDemoModel();
const requestMeta: unknown = JSON.parse(
  process.env.CUA_MCP_REQUEST_META ?? "{}",
);
if (
  !requestMeta ||
  typeof requestMeta !== "object" ||
  Array.isArray(requestMeta)
)
  throw new Error("CUA_MCP_REQUEST_META must be a JSON object.");
const turnEvent =
  process.env.CUA_MCP_TURN_EVENT === undefined
    ? undefined
    : parseNodeReplTurnEvent(JSON.parse(process.env.CUA_MCP_TURN_EVENT));
const controller = new AbortController();
const client = await McpToolClient.connect(
  {
    command,
    args,
    env: serverEnv as Record<string, string>,
    stderr: "inherit",
  },
  {
    requestMeta: () => requestMeta as Record<string, unknown>,
    elicit: createTerminalElicitation({ signal: controller.signal }),
  },
);
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
const turnClient: import("./contracts").ToolClient = turnEvent
  ? new NodeReplTurnClient(client, turnEvent, { defaultJsTimeoutMs: 60000 })
  : client;
const trace = createTerminalTrace();
let loopStarted = false;
try {
  const initialMessages = browserEnabled
    ? await browserPreflight(turnClient, {
        signal: controller.signal,
        onMessage: trace,
      })
    : [];
  if (checkBrowser) {
    console.log(
      "Browser connection verified by CUA inventory. No model request or page action was performed; navigation/click acceptance is still separate.",
    );
  } else {
    loopStarted = true;
    const result = await new AgentLoop(model!, turnClient).run(question, {
      signal: controller.signal,
      onMessage: trace,
      initialMessages,
    });
    console.log(result.answer);
  }
} finally {
  process.removeListener("SIGINT", interrupt);
  try {
    if (!loopStarted) await turnClient.endTurn?.();
  } finally {
    await client.close();
  }
}
