import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { AgentLoop, AgentStepBudgetError, ChatCompletionsModel } from "../packages/agent-loop/src/index";
import type { ToolClient } from "../packages/agent-loop/src/contracts";

// Shape observed in the local failure log; no private task/page content included.
const leakedCall = '\n\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="js">fixture-only</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>';
for (const mode of ["answer", "budget-summary", "blocked-summary", "ordinary-text"] as const) {
  test(`HTTP adapter handles protocol text in ${mode} without executing it`, async () => {
    let requests = 0, actions = 0, cleanups = 0;
    const server = createServer(async (req, res) => {
      for await (const _ of req) { /* drain */ }
      requests++;
      const initialAction = requests === 1 && (mode === "budget-summary" || mode === "blocked-summary");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: initialAction
        ? { tool_calls: [{ id: "one", type: "function", function: { name: "observe", arguments: "{}" } }] }
        : { content: mode === "ordinary-text" ? "DSML is a serialization format; no action was requested." : leakedCall } }] }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as {port:number}).port;
    const tools: ToolClient = {
      async listTools() { return [{ name: "observe", description: "fixture", inputSchema: {} }]; },
      async callTool() { actions++; return { content: [], ...(mode === "blocked-summary" ? {
        stopReason: { kind: "authorization" as const, message: "Host denied this action" },
      } : {}) }; },
      async endTurn() { cleanups++; }, async close() {},
    };
    const loop = new AgentLoop(new ChatCompletionsModel({ endpoint: `http://127.0.0.1:${port}`, apiKey: "fixture", model: "fixture" }), tools);
    try {
      const run = loop.run("fixture", { maxSteps: 1, summarizeOnExhaustion: true, summarizeOnBlocked: true });
      if (mode === "answer") await assert.rejects(run, /serialized tool-call markup/);
      else if (mode === "budget-summary") await assert.rejects(run, error => {
        assert(error instanceof AgentStepBudgetError);
        assert.equal(error.partialSummary, undefined);
        assert.match(String(error.cause), /serialized tool-call markup/);
        return true;
      });
      else if (mode === "blocked-summary") {
        const result = await run;
        assert.equal(result.status, "blocked");
        assert.equal(result.answer, "Host denied this action");
        assert.match(String(result.summaryError), /serialized tool-call markup/);
      } else assert.match((await run).answer, /serialization format/);
      assert.equal(actions, mode === "budget-summary" || mode === "blocked-summary" ? 1 : 0);
      assert.equal(cleanups, 1);
      assert.equal(requests, mode === "budget-summary" || mode === "blocked-summary" ? 2 : 1);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}
