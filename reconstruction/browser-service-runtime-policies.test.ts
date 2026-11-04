import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimeDocumentation,
  assertCommandSupported,
  reportCommandRecovery,
  securityCheckAttributes,
  browserClientRelease,
} from "../packages/browser/src/service/runtime/runtime_policies";
import { createBrowserDocumentation } from "../packages/browser/src/service/context/documentation";
import { originalServiceBindings } from "./service-source";
const original = originalServiceBindings(
  ["_ue", "vue", "wue", "Sue", "H3", "Iue", "kue", "Bue", "G3", "V3"],
  { Vr: "1.0.0" },
);
async function attempt(fn: any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
const auth = "capabilities/tab/browserAuth",
  unified = "capabilities/tab/unified/browserAuth";
const text =
  "Header\r\n<!-- otp-autofill-enabled -->\r\nEnabled\r\n<!-- otp-autofill-disabled -->\r\nDisabled\r\n<!-- /otp-autofill -->\r\nTail";
function setup() {
  const docs: any = {
    documentation: {
      [auth]: text,
      [unified]: "unified",
      "cloud-auth": "cloud",
      screenshots: "screens",
      other: "other",
    },
    apiManifest: { root: "Browser", interfaces: {}, types: {} },
    documentManifest: [],
  };
  const bundle: any = {
    default: docs,
    environments: { cloud: docs, orbit: docs },
  };
  const loader = createBrowserDocumentation(
    "file:///synthetic/scripts/service.mjs",
    bundle,
  );
  const policies = createRuntimeDocumentation(
    "file:///synthetic/scripts/service.mjs",
    bundle,
  );
  const oracle = originalServiceBindings(["yue", "j3"], {
    zr: (r: any, key: string) =>
      typeof r.env[key] === "string" && r.env[key] === "1",
    wf: loader.readDocumentation,
  });
  return { docs, loader, policies, oracle };
}
test("runtime documentation policy matches original cloud rewrite, overrides and Orbit OTP sections", async () => {
  const { policies, oracle } = setup();
  let count = 0;
  const filesystem = {
    async readFile() {
      throw Error("unexpected file read");
    },
  };
  for (const environment of [undefined, "cloud", "orbit", "codex-app"])
    for (const name of [
      auth,
      unified,
      "cloud-auth",
      "screenshots",
      "other",
      "missing",
    ])
      for (const enabled of [undefined, "1", "true", 1])
        for (const override of [undefined, "  ", " override "]) {
          const runtime = {
            env: {
              BROWSER_USE_WORK_BROWSER_AUTH_ENABLED: enabled,
              BROWSER_USE_AUTOMATIC_OTP_ENABLED: enabled,
            },
            gaas: {
              browserConfig: { instruction_overrides: { [name]: override } },
            },
          };
          assert.deepEqual(
            await attempt(() =>
              policies.readDocumentation(runtime, name, filesystem, {
                environment,
              }),
            ),
            await attempt(() =>
              oracle.j3(runtime, name, filesystem, { environment }),
            ),
          );
          count++;
        }
  assert.equal(count, 288);
  assert.equal(
    await policies.readDocumentation(
      { env: { BROWSER_USE_AUTOMATIC_OTP_ENABLED: "1" } },
      auth,
      filesystem,
      { environment: "orbit" },
    ),
    "Header\r\nEnabled\r\nTail",
  );
  assert.equal(
    await policies.readDocumentation({ env: {} }, auth, filesystem, {
      environment: "orbit",
    }),
    "Header\r\nDisabled\r\nTail",
  );
  assert.equal(
    await policies.readDocumentation(
      {
        env: { BROWSER_USE_WORK_BROWSER_AUTH_ENABLED: "1" },
        gaas: {
          browserConfig: { instruction_overrides: { [auth]: "must not use" } },
        },
      },
      auth,
      filesystem,
      { environment: "cloud" },
    ),
    "unified",
  );
});
test("documentation policy composes real temporary filesystem manifest and text loading", async () => {
  const fs = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const dir = await fs.mkdtemp(join(tmpdir(), "cua-doc-policy-"));
  try {
    await fs.mkdir(join(dir, "scripts"));
    await fs.mkdir(join(dir, "references"));
    await fs.mkdir(join(dir, "references/capabilities/tab"), {
      recursive: true,
    });
    await fs.writeFile(
      join(dir, "references/api.json"),
      JSON.stringify({ root: "Browser", interfaces: {}, types: {} }),
    );
    await fs.writeFile(
      join(dir, "references/documents.json"),
      JSON.stringify([{ name: auth, mode: "included" }]),
    );
    await fs.writeFile(
      join(dir, "references/capabilities/tab/browserAuth.md"),
      text,
    );
    const p = createRuntimeDocumentation(
        pathToFileURL(join(dir, "scripts/service.mjs")).href,
      ),
      filesystem = { readFile: (url: URL) => fs.readFile(url, "utf8") };
    assert.equal((await p.loadApiManifest(filesystem)).root, "Browser");
    assert.equal((await p.loadDocumentManifest(filesystem))[0].name, auth);
    assert.equal(
      await p.readDocumentation({ env: {} }, auth, filesystem, {
        environment: "orbit",
      }),
      "Header\r\nDisabled\r\nTail",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("command compatibility and credential recovery metadata preserve original allowlists and versions", async () => {
  for (const type of ["iab", "extension", "cdp", "mcpapps"])
    for (const commandType of [
      "playwright_download_path",
      "playwright_wait_for_download",
      "cua_download_media",
      "dom_cua_download_media",
      "playwright_locator_download_media",
      "unknown",
    ]) {
      const input = { browserInfo: { type, name: "Synthetic" }, commandType };
      assert.deepEqual(
        await attempt(() => assertCommandSupported(input)),
        await attempt(() => original.H3(input)),
      );
    }
  const details: any = {
    command: "get_tab",
    phase: "error_recheck",
    reason: "credential_state_unavailable",
    next_action: "restart_browser_runtime",
    guard_state_before: "inactive",
    guard_state_after: "recovery_required",
    observation_changed: true,
  };
  assert.equal(browserClientRelease, "1.0.0");
  for (const commit of [
    undefined,
    "a".repeat(40),
    "A".repeat(40),
    "a".repeat(39),
    "invalid",
  ])
    for (const credential of [undefined, "1", "2", "3", 1])
      for (const manual of [undefined, "7", "8", "10", "9", 10]) {
        const env = {
          CAAS_IMAGE_GIT_COMMIT_SHA: commit,
          BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION: credential,
          BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION: manual,
        };
        const a: any[] = [],
          b: any[] = [];
        reportCommandRecovery(
          { env, setResponseMeta: (x: any) => a.push(x) },
          details,
        );
        original.V3({ env, setResponseMeta: (x: any) => b.push(x) }, details);
        assert.deepEqual(a, b);
      }
});
test("security check attributes match original suppression, cancellation/cache precedence and mappings", () => {
  let count = 0;
  for (const check of [
    "check-navigation-url-policy",
    "check-url-site-status",
    "file-download",
    "webmcp-tool-call",
    "unknown",
  ])
    for (const outcome of [
      "success",
      "denied",
      "bypassed",
      "error_fail_closed",
      "unknown",
    ])
      for (const permissionSource of [
        undefined,
        "guardian-origin-cache",
        "browser-use-turn-cache",
        "user_decision",
        "unknown",
      ])
        for (const cached of [false, true])
          for (const reason of [undefined, "approval_cancelled"]) {
            const entry = {
              check,
              outcome,
              permissionSource,
              cached,
              reason,
              origin: "https://synthetic.invalid",
              connectorId: "fixture",
              toolName: "tool",
              backend: "cdp",
              durationMs: 5,
            };
            assert.deepEqual(
              securityCheckAttributes(entry),
              original.G3(entry),
            );
            count++;
          }
  assert.equal(count, 500);
  assert.equal(
    securityCheckAttributes({
      check: "check-url-site-status",
      outcome: "success",
    }),
    undefined,
  );
  assert.equal(
    securityCheckAttributes({
      check: "file-upload",
      outcome: "success",
      cached: true,
      reason: "approval_cancelled",
    })?.decision_context,
    "cancelled",
  );
});
