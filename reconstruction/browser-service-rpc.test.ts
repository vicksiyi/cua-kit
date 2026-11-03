import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { createServiceRpcDispatcher } from "../packages/browser/dist/service/rpc_dispatch.js";
import {
  classifyError,
  classifyCommandError,
  securityErrorReason,
} from "../packages/browser/dist/service/classify_error.js";
import {
  BrowserUseSecurityError,
  securityReasonInfo,
} from "../packages/browser/dist/service/errors/browser_security_error.js";
import { BrowserCredentialRecoveryError } from "../packages/browser/dist/service/errors/credential_recovery_error.js";
import { LocatorError } from "../packages/browser/dist/service/errors/locator_error.js";
import { BrowserCredentialRecoveryError as ClientRecoveryError } from "../packages/browser/dist/errors/credential_recovery_error.js";
import { BrowserUseSecurityError as ClientSecurityError } from "../packages/browser/dist/errors/browser_security_error.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs`,
  "utf8",
);
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" }),
  definitions = new Map();
function visit(node: any) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") definitions.set(node.id.name, node);
  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    node.init
  )
    definitions.set(node.id.name, node.init);
  if (node.type === "AssignmentExpression" && node.left.type === "Identifier")
    definitions.set(node.left.name, node.right);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(ast);
function expression(name: string) {
  const node = definitions.get(name);
  assert.ok(node, `missing original ${name}`);
  return source.slice(node.start, node.end);
}
// Execute only exact selected source expressions. Importing the whole service would initialize unrelated telemetry/native dependencies.
const names = [
  "F8",
  "U8",
  "L8",
  "q8",
  "JT",
  "el",
  "j8",
  "St",
  "V8",
  "xs",
  "Fr",
  "rp",
  "Qa",
  "Vut",
];
const original = new Function(
  '"use strict";' +
    names.map((name) => `const ${name}=${expression(name)};`).join("\n") +
    "return {St,xs,Fr,rp,Qa,Vut,JT};",
)();
function originalDispatcher(deps: any) {
  return new Function(
    "mH",
    "p6",
    "mn",
    "xs",
    '"use strict";let iy;const hH=' +
      expression("hH") +
      ";const Gut=" +
      expression("Gut") +
      ";return Gut;",
  )(deps.createHostRuntime, deps.initializeRuntime, deps.withSpan, original.xs);
}
const details = {
  schema_version: 1,
  command: "tab_ax_get_state",
  phase: "command",
  reason: "credential_delivery_in_progress",
  next_action: "retry_after_credential_delivery",
};
function describe(error: any) {
  return {
    name: error.name,
    message: error.message,
    keys: Object.keys(error),
    cause: error.cause,
    reason: error.reason,
    decisionSource: error.decisionSource,
    retryable: error.retryable,
    code: error.code,
    details: error.details,
    frozen: error.details ? Object.isFrozen(error.details) : undefined,
  };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: describe(error) };
  }
}
test("service error classes and classifiers match original constructors while retaining distinct client identities", () => {
  assert.deepEqual(securityReasonInfo, original.JT);
  for (const reason of Object.keys(original.JT))
    for (const detail of ["", "more detail"]) {
      const ours = new BrowserUseSecurityError(reason, detail, {
          cause: "cause",
        }),
        theirs = new original.St(reason, detail, { cause: "cause" });
      assert.deepEqual(describe(ours), describe(theirs));
      assert.equal(classifyError(ours), original.Vut(theirs));
    }
  for (const reason of [
    "credential_delivery_in_progress",
    "credential_observation_restricted",
    "retained_data_restricted",
    "credential_state_unavailable",
    "protected_command_failed",
    "browser_security_restricted",
    "browser_security_unavailable",
  ]) {
    const data = { ...details, reason, security_reason: "user_declined" };
    assert.deepEqual(
      describe(new BrowserCredentialRecoveryError(data)),
      describe(new original.xs(data)),
    );
  }
  for (const code of ["timeout", "arbitrary"]) {
    const ours = new LocatorError(code, "failure", { cause: "c" }),
      theirs = new original.Fr(code, "failure", { cause: "c" });
    assert.deepEqual(describe(ours), describe(theirs));
    assert.equal(classifyCommandError(ours), original.Qa(theirs));
  }
  for (const value of [
    undefined,
    null,
    1,
    {},
    { message: 'Timed out running CDP command "X"' },
    "failure",
    new Error("failure"),
    'Timed out running CDP command "X"',
    'Timed out translating CDP input command "X"',
    "Timed out after 20ms waiting for CDP command X",
    new Error('Timed out running CDP command "X"'),
    new ClientRecoveryError(details),
    new ClientSecurityError("user_declined", ""),
  ]) {
    assert.equal(classifyCommandError(value), original.Qa(value));
    assert.equal(classifyError(value), original.Vut(value));
    assert.equal(securityErrorReason(value), original.rp(value));
  }
  assert.ok(
    !(
      new BrowserCredentialRecoveryError(details) instanceof ClientRecoveryError
    ),
  );
  assert.ok(
    !(
      new BrowserUseSecurityError("user_declined", "") instanceof
      ClientSecurityError
    ),
  );
});
async function routingScenario(create: any, Recovery: any) {
  const calls: any[] = [];
  const failure = new Error("failed");
  const handle = create({
    async createHostRuntime() {
      calls.push("host");
      return { id: "host" };
    },
    async initializeRuntime(options: any, host: any) {
      calls.push({ options, host });
      return {
        apiManifest: { interfaces: {} },
        disabledMemberIds: new Set(["Tab.close", "Tab.ax"]),
        async executeAgentCommand(command: any) {
          calls.push(command);
          if (command === "recovery") throw new Recovery(details);
          if (command === "ordinary") throw failure;
          if (command === "client") throw new ClientRecoveryError(details);
          return { value: command };
        },
      };
    },
    async withSpan(name: any, attrs: any, run: any) {
      calls.push({ name, attrs });
      return await run();
    },
  });
  const results = [];
  for (const method of [
    "execute",
    "executeWithRecovery",
    "toString",
    "constructor",
    "__proto__",
    "unknown",
  ])
    results.push(await outcome(() => handle({ method, params: {} })));
  for (const environment of [
    "invalid",
    "codex-app",
    "training",
    "cloud",
    "orbit",
  ])
    results.push(
      await outcome(() =>
        handle({
          method: "setup",
          params: {
            environment,
            undocumentedApiMembers: ["Tab.ax"],
            excludedDocumentation: ["confirmations"],
          },
        }),
      ),
    );
  for (const method of ["execute", "executeWithRecovery"])
    for (const params of ["ok", "recovery", "ordinary", "client"])
      results.push(await outcome(() => handle({ method, params })));
  return { calls, results };
}
test("service RPC preserves environment validation, own-method dispatch, raw execution and exact recovery instanceof gate", async () => {
  assert.deepEqual(
    await routingScenario(
      createServiceRpcDispatcher,
      BrowserCredentialRecoveryError,
    ),
    await routingScenario(originalDispatcher, original.xs),
  );
});
async function replacementScenario(create: any) {
  const calls: any[] = [],
    pending: any[] = [];
  const handle = create({
    async createHostRuntime() {
      const index = pending.length;
      calls.push(["host", index]);
      return await new Promise((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    },
    async initializeRuntime(options: any, host: any) {
      calls.push(["init", host]);
      return {
        apiManifest: { interfaces: {}, host },
        disabledMemberIds: [],
        executeAgentCommand(command: any) {
          return { host, command };
        },
      };
    },
    async withSpan(name: any, attrs: any, run: any) {
      calls.push(["span", attrs]);
      return await run();
    },
  });
  const first = handle({ method: "setup", params: { environment: "cloud" } }),
    second = handle({ method: "setup", params: { environment: "orbit" } });
  const execute = handle({ method: "execute", params: "waiting" });
  pending[1].resolve("second");
  const secondResult = await second,
    executeResult = await execute;
  pending[0].resolve("first");
  const firstResult = await first;
  const after = await handle({ method: "execute", params: "after" });
  const failure = new Error("host failure");
  const rejected = handle({
    method: "setup",
    params: { environment: "cloud" },
  });
  const rejectedOutcome = outcome(() => rejected);
  pending[2].reject(failure);
  const setupError = await rejectedOutcome,
    executeError = await outcome(() =>
      handle({ method: "execute", params: "after failure" }),
    );
  const invalid = await outcome(() =>
    handle({ method: "setup", params: { environment: "invalid" } }),
  );
  const stillFailed = await outcome(() =>
    handle({ method: "execute", params: "still failed" }),
  );
  return {
    calls,
    firstResult,
    secondResult,
    executeResult,
    after,
    setupError,
    executeError,
    invalid,
    stillFailed,
  };
}
test("setup replaces the pending runtime immediately, preserves overlapping setup results and retains rejected runtime", async () => {
  assert.deepEqual(
    await replacementScenario(createServiceRpcDispatcher),
    await replacementScenario(originalDispatcher),
  );
});

test("reconstructed client and service preserve recovery serialization across distinct error identities", async () => {
  const { setupBrowserRuntime } =
    await import("../packages/browser/dist/runtime/setup.js");
  const previous = (globalThis as any).nodeRepl;
  const handle = createServiceRpcDispatcher({
    async createHostRuntime() {
      return {};
    },
    async initializeRuntime() {
      return {
        apiManifest: { interfaces: { Agent: {}, Browsers: {} } },
        disabledMemberIds: [],
        async executeAgentCommand() {
          throw new BrowserCredentialRecoveryError(details);
        },
      };
    },
    async withSpan(name, attributes, run) {
      return await run();
    },
  });
  try {
    (globalThis as any).nodeRepl = {
      rpc: async (service: string, request: any) => {
        assert.equal(service, "browser");
        return await handle(request);
      },
    };
    const agent = await setupBrowserRuntime();
    await assert.rejects(agent.browsers.list(), (error) => {
      assert.ok(error instanceof ClientRecoveryError);
      assert.ok(!(error instanceof BrowserCredentialRecoveryError));
      assert.equal(error.details.reason, details.reason);
      assert.equal(error.details.next_action, details.next_action);
      return true;
    });
  } finally {
    (globalThis as any).nodeRepl = previous;
  }
});
