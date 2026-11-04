import test from "node:test";
import assert from "node:assert/strict";
import {
  promptElicitation,
  createTerminalElicitation,
} from "../packages/agent-loop/src/terminal-elicitation";
import type { ElicitRequestParams } from "@modelcontextprotocol/sdk/types.js";
const empty: ElicitRequestParams = {
  message: "Confirm fixture access",
  requestedSchema: { type: "object", properties: {} },
};
function io(lines: Array<string | undefined>) {
  const output: string[] = [];
  return {
    output,
    write: (text: string) => {
      output.push(text);
    },
    ask: async (prompt: string) => {
      output.push(prompt);
      return lines.shift();
    },
  };
}
test("form decisions require an explicit choice; blank, EOF and URL never auto-accept", async () => {
  assert.deepEqual(await promptElicitation(empty, io(["", "nonsense", "d"])), {
    action: "decline",
  });
  assert.deepEqual(await promptElicitation(empty, io([undefined])), {
    action: "cancel",
  });
  assert.deepEqual(await promptElicitation(empty, io(["a"])), {
    action: "accept",
    content: {},
  });
  const unused = io([]);
  unused.ask = async () => {
    throw Error("URL must not prompt");
  };
  assert.deepEqual(
    await promptElicitation(
      {
        mode: "url",
        message: "URL",
        url: "https://fixture.invalid",
        elicitationId: "fixture",
      },
      unused,
    ),
    { action: "cancel" },
  );
});
test("upstream AJV validates actual entered fields without applying approval defaults", async () => {
  const form: ElicitRequestParams = {
    message: "Form",
    requestedSchema: {
      type: "object",
      properties: {
        count: { type: "integer", minimum: 1 },
        mode: { type: "string", enum: ["once", "session"], default: "session" },
        enabled: { type: "boolean" },
      },
      required: ["count", "mode", "enabled"],
    },
  };
  const input = io([
    "a",
    "{",
    "{}",
    '{"count":0,"mode":"invalid","enabled":"yes"}',
    '{"count":2,"mode":"once","enabled":false}',
  ]);
  assert.deepEqual(await promptElicitation(form, input), {
    action: "accept",
    content: { count: 2, mode: "once", enabled: false },
  });
  assert.ok(input.output.some((text) => text.includes("Invalid JSON")));
  assert.equal(
    input.output.filter((text) => text.startsWith("Invalid form")).length,
    2,
  );
  assert.deepEqual(await promptElicitation(form, io(["a", "cancel"])), {
    action: "cancel",
  });
});
test("terminal output strips control sequences and non-interactive streams advertise no UI", async () => {
  const output = io(["d"]);
  await promptElicitation(
    { ...empty, message: "\x1b[2Jfixture\x1b]0;title\x07\r\x00" },
    output,
  );
  assert.ok(output.output.some((text) => text.includes("fixture")));
  assert.ok(output.output.every((text) => !/[\x00\x07\x1b\r]/.test(text)));
  assert.equal(
    createTerminalElicitation({
      input: { isTTY: false } as any,
      output: { isTTY: true } as any,
    }),
    undefined,
  );
});
