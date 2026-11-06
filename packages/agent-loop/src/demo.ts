import { BROWSER_INPUT_CONTEXT } from "./browser-guidance";
import { CDP_OPERATION_CONTEXT } from "./cdp-guidance";
import { createDebugLog } from "./debug-log";
import { fileURLToPath } from "node:url";
import { computerPreflight } from "./computer-preflight";
import { browserPreflight } from "./browser-preflight";
import { createTerminalTrace } from "./terminal-trace";
import { createTerminalElicitation } from "./terminal-elicitation";
import { createBrowserOriginApproval } from "./browser-origin-approval";
import { NodeReplTurnClient, parseNodeReplTurnEvent } from "./node-repl-turn";
import { AgentLoop, AgentStepBudgetError } from "./loop";
import { McpToolClient } from "./mcp-client";
import { createDemoModel } from "./provider";
const question = process.argv.slice(2).join(" ").trim();
if (!question)
  throw new Error('Usage: npm run demo -w @core/agent-loop -- "question"');
const checkBrowser =
  process.argv.length === 3 && process.argv[2] === "--check-browser";
const checkComputer =
  process.argv.length === 3 && process.argv[2] === "--check-computer";
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
const computerEnabled = (
  serverEnv as Record<string, string>
).CUA_REPL_ENABLED_SURFACES?.split(",").some(
  (surface) => surface.trim() === "computer",
);
if (checkComputer && !computerEnabled)
  throw new Error(
    "--check-computer requires the computer surface in CUA_MCP_ENV.",
  );
const model = checkBrowser || checkComputer ? undefined : createDemoModel();
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
const debug =
  process.env.CUA_DEBUG === "0"
    ? undefined
    : createDebugLog(
        fileURLToPath(new URL("../../../artifacts/debug/", import.meta.url)),
        Object.entries(process.env)
          .filter(([key]) => /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(key))
          .map(([, value]) => value ?? "")
          .filter((value) => value.length >= 8),
      );
if (debug) console.error(`Local debug log: ${debug.file}`);
debug?.write("run.start", {
  question,
  provider: process.env.CUA_MODEL_PROVIDER ?? "deepseek",
  model: process.env.CUA_MODEL ?? "deepseek-flash",
  maxSteps: 12,
  summarizeOnExhaustion: true,
  summarizeOnBlocked: true,
  browserEnabled,
  computerEnabled,
  node: process.version,
});
const terminalElicit = createBrowserOriginApproval({
  origins: process.env.CUA_AUTO_APPROVE_BROWSER_ORIGINS,
  signal: controller.signal,
  fallback: createTerminalElicitation({ signal: controller.signal }),
  onApproved: origin => {
    console.error(`Browser origin automatically approved by caller configuration: ${origin}`);
    debug?.write("elicitation.auto-approved", { origin, policy: "browser-origin" });
  },
});
debug?.write("elicitation.capability", { available: !!terminalElicit });
if (!terminalElicit && (browserEnabled || computerEnabled))
  console.error(
    "Interactive confirmations unavailable: stdin and stderr must be terminals. Actions requiring new approval will be denied. Run directly in a terminal; local debug logs already capture tool activity.",
  );
const client = await McpToolClient.connect(
  {
    command,
    args,
    env: serverEnv as Record<string, string>,
    stderr: "inherit",
  },
  {
    requestMeta: () => requestMeta as Record<string, unknown>,
    elicit: terminalElicit
      ? async (params) => {
          debug?.write("elicitation.request", params);
          const result = await terminalElicit(params);
          debug?.write("elicitation.result", { action: result.action });
          return result;
        }
      : undefined,
  },
).catch((error) => {
  debug?.write("connection.error", { error });
  throw error;
});
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
const rawTurnClient: import("./contracts").ToolClient = turnEvent
  ? new NodeReplTurnClient(client, turnEvent, { defaultJsTimeoutMs: 60000 })
  : client;
const turnClient = debug ? debug.tools(rawTurnClient) : rawTurnClient;
const trace = createTerminalTrace();
let loopStarted = false;
try {
  const initialMessages: import("./contracts").AgentMessage[] = [];
  // CUA initialization belongs to the source launcher's kernel banner.
  // The first observation triggers it; callers do not inject a second import cell.
  if (browserEnabled) initialMessages.push(...await browserPreflight(turnClient, {
        signal: controller.signal,
        onMessage: trace,
        onRetry: error => {
          console.error("Browser inventory unavailable; retrying read-only preflight once in 2 seconds.");
          debug?.write("browser.preflight.retry", { error });
        },
      }));
  if (computerEnabled)
    initialMessages.push(
      ...(await computerPreflight(turnClient, {
        signal: controller.signal,
        onMessage: trace,
      })),
    );
  if (checkComputer) {
    console.log(
      "Native computer service verified by app inventory. No model request or app action was performed; screenshot/click acceptance remains separate.",
    );
  } else if (checkBrowser) {
    console.log(
      "Browser connection verified by CUA inventory. No model request or page action was performed; navigation/click acceptance is still separate.",
    );
  } else {
    loopStarted = true;
    const result = await new AgentLoop(
      debug ? debug.model(model!) : model!,
      turnClient,
    ).run(question, {
      signal: controller.signal,
      onMessage: trace,
      initialMessages,
      summarizeOnExhaustion: true,
      summarizeOnBlocked: true,
      runtimeContext: [
        browserEnabled ? BROWSER_INPUT_CONTEXT : undefined,
        (serverEnv as Record<string, string>).BROWSER_USE_AVAILABLE_BACKENDS === "cdp"
          ? CDP_OPERATION_CONTEXT : undefined,
        process.env.CUA_DEMO_ATTACHED_BROWSER === "1"
          ? "The connected browser belongs to the user and was attached through an explicitly supplied local CDP endpoint. Only operate tabs relevant to the request. Do not claim a fresh temporary profile. This client disconnects when the run ends; it does not close the existing browser."
          : process.env.CUA_DEMO_MANAGED_BROWSER === "1"
            ? "The connected chrome-family backend is a visible temporary Chromium launched by this demo. It is not the user's daily Chrome profile. Use this browser for the requested task and accurately identify it in your answer. It closes when this run ends, so do not tell the user to complete a verification in that tab after the final answer."
            : undefined,
      ].filter(Boolean).join("\n"),
    });
    debug?.write("run.answer", { status: result.status, answer: result.answer });
    if (result.status === "blocked") {
      process.exitCode = 1;
      if (result.summaryError) debug?.write("run.blocked-summary.error", { error: result.summaryError });
    }
    console.log(result.answer);
  }
} catch (error) {
  debug?.write("run.error", { error });
  if (!(error instanceof AgentStepBudgetError)) throw error;
  console.error(
    `任务已用完 ${error.maxSteps} 轮模型决策，尚未生成最终答案；这不代表任务成功。`,
  );
  if (error.partialSummary) {
    console.error(`已观察到的进展（任务未完成）：\n${error.partialSummary}`);
    debug?.write("run.incomplete", { summary: error.partialSummary });
  }
  if (error.cause) {
    console.error("进展摘要生成失败，原始工具轨迹仍保留在诊断日志中。");
    debug?.write("run.summary.error", { error: error.cause });
  }
  if (debug) console.error(`诊断日志：${debug.file}`);
  console.error("请提供该日志路径，以便分析重复调用、页面内容和工具错误。");
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  try {
    if (!loopStarted) await turnClient.endTurn?.();
  } finally {
    await turnClient.close();
    debug?.write("run.closed");
  }
}
