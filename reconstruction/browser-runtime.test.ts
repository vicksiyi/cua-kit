import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupBrowserRuntime } from "../packages/browser/dist/runtime/setup.js";
import { BrowserRuntimeFactory } from "../packages/browser/dist/runtime/factory.js";
import { runtimeTypes } from "../packages/browser/dist/runtime/registry.js";
import { Commands } from "../packages/browser/dist/commands/index.js";
import { generateRequestId } from "../packages/browser/dist/runtime/request_id.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {p,b,jm,cl};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
function descriptorShape(object: any, key: string) {
  const d = Object.getOwnPropertyDescriptor(object, key)!;
  return {
    enumerable: d.enumerable,
    configurable: d.configurable,
    get: typeof d.get,
    set: typeof d.set,
  };
}
test("runtime and command registries preserve source keys, getter descriptors and runtime type eligibility", () => {
  for (const [ours, theirs] of [
    [runtimeTypes, original.p],
    [Commands, original.b],
  ]) {
    assert.deepEqual(Object.keys(ours), Object.keys(theirs));
    assert.equal(Object.getPrototypeOf(ours), Object.getPrototypeOf(theirs));
    for (const key of Object.keys(theirs)) {
      assert.deepEqual(
        descriptorShape(ours, key),
        descriptorShape(theirs, key),
      );
      assert.equal(typeof ours[key], typeof theirs[key], key);
      assert.equal(
        typeof ours[key] === "function" && ours[key].prototype != null,
        typeof theirs[key] === "function" && theirs[key].prototype != null,
        key,
      );
    }
  }
  for (const name of Object.keys(Commands).filter(
    (name) => name !== "AtlasCommand",
  )) {
    assert.deepEqual(
      Object.keys(Commands[name]).sort(),
      Object.keys(original.b[name]).sort(),
      name,
    );
    assert.equal(
      Commands[name].commandType,
      original.b[name].commandType,
      name,
    );
  }
});
test("request id retains original timestamp/random formatting without padding", () => {
  const now = Date.now,
    random = Math.random;
  try {
    Date.now = () => 1000;
    for (const value of [0, 0.5, 0.123456, 0.99999]) {
      Math.random = () => value;
      assert.equal(generateRequestId(), original.cl());
    }
  } finally {
    Date.now = now;
    Math.random = random;
  }
});
const manifest = {
  interfaces: {
    Agent: {},
    Browsers: {},
    Browser: { history: { unsupportedByDefaultIn: ["chrome"] } },
    Tabs: {},
    Tab: { close: {}, ax: {} },
    AXAPI: {},
    PlaywrightAPI: {},
    PlaywrightLocator: {},
    BrowserAuthTabCapability: {},
  },
};
async function runtimeScenario(setup: any, version: any, environment?: string) {
  const previous = (globalThis as any).nodeRepl,
    log = console.log;
  const calls: any[] = [],
    outputs: any[] = [],
    decorated: any[] = [];
  const host = {
    env: { CUA_REPL_BROWSER_ENV: environment },
    emitImage(bytes: any) {
      outputs.push({ image: [...bytes], receiver: this === host });
    },
    async rpc(this: any, service: string, args: any) {
      calls.push({ service, args, receiver: this === undefined });
      if (args.method === "setup")
        return {
          apiManifest: manifest,
          disabledMemberIds: ["Tab.close"],
          credentialRecoveryErrorVersion: version,
        };
      const command = args.params;
      let value: any;
      switch (command.type) {
        case "get_browser":
          value = {
            id: "b",
            type: "chrome",
            capabilities: { tab: [{ id: "browserAuth" }] },
            apiSupportOverrides: { "Browser.history": true },
          };
          break;
        case "get_tab":
          value = { id: "t" };
          break;
        case "tab_screenshot":
          value = { data: "AAH/" };
          break;
        case "tab_ax_get_state":
          value = {
            state: "tree",
            data: "AAH/",
            side_effects: ["before observation"],
          };
          break;
        case "browser_user_history":
          value = { items: ["history"] };
          break;
        case "tab_browser_auth_handoff":
          value = { status: "submitted" };
          break;
        default:
          value = {};
      }
      return args.method === "executeWithRecovery"
        ? { ok: true, value }
        : value;
    },
  };
  try {
    (globalThis as any).nodeRepl = host;
    console.log = (value: any) => outputs.push(value);
    const agent = await setup({
      undocumentedApiMembers: ["Tab.ax"],
      excludedDocumentation: ["confirmations"],
      decorateTab(tab: any) {
        decorated.push(tab.id);
        tab.decorated = true;
      },
    });
    const browser = await agent.browsers.get("b"),
      tab = await browser.tabs.get("t");
    const summary = {
      closed: tab.close,
      hasClose: "close" in tab,
      decorated: tab.decorated,
      stable: tab.playwright === tab.playwright,
      bytes: [...(await tab.screenshot())],
      history: await browser.history(),
    };
    await tab.ax.write("both");
    const selector = tab.playwright.getByLabel("Password");
    const auth = await tab.capabilities.get("browserAuth");
    const authResult = await auth.request({
      origin: "https://example.com",
      account_identifier: "alice",
      fields: [
        {
          id: "password",
          label: "Password",
          type: "password",
          required: true,
          selector,
        },
      ],
    });
    return { calls, outputs, decorated, summary, authResult };
  } finally {
    (globalThis as any).nodeRepl = previous;
    console.log = log;
  }
}
test("setup → service RPC → browser → decorated Tab → observation/auth retains original routing and proxy unwrapping", async () => {
  for (const version of [undefined, 1, "1"])
    assert.deepEqual(
      await runtimeScenario(setupBrowserRuntime, version),
      await runtimeScenario(original.setupBrowserRuntime, version),
    );
});
async function factoryScenario(Factory: any) {
  const decorated: any[] = [],
    events: any[] = [];
  const factory = new Factory({
    apiManifest: manifest,
    disabledMemberIds: new Set(["Tab.close"]),
    decorateTab(tab: any) {
      decorated.push(tab.id);
    },
  });
  const transport = {
    display: async () => {},
    send: async ({ command }: any) => {
      events.push(command.toJSON());
      return { id: "t" };
    },
  };
  const create = factory.createBrowser;
  const browser = create({
    browserInfo: {
      id: "b",
      type: "chrome",
      apiSupportOverrides: { "Tab.close": true },
    },
    onBrowserUsed: () => events.push("used"),
    transport,
  });
  const tab = await browser.tabs.get("t");
  await browser.documentation();
  return {
    keys: Object.keys(factory),
    history: browser.history,
    close: tab.close,
    decorated,
    events,
    methodStable: browser.documentation === browser.documentation,
  };
}
test("factory retains lexical createBrowser, global disables, provider defaults, wrapping and notification", async () => {
  assert.deepEqual(
    await factoryScenario(BrowserRuntimeFactory),
    await factoryScenario(original.jm),
  );
});
test("factory rejects invalid runtime interface names like original, including inherited namespace members", async () => {
  for (const name of [
    "missing",
    "Commands",
    "generateRequestId",
    "isRegExp",
    "toString",
  ]) {
    const options = {
      apiManifest: { interfaces: { [name]: {} } },
      disabledMemberIds: new Set(),
    };
    const summarize = (Factory: any) => () => {
      new Factory(options);
      return "accepted";
    };
    assert.deepEqual(
      await outcome(summarize(BrowserRuntimeFactory)),
      await outcome(summarize(original.jm)),
    );
  }
});
test("setup requires trusted host RPC and preserves setup failure without starting command execution", async () => {
  const previous = (globalThis as any).nodeRepl;
  try {
    for (const host of [undefined, {}, { rpc: 1 }]) {
      (globalThis as any).nodeRepl = host;
      assert.deepEqual(
        await outcome(() => setupBrowserRuntime()),
        await outcome(() => original.setupBrowserRuntime()),
      );
    }
    const error = new Error("setup failed");
    let calls = 0;
    (globalThis as any).nodeRepl = {
      rpc: async () => {
        calls++;
        throw error;
      },
    };
    await assert.rejects(setupBrowserRuntime(), (value) => value === error);
    assert.equal(calls, 1);
  } finally {
    (globalThis as any).nodeRepl = previous;
  }
});

async function setupFailureScenario(
  setup: any,
  env: string | undefined,
  version: any,
  kind: string,
) {
  const previous = (globalThis as any).nodeRepl;
  const calls: any[] = [];
  const security =
    await import("../packages/browser/dist/errors/browser_security_error.js");
  const failure = new Error(
    security.SECURITY_REJECTED_PREFIX +
      " test" +
      security.SECURITY_REJECTED_SUFFIX,
  );
  try {
    (globalThis as any).nodeRepl = {
      env: { CUA_REPL_BROWSER_ENV: env },
      rpc: async (service: string, args: any) => {
        calls.push({ service, args });
        if (args.method === "setup")
          return {
            apiManifest: manifest,
            disabledMemberIds: [],
            credentialRecoveryErrorVersion: version,
          };
        if (kind === "throw") throw failure;
        if (kind === "valid")
          return {
            ok: false,
            error: {
              schema_version: 1,
              command: "list_browsers",
              phase: "command",
              reason: "credential_delivery_in_progress",
              next_action: "retry_after_credential_delivery",
            },
          };
        return { ok: "true", value: [] };
      },
    };
    const agent = await setup({ environment: "cloud" });
    try {
      return { value: await agent.browsers.list(), calls };
    } catch (error) {
      return {
        error: {
          name: error.name,
          message: error.message,
          details: error.details,
          same: error === failure,
          frozen: error.details ? Object.isFrozen(error.details) : undefined,
        },
        calls,
      };
    }
  } finally {
    (globalThis as any).nodeRepl = previous;
  }
}
test("setup wiring preserves Orbit-only error rewriting, explicit setup environment and strict recovery envelopes", async () => {
  for (const env of [undefined, "orbit"])
    for (const kind of ["throw", "valid", "invalid"])
      assert.deepEqual(
        await setupFailureScenario(setupBrowserRuntime, env, 1, kind),
        await setupFailureScenario(original.setupBrowserRuntime, env, 1, kind),
      );
});
test("workspace package root exports the same installed bundle entry point", async () => {
  const entry = await import("@core/browser");
  const installed = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  assert.deepEqual(Object.keys(entry), Object.keys(installed));
  assert.equal(entry.setupBrowserRuntime, setupBrowserRuntime);
});
