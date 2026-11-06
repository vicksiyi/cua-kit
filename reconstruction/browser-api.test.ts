import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { create_browser_api: restored } =
  await import("../packages/cua/dist/tinysky_alt/create_browser_api.js");
const { bind_tab: restoredBind } =
  await import("../packages/cua/dist/tinysky_alt/bind_tab.js");
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = (name: string) =>
  pathToFileURL(`${root}/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/${name}.js`)
    .href;
const original = (await import(source("create_browser_api")))
  .create_browser_api;
const originalBind = (await import(source("bind_tab"))).bind_tab;

type Info = { id: string; providerTabId?: string; url: string; title: string };
function fixture(
  factory: any,
  options: {
    managed?: Info[];
    user?: Info[];
    noGoto?: boolean;
    ax?: boolean;
    noDefault?: boolean;
  } = {},
) {
  const log: unknown[] = [];
  const managed = options.managed ?? [
    { id: "m1", providerTabId: "p1", url: "https://a.test/", title: "A" },
  ];
  const user = options.user ?? [
    { id: "u1", providerTabId: "p2", url: "https://b.test/", title: "B" },
  ];
  const tab = {
    id: "bound",
    ...(options.ax ? { ax: {} } : {}),
    getAXState: async (o: unknown) => {
      log.push(["state", o]);
      return "AX";
    },
    close: async () => {
      log.push(["close"]);
    },
    ...(!options.noGoto
      ? {
          goto: async (url: string, options?: unknown) => {
            log.push(["goto", url, options]);
          },
        }
      : {}),
  };
  const browser = {
    browserId: "chrome",
    tabs: {
      list: async () => {
        log.push(["managed"]);
        return structuredClone(managed);
      },
      get: async (id: string) => {
        log.push(["get", id]);
        return tab;
      },
      new: async () => {
        log.push(["new"]);
        return tab;
      },
    },
    user: {
      openTabs: async () => {
        log.push(["user"]);
        return structuredClone(user);
      },
      claimTab: async (info: Info) => {
        log.push(["claim", info]);
        return tab;
      },
    },
    nameSession: async (name: string) => {
      log.push(["name", name]);
    },
    capabilities: {
      get: async (name: string) => {
        log.push(["capability", name]);
        return {
          set: async (value: boolean) => {
            log.push(["visible", value]);
          },
        };
      },
    },
  };
  const providers = {
    get: async (id: string) => {
      log.push(["browser", id]);
      return browser;
    },
    list: async () => {
      log.push(["listBrowsers"]);
      return [
        {
          id: "chrome",
          type: "extension",
          metadata: { extensionInstanceId: "profile" },
        },
      ];
    },
    ...(!options.noDefault
      ? {
          getDefault: async () => {
            log.push(["default"]);
            return browser;
          },
        }
      : {}),
    getForUrl: async (url: string) => {
      log.push(["forUrl", url]);
      return browser;
    },
  };
  const bootstrap = {
    load_browser_documentation: async (b: any) => {
      log.push(["docs", b.browserId]);
    },
    emit: async (value: any, opts: any) => {
      log.push([
        "emit",
        value,
        opts ? { ...opts, browser: opts.browser?.browserId } : opts,
      ]);
    },
  };
  return { api: factory(providers, bootstrap), log };
}
async function trace(
  factory: any,
  method: string,
  args: any[],
  options: any = {},
) {
  const f = fixture(factory, options);
  let result: unknown;
  try {
    const value = await f.api[method](...args);
    result = { ok: true, value: value?.id ?? value?.browserId ?? value };
  } catch (error) {
    result = { ok: false, error: (error as Error).message };
  }
  return { log: f.log, result };
}
test("create_browser_api reconstruction matches original calls/results/errors", async () => {
  const cases: Array<[string, any[], any?]> = [
    ["getBrowser", []],
    ["getBrowser", [{ url: "example.com" }]],
    ["getBrowser", [{ extensionInstanceId: "profile" }]],
    ["getBrowser", [{ id: "chrome", extensionInstanceId: "profile" }]],
    ["getBrowser", [], { noDefault: true }],
    [
      "createBrowserTab",
      ["chrome", "example.com", { sessionName: "Task", visible: false }],
    ],
    ["createBrowserTab", ["chrome"]],
    ...[
      undefined,
      "about:blank",
      "https://x.test",
      "http://x.test",
      "x.test",
    ].map(
      (url) =>
        ["createBrowserTab", ["chrome", url], { ax: true }] as [
          string,
          any[],
          any,
        ],
    ),
    ["createBrowserTab", ["chrome", "https://x.test"], { noGoto: true }],
    ["createBrowserTab", [""]],
    ["getTab", ["m1"]],
    ["getTab", ["p2"]],
    ["getTab", ["missing"]],
    ["getTab", [{ url: "https://b.test/" }, { browser: "chrome" }]],
    ["getTab", [{ url: "https://b.test/" }]],
    ["getTab", [{ url: "relative" }, { browser: "chrome" }]],
    [
      "getTab",
      ["p1"],
      {
        managed: [{ id: "m1", url: "https://a.test/", title: "A" }],
        user: [
          { id: "m1", providerTabId: "p1", url: "https://a.test/", title: "A" },
        ],
      },
    ],
    [
      "getTab",
      ["m1"],
      { managed: [{ id: "m1", url: "chrome://newtab/", title: "New" }] },
    ],
    [
      "getTab",
      [{ url: "https://a.test/" }, { browser: "chrome" }],
      { user: [{ id: "other", url: "https://a.test/", title: "Other" }] },
    ],
    [
      "getTab",
      [
        {
          mention:
            "plugin://chrome@openai-bundled/?mention=tab-v1&browserId=profile&tabId=p1&title=A&url=https%3A%2F%2Fa.test%2F",
        },
      ],
    ],
    [
      "getTab",
      [
        {
          mention:
            "plugin://chrome@openai-bundled/?mention=tab-v1&browserId=profile&tabId=p1&title=Old&url=https%3A%2F%2Fa.test%2F",
        },
      ],
    ],
    ["listTabs", []],
    ["listTabs", [{ browser: "chrome", emit: false }]],
    ["listBrowsers", [{ emit: false }]],
  ];
  for (const [method, args, options] of cases)
    assert.deepEqual(
      await trace(restored, method, args, options),
      await trace(original, method, args, options),
      `${method} ${JSON.stringify(args)}`,
    );
});

test("bind_tab reconstruction preserves mutation, forwarding, emit and sync errors", async () => {
  async function run(bind: any, fallback: boolean) {
    const log: unknown[] = [];
    const globals = globalThis as any;
    const previous = globals.nodeRepl;
    globals.nodeRepl = {
      write: async (...args: any[]) => {
        log.push(["write", ...args]);
      },
      emitImage: async (...args: any[]) => {
        log.push(["image", ...args]);
      },
    };
    try {
      const input: any = {
        id: "t",
        ...(fallback
          ? {
              playwright: {
                domSnapshot: async () => {
                  log.push(["dom"]);
                  return "DOM";
                },
              },
              screenshot: async () => {
                log.push(["shot"]);
                return new Uint8Array([1, 2]);
              },
            }
          : {
              ax: new Proxy(
                {},
                {
                  get:
                    (_, method) =>
                    async (...args: any[]) => {
                      log.push([method, ...args]);
                      return method === "get"
                        ? args[0] === "both"
                          ? { state: "AX", screenshot: new Uint8Array([1]) }
                          : args[0] === "screenshot"
                            ? new Uint8Array([2])
                            : "AX"
                        : undefined;
                    },
                },
              ),
            }),
      };
      const tab = bind(input);
      assert.equal(tab, input);
      await tab.getAXState({ disableDiffing: true });
      await tab.getScreenshot({ emit: false });
      await tab.getAXStateAndScreenshot();
      if (!fallback) {
        await tab.click([1, 2], {
          durationMs: 123,
          key: "Shift",
          mouseButton: "right",
        });
        await tab.pressKey(null, "Enter", { durationMs: 0 });
        await tab.paste(0, "hello", { format: "html" });
        await tab.typeText(null, "x");
      }
      for (const [method, args] of [
        ["typeText", [-1, "x"]],
        ["click", [1, { durationMs: 30001 }]],
        ["paste", [-1, "x"]],
      ] as any) {
        let sync = true;
        try {
          const p = tab[method](...args);
          sync = false;
          await p;
        } catch (e) {
          log.push(["error", method, sync, (e as Error).message]);
        }
      }
      return log;
    } finally {
      globals.nodeRepl = previous;
    }
  }
  for (const fallback of [false, true])
    assert.deepEqual(
      await run(restoredBind, fallback),
      await run(originalBind, fallback),
    );
});

test("two retained tab bindings route alternating edits and observations independently, matching original", async () => {
  async function run(factory: any) {
    const trace: unknown[] = [];
    const records = ["a", "b"].map(id => ({ id, url: `https://fixture.invalid/${id}`, title: id }));
    const values = new Map(records.map(({ id }) => [id, ""]));
    const tabs = new Map(records.map(({ id }) => [id, {
      id,
      getAXState: async () => { trace.push(["observe", id, values.get(id)]); return values.get(id); },
      playwright: { getByRole: () => ({ fill: async (text: string) => {
        trace.push(["fill", id, text]); values.set(id, text);
      } }) },
    }]));
    const browser = { browserId: "chrome", tabs: {
      list: async () => records, get: async (id: string) => tabs.get(id),
    } };
    const api = factory({ get: async () => browser }, {
      load_browser_documentation: async () => {}, emit: async () => {},
    });
    const a = await api.getTab("a", { browser: "chrome" });
    const b = await api.getTab("b", { browser: "chrome" });
    assert.notEqual(a, b);
    await a.playwright.getByRole("textbox").fill("edit A");
    await b.playwright.getByRole("textbox").fill("edit B");
    assert.equal(await a.getAXState(), "edit A");
    assert.equal(await b.getAXState(), "edit B");
    return trace;
  }
  assert.deepEqual(await run(restored), await run(original));
});
