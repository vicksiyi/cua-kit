import test from "node:test";
import assert from "node:assert/strict";
import { BrowserStartupTools } from "../packages/agent-loop/src/browser-startup-tools";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import type {
  ToolClient,
  ToolCall,
} from "../packages/agent-loop/src/contracts";
const call: ToolCall = {
  id: "prepare",
  name: "prepare_browser",
  arguments: { browser: "chrome" },
};
function fixture() {
  const events: string[] = [];
  const inner: ToolClient = {
    getInstructions: () => "CUA instructions",
    listTools: async () => [
      { name: "js", description: "CUA", inputSchema: {} },
    ],
    callTool: async (call) => {
      events.push(call.name);
      return { content: [{ type: "text", text: "Observed browser" }] };
    },
    endTurn: async () => {
      events.push("end");
    },
    close: async () => {
      events.push("close");
    },
  };
  return { inner, events };
}
test("preparation validates inputs, uses host directory and coalesces attempts without exposing endpoint credentials", async () => {
  const { inner, events } = fixture();
  let prepared = 0;
  const tools = new BrowserStartupTools(inner, {
    directory: "/host-selected",
    prepare: async (directory) => {
      assert.equal(directory, "/host-selected");
      prepared++;
      return ["private-endpoint-with-token"];
    },
  });
  assert.equal(tools.getInstructions(), "CUA instructions");
  assert.deepEqual(
    (await tools.listTools()).map((t) => t.name),
    ["js", "prepare_browser"],
  );
  for (const args of [
    null,
    [],
    { browser: "edge" },
    { browser: "chrome", directory: "/model-path" },
    {},
  ])
    assert.equal(
      (await tools.callTool({ ...call, arguments: args as any })).isError,
      true,
    );
  assert.equal(prepared, 0);
  const results = await Promise.all([
    tools.callTool(call),
    tools.callTool(call),
  ]);
  assert.equal(prepared, 1);
  assert.match(JSON.stringify(results[1]), /earlier preparation/);
  assert.doesNotMatch(JSON.stringify(results), /private-endpoint/);
  assert.match(JSON.stringify(results), /cua.getState/);
  await tools.callTool({ ...call, name: "js" });
  await tools.endTurn();
  await tools.close();
  assert.deepEqual(events, ["js", "end", "close"]);
});
test("failed preparation is not retried and transport tool failures remain with the inner client", async () => {
  const { inner } = fixture();
  let attempts = 0;
  const tools = new BrowserStartupTools(inner, {
    directory: "/host-selected",
    prepare: async () => {
      attempts++;
      throw Error("Extension disabled");
    },
  });
  assert.equal((await tools.callTool(call)).isError, true);
  await tools.callTool(call);
  assert.equal(attempts, 1);
  const failure = Error("MCP closed");
  inner.callTool = async () => {
    throw failure;
  };
  await assert.rejects(
    tools.callTool({ ...call, name: "js" }),
    (e) => e === failure,
  );
});
test("cancellation prevents preparation or discards a late success", async () => {
  for (const before of [true, false]) {
    const { inner } = fixture(),
      controller = new AbortController(),
      reason = Error("Canceled");
    let calls = 0;
    const tools = new BrowserStartupTools(inner, {
      directory: "/host-selected",
      prepare: async () => {
        calls++;
        controller.abort(reason);
      },
    });
    if (before) controller.abort(reason);
    await assert.rejects(
      tools.callTool(call, controller.signal),
      (e) => e === reason,
    );
    assert.equal(calls, before ? 0 : 1);
  }
});
test("host tool names cannot shadow MCP tools", async () => {
  const { inner } = fixture();
  inner.listTools = async () => [
    { name: "prepare_browser", description: "collision", inputSchema: {} },
  ];
  await assert.rejects(
    new BrowserStartupTools(inner, { directory: "/host" }).listTools(),
    /conflicts/,
  );
});
test("AgentLoop can request preparation, then observe through unchanged MCP tools", async () => {
  const { inner, events } = fixture();
  let decisions = 0;
  const tools = new BrowserStartupTools(inner, {
    directory: "/host",
    prepare: async () => {
      events.push("prepare");
    },
  });
  const result = await new AgentLoop(
    {
      async decide(input) {
        assert(input.tools.some((tool) => tool.name === "prepare_browser"));
        if (++decisions === 1) return { toolCalls: [call] };
        if (decisions === 2) {
          assert.match(JSON.stringify(input.messages), /connected/);
          return {
            toolCalls: [
              {
                id: "observe",
                name: "js",
                arguments: { code: "await cua.getState();" },
              },
            ],
          };
        }
        return { text: "Browser observed" };
      },
    },
    tools,
  ).run("Open the requested browser");
  assert.equal(result.answer, "Browser observed");
  assert.deepEqual(events, ["prepare", "js", "end"]);
});

test("closing the adapter cancels pending host preparation", async () => {
  const { inner } = fixture();
  let began: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const tools = new BrowserStartupTools(inner, {
    directory: "/host",
    prepare: async (_directory, signal) => {
      began();
      await new Promise<void>((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        }),
      );
    },
  });
  const pending = tools.callTool(call);
  const rejected = assert.rejects(pending, /client closed/);
  await started;
  await tools.close();
  await rejected;
  await assert.rejects(tools.callTool(call), /client closed/);
});
