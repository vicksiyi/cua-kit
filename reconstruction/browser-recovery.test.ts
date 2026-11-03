import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BrowserUseSecurityError,
  securityReasonInfo,
  SECURITY_REJECTED_PREFIX,
  SECURITY_REJECTED_SUFFIX,
  SECURITY_UNAVAILABLE_PREFIX,
  SECURITY_UNAVAILABLE_SUFFIX,
  ORBIT_ERROR_SUFFIX,
} from "../packages/browser/dist/errors/browser_security_error.js";
import {
  BrowserCredentialRecoveryError,
  parseCredentialRecoveryDetails,
} from "../packages/browser/dist/errors/credential_recovery_error.js";
import { createBrowserServiceExecutor } from "../packages/browser/dist/runtime/browser_service_executor.js";
import { FunctionAgentTransport } from "../packages/browser/dist/runtime/function_agent_transport.js";
import { ListBrowsersCommand } from "../packages/browser/dist/commands/browser_inventory.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const bundle = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(bundle + "\nexport {c as SecurityError,d as RecoveryError,l as parse,o as reasons};").toString("base64")}`
);
function describe(error: any) {
  return {
    name: error.name,
    message: error.message,
    ownKeys: Object.keys(error),
    cause: error.cause,
    decisionSource: error.decisionSource,
    reason: error.reason,
    retryable: error.retryable,
    details: error.details,
    frozen: error.details ? Object.isFrozen(error.details) : undefined,
  };
}
const actions = [
  "retry_after_credential_delivery",
  "navigate_to_new_document",
  "create_new_tab",
  "request_manual_handoff",
  "restart_browser_runtime",
  "retry_after_resolution",
  "stop",
];
const reasons = [
  "credential_delivery_in_progress",
  "credential_observation_restricted",
  "retained_data_restricted",
  "credential_state_unavailable",
  "protected_command_failed",
  "browser_security_restricted",
  "browser_security_unavailable",
];
const base = {
  schema_version: 1,
  command: "tab_ax_get_state",
  phase: "command",
  reason: "credential_delivery_in_progress",
  next_action: "retry_after_credential_delivery",
};

test("security error data, exact messages, metadata and cause match every original reason", () => {
  assert.deepEqual(securityReasonInfo, original.reasons);
  for (const reason of Object.keys(original.reasons))
    for (const detail of ["", "more detail", "中文"]) {
      assert.deepEqual(
        describe(
          new BrowserUseSecurityError(reason as any, detail, {
            cause: "fixture",
          }),
        ),
        describe(
          new original.SecurityError(reason, detail, { cause: "fixture" }),
        ),
      );
    }
});

test("recovery parser preserves allowed reason-action-security combinations and invalid input behavior", () => {
  for (const reason of reasons)
    for (const next_action of actions)
      for (const security_reason of [
        undefined,
        null,
        "unknown",
        ...Object.keys(original.reasons),
      ]) {
        const value = {
          ...base,
          reason,
          next_action,
          security_reason,
          extra: "drop",
        };
        assert.deepEqual(
          parseCredentialRecoveryDetails(value),
          original.parse(value),
        );
      }
  const inputs: any[] = [
    null,
    undefined,
    [],
    () => {},
    "text",
    {},
    Object.assign([], { ...base }),
    Object.create(base),
    ...[0, 2, "1", null].map((schema_version) => ({ ...base, schema_version })),
    ...[
      "",
      "A",
      "with1",
      "a".repeat(64),
      "a".repeat(65),
      "a\n",
      "under_score",
      4,
    ].map((command) => ({ ...base, command })),
    ...[
      "before_command",
      "command",
      "after_command",
      "error_recheck",
      "unknown",
      4,
    ].map((phase) => ({ ...base, phase })),
    { ...base, reason: "toString" },
    { ...base, security_reason: null },
  ];
  for (const value of inputs)
    assert.deepEqual(
      parseCredentialRecoveryDetails(value),
      original.parse(value),
    );
  for (const parser of [parseCredentialRecoveryDetails, original.parse])
    assert.equal(Object.hasOwn(parser(base), "security_reason"), true);
  function getterTrace(parser: any) {
    const log: string[] = [];
    const input = new Proxy(
      { ...base },
      {
        get(target, key, receiver) {
          log.push(String(key));
          return Reflect.get(target, key, receiver);
        },
      },
    );
    return { value: parser(input), log };
  }
  assert.deepEqual(
    getterTrace(parseCredentialRecoveryDetails),
    getterTrace(original.parse),
  );
});

test("recovery error construction preserves messages, frozen projected details and no implicit validation", () => {
  for (const reason of [...reasons, "unknown"])
    for (const next_action of [...actions, "unknown"])
      for (const security_reason of [
        undefined,
        "user_declined",
        "guardian_timed_out",
      ]) {
        const value = {
          ...base,
          schema_version: 99,
          reason,
          next_action,
          security_reason,
          extra: 1,
        };
        assert.deepEqual(
          describe(new BrowserCredentialRecoveryError(value as any)),
          describe(new original.RecoveryError(value)),
        );
      }
});

async function run(
  useOriginal: boolean,
  { version, environment, response, throwValue }: any,
) {
  const calls: any[] = [];
  const effects: any[] = [];
  const previous = (globalThis as any).nodeRepl;
  let caught: any;
  const execute = async (method: string, command: any) => {
    calls.push([method, command]);
    if (throwValue !== undefined) throw throwValue;
    return response;
  };
  try {
    let runCommand: () => Promise<any>;
    if (useOriginal) {
      (globalThis as any).nodeRepl = {
        rpc: async (_service: string, request: any) => {
          if (request.method === "setup")
            return {
              apiManifest: { interfaces: {} },
              disabledMemberIds: [],
              credentialRecoveryErrorVersion: version,
            };
          return execute(request.method, request.params);
        },
        emitImage: async () => {},
      };
      const agent = await original.setupBrowserRuntime({ environment });
      runCommand = () => agent.browsers.list();
    } else {
      const executor = createBrowserServiceExecutor({
        credentialRecoveryErrorVersion: version,
        environment,
        execute: (command) => execute("execute", command),
        executeWithRecovery: (command) =>
          execute("executeWithRecovery", command),
      });
      const transport = new FunctionAgentTransport({
        executeAgentCommand: executor,
        displaySideEffect: (value) => effects.push(value),
      });
      runCommand = () =>
        transport.send({ command: ListBrowsersCommand.create() });
    }
    try {
      return { value: await runCommand(), calls, effects };
    } catch (error) {
      caught = error;
      return {
        error:
          typeof error === "object" && error !== null ? describe(error) : error,
        sameError: error === throwValue,
        calls,
        effects,
      };
    }
  } finally {
    (globalThis as any).nodeRepl = previous;
  }
}

test("service executor matches original setupBrowserRuntime RPC version selection, recovery envelopes and error identity", async () => {
  for (const version of [undefined, 0, 1, 2, "1"])
    for (const environment of [undefined, "codex-app", "orbit"])
      for (const response of [
        [],
        { value: "raw" },
        { ok: true, value: [] },
        { ok: false, error: base },
        { ok: false, error: {} },
        { ok: 1, value: [] },
        { ok: true, value: null },
        null,
      ]) {
        assert.deepEqual(
          await run(false, { version, environment, response }),
          await run(true, { version, environment, response }),
          `${version}/${environment}`,
        );
      }
  for (const environment of ["codex-app", "orbit"])
    for (const value of ["plain thrown string", null, 0]) {
      assert.deepEqual(
        await run(false, { version: 1, environment, throwValue: value }),
        await run(true, { version: 1, environment, throwValue: value }),
      );
    }
});

test("Orbit rewrite matches original last-suffix handling without replacing error identity or details", async () => {
  const messages = [
    "ordinary error",
    `${SECURITY_REJECTED_PREFIX} detail${SECURITY_REJECTED_SUFFIX}`,
    `${SECURITY_UNAVAILABLE_PREFIX} detail${SECURITY_UNAVAILABLE_SUFFIX}`,
    `${SECURITY_REJECTED_PREFIX}${SECURITY_REJECTED_SUFFIX} more${SECURITY_REJECTED_SUFFIX} trailing`,
    `${SECURITY_UNAVAILABLE_PREFIX}${SECURITY_UNAVAILABLE_SUFFIX}${ORBIT_ERROR_SUFFIX}`,
    `${SECURITY_REJECTED_PREFIX}${SECURITY_REJECTED_SUFFIX} ${SECURITY_UNAVAILABLE_PREFIX}${SECURITY_UNAVAILABLE_SUFFIX}`,
  ];
  for (const message of messages)
    for (const environment of ["orbit", "codex-app"]) {
      assert.deepEqual(
        await run(false, {
          version: 0,
          environment,
          throwValue: new Error(message),
        }),
        await run(true, {
          version: 0,
          environment,
          throwValue: new Error(message),
        }),
      );
    }
  for (const security_reason of Object.keys(original.reasons)) {
    const retryable = original.reasons[security_reason].retryable;
    const response = {
      ok: false,
      error: {
        ...base,
        reason: retryable
          ? "browser_security_unavailable"
          : "browser_security_restricted",
        next_action: retryable ? "retry_after_resolution" : "stop",
        security_reason,
      },
    };
    assert.deepEqual(
      await run(false, { version: 1, environment: "orbit", response }),
      await run(true, { version: 1, environment: "orbit", response }),
    );
  }
});
