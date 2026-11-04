import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCommandError,
  commandErrorMessage,
} from "../packages/browser/src/service/runtime/command_errors";
import { browserFamilies } from "../packages/browser/src/service/browser_family";
import { originalServiceBindings } from "./service-source";
const original = originalServiceBindings(["E5", "MA", "T5", "ks", "OA"], {
  sl: browserFamilies,
});
const blocked =
  "Cannot access a chrome-extension:// URL of different extension";
function outcome(fn: any) {
  try {
    const error = fn();
    return { name: error.name, message: error.message, cause: error.cause };
  } catch (error: any) {
    return { thrown: error.name, message: error.message };
  }
}
test("command error normalization retains original error identity, cause and browser family behavior", () => {
  for (const value of [
    null,
    undefined,
    false,
    1,
    "text",
    { message: "message" },
    new Error("ordinary"),
    new Error(blocked),
    blocked,
    { message: blocked },
    { message: 3 },
  ])
    for (const family of [
      undefined,
      null,
      "chrome",
      "edge",
      "brave",
      "invalid",
    ]) {
      assert.equal(commandErrorMessage(value), original.MA(value));
      const a = outcome(() => formatCommandError(value, { family })),
        b = outcome(() => original.OA(value, { family }));
      assert.deepEqual(a, b);
      if (value instanceof Error && !value.message.includes(blocked))
        assert.equal(formatCommandError(value, { family }), value);
      if (
        value instanceof Error &&
        value.message.includes(blocked) &&
        family === "chrome"
      )
        assert.equal(formatCommandError(value, { family }).cause, value);
    }
  let reads = 0;
  const error = {
    get message() {
      reads++;
      return "x";
    },
  };
  formatCommandError(error);
  assert.equal(reads, 2);
  reads = 0;
  original.OA(error);
  assert.equal(reads, 2);
});
