import { AgentLoop } from "./loop";
import { McpToolClient } from "./mcp-client";
import { createDemoModel } from "./provider";
const question = process.argv.slice(2).join(" ").trim();
if (!question)
  throw new Error('Usage: npm run demo -w @core/agent-loop -- "question"');
const model = createDemoModel();
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
const requestMeta: unknown = JSON.parse(
  process.env.CUA_MCP_REQUEST_META ?? "{}",
);
if (
  !requestMeta ||
  typeof requestMeta !== "object" ||
  Array.isArray(requestMeta)
)
  throw new Error("CUA_MCP_REQUEST_META must be a JSON object.");
const client = await McpToolClient.connect(
  {
    command,
    args,
    env: serverEnv as Record<string, string>,
    stderr: "inherit",
  },
  { requestMeta: () => requestMeta as Record<string, unknown> },
);
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
try {
  const result = await new AgentLoop(model, client).run(question, {
    signal: controller.signal,
    onMessage: (message) => {
      if (message.role === "assistant" && message.toolCalls)
        console.error(
          `Calling ${message.toolCalls.map((call) => call.name).join(", ")}`,
        );
    },
  });
  console.log(result.answer);
} finally {
  process.removeListener("SIGINT", interrupt);
  await client.close();
}
