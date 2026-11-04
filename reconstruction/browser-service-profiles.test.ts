import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createBrowserProfileReader,
  browserProfileDirectory,
} from "../packages/browser/src/service/runtime/browser_profiles";
import { browserFamilies } from "../packages/browser/src/service/browser_family";
import { serviceExpression, originalServiceBindings } from "./service-source";
test("profile paths and instance database lifecycle preserve original success and failure order", async () => {
  for (const family of Object.keys(browserFamilies))
    for (const platform of ["darwin", "linux", "win32", "other"])
      for (const environment of [
        {},
        {
          CHROME_CONFIG_HOME: "/chrome",
          XDG_CONFIG_HOME: "/xdg",
          LOCALAPPDATA: "C:\\local",
        },
        { XDG_CONFIG_HOME: "/xdg" },
      ]) {
        const original = originalServiceBindings(["x6"], {
          sl: browserFamilies,
          Mx: path.posix,
          S6: path.win32,
          Ox: { homedir: () => "/synthetic-home" },
          Nx: environment,
        }).x6;
        const run = (fn: any) => {
          try {
            return fn(family, platform);
          } catch (error: any) {
            return error.message;
          }
        };
        assert.deepEqual(
          run((f: string, p: string) =>
            browserProfileDirectory(f, p, environment, "/synthetic-home"),
          ),
          run(original),
        );
      }
  for (const mode of [
    "normal",
    "absent",
    "module-error",
    "module-null",
    "temporary-error",
    "copy-error",
    "lock-error",
    "constructor-error",
    "open-error",
    "get-error",
    "empty",
    "json-error",
    "not-string",
    "close-error",
    "remove-error",
  ]) {
    async function run(original: boolean) {
      const trace: any[] = [];
      const invoke = (name: string, ...args: any[]) => {
        trace.push([name, ...args]);
        if (mode === name + "-error") throw Error(name);
      };
      const filesystem: any = {
        exists: (p: string) => {
          invoke("exists", p);
          return mode !== "absent";
        },
        loadClassicLevel: async () => {
          invoke("module");
          return mode === "module-null"
            ? null
            : {
                ClassicLevel: class {
                  constructor(...args: any[]) {
                    invoke("constructor", ...args);
                  }
                  async open() {
                    invoke("open");
                  }
                  async get(key: string) {
                    invoke("get", key);
                    return mode === "empty"
                      ? ""
                      : mode === "json-error"
                        ? "{"
                        : mode === "not-string"
                          ? "42"
                          : '"synthetic-instance"';
                  }
                  async close() {
                    invoke("close");
                  }
                },
              };
        },
        makeTemporary: async (p: string) => {
          invoke("temporary", p);
          return "/synthetic-temp";
        },
        copy: async (...args: any[]) => {
          invoke("copy", ...args);
        },
        remove: async (p: string, options: any) => {
          invoke(p.endsWith("LOCK") ? "lock" : "remove", p, options);
        },
      };
      const deps = {
        ...filesystem,
        temporaryDirectory: () => "/synthetic-root",
        reportError() {},
      };
      const expression = serviceExpression("T6").replace(
        /import\(["']\.\.\/node_modules\/classic-level\.mjs["']\)/,
        "loadClassicLevel()",
      );
      assert.notEqual(expression, serviceExpression("T6"));
      const external = {
        Fx: path.resolve,
        hle: filesystem.exists,
        loadClassicLevel: filesystem.loadClassicLevel,
        fle: filesystem.makeTemporary,
        gle: deps.temporaryDirectory,
        mle: filesystem.copy,
        E6: filesystem.remove,
      };
      const fn = original
        ? new Function(...Object.keys(external), `return (${expression});`)(
            ...Object.values(external),
          )
        : createBrowserProfileReader(deps).readInstanceId;
      try {
        trace.push([
          "result",
          await fn("/synthetic-browser", "Default", "extension"),
        ]);
      } catch (error: any) {
        trace.push(["error", error.message]);
      }
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("profile list and per-profile errors match original metadata and catch boundaries", async () => {
  for (const mode of ["normal", "instance-error", "invalid-state"]) {
    async function run(original: boolean) {
      const trace: any[] = [];
      const state = {
        profile: {
          profiles_order: ["A", "missing", "B"],
          last_used: "B",
          info_cache: {
            A: { name: "Alpha", avatar_icon: "a" },
            B: { name: "Beta" },
          },
        },
      };
      const readText = async (name: string) => {
        trace.push(["read", name]);
        return mode === "invalid-state" ? "{" : JSON.stringify(state);
      };
      const readInstance = async (...args: any[]) => {
        trace.push(["instance", args]);
        if (mode === "instance-error" && args[1] === "A")
          throw Error("instance");
        return null;
      };
      const report = (error: any) => trace.push(["report", error.message]);
      if (original) {
        const { wle } = originalServiceBindings(["_le", "wle"], {
          x6: () => "/synthetic",
          yle: path.resolve,
          ble: readText,
          T6: readInstance,
          Dt: report,
        });
        try {
          trace.push(["result", await wle("chrome", "extension", "darwin")]);
        } catch (error: any) {
          trace.push(["error", error.message]);
        }
      } else {
        const reader = createBrowserProfileReader({
          directory: () => "/synthetic",
          readText,
          loadClassicLevel: async () => null,
          reportError: report,
          exists(p) {
            const profile = p.includes("/A/") ? "A" : "B";
            trace.push(["instance", ["/synthetic", profile, "extension"]]);
            if (mode === "instance-error" && profile === "A")
              throw Error("instance");
            return false;
          },
        });
        try {
          const result = await reader.readProfiles(
            "chrome",
            "extension",
            "darwin",
          );
          trace.push(["result", result]);
        } catch (error: any) {
          trace.push(["error", error.message]);
        }
      }
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("restored profile reader copies and reads a real synthetic ClassicLevel store", async () => {
  const modulePath =
    "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/node_modules/classic-level.mjs";
  const { ClassicLevel } = await import(modulePath);
  const root = await mkdtemp(path.join(tmpdir(), "cua-profile-"));
  const browser = path.join(root, "browser"),
    temporary = path.join(root, "temporary"),
    storage = path.join(
      browser,
      "Default",
      "Local Extension Settings",
      "synthetic-extension",
    );
  try {
    await mkdir(storage, { recursive: true });
    await mkdir(temporary);
    await writeFile(
      path.join(browser, "Local State"),
      JSON.stringify({
        profile: {
          profiles_order: ["Default"],
          last_used: "Default",
          info_cache: { Default: { name: "Synthetic profile" } },
        },
      }),
    );
    const database = new ClassicLevel(storage, {
      keyEncoding: "utf8",
      valueEncoding: "utf8",
    });
    await database.open();
    await database.put(
      "extensionInstanceId",
      JSON.stringify("synthetic-instance"),
    );
    await database.close();
    const reader = createBrowserProfileReader({
      directory: () => browser,
      temporaryDirectory: () => temporary,
      loadClassicLevel: async () => ({ ClassicLevel }),
      reportError(error) {
        throw error;
      },
    });
    const info = await reader.enrichProfile(
      {
        type: "extension",
        metadata: {
          extensionId: "synthetic-extension",
          extensionInstanceId: "synthetic-instance",
        },
      },
      { platform: "darwin" },
    );
    assert.equal(info.metadata.profileName, "Synthetic profile");
    assert.equal(info.metadata.profileIsLastUsed, "true");
    assert.equal(info.metadata.profileOrdering, "0");
    assert.deepEqual(await readdir(temporary), []);
    assert.ok((await readdir(storage)).includes("CURRENT"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default upstream ClassicLevel reads a copied real database and preserves the source", async () => {
  const { ClassicLevel } = await import("classic-level");
  const root = await mkdtemp(path.join(tmpdir(), "cua-real-profile-"));
  const temporary = path.join(root, "temporary");
  const source = path.join(
    root,
    "Default",
    "Local Extension Settings",
    "synthetic-extension",
  );
  await mkdir(temporary, { recursive: true });
  await mkdir(source, { recursive: true });
  const database = new ClassicLevel<string, string>(source, {
    keyEncoding: "utf8",
    valueEncoding: "utf8",
  });
  const errors: unknown[] = [];
  const reader = createBrowserProfileReader({
    reportError: (error) => errors.push(error),
    directory: () => root,
    temporaryDirectory: () => temporary,
  });
  try {
    await database.open();
    await database.put(
      "extensionInstanceId",
      JSON.stringify("synthetic-instance"),
    );
    await database.close();
    await writeFile(
      path.join(root, "Local State"),
      JSON.stringify({
        profile: {
          profiles_order: ["Default"],
          last_used: "Default",
          info_cache: {
            Default: { name: "Synthetic profile", avatar_icon: "fixture" },
          },
        },
      }),
    );
    const profiles = await reader.readProfiles(
      "chrome",
      "synthetic-extension",
      "darwin",
    );
    assert.equal(profiles[0].instanceId, "synthetic-instance");
    assert.deepEqual(errors, []);
    assert.deepEqual(await readdir(temporary), []);
    // Reopening the original proves the copied database was used and cleaned up.
    const original = new ClassicLevel<string, string>(source, {
      createIfMissing: false,
      keyEncoding: "utf8",
      valueEncoding: "utf8",
    });
    try {
      await original.open();
      assert.equal(
        await original.get("extensionInstanceId"),
        JSON.stringify("synthetic-instance"),
      );
      for (const raw of ["42", "{broken", ""]) {
        await original.put("extensionInstanceId", raw);
        await original.close();
        const result = await reader.readProfiles(
          "chrome",
          "synthetic-extension",
          "darwin",
        );
        assert.equal(result[0].instanceId, null);
        assert.deepEqual(await readdir(temporary), []);
        await original.open();
      }
      await original.del("extensionInstanceId");
      await original.close();
      assert.equal(
        await reader.readInstanceId(root, "Default", "synthetic-extension"),
        null,
      );
      assert.deepEqual(await readdir(temporary), []);
      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof SyntaxError);
    } finally {
      await original.close();
    }
  } finally {
    await database.close();
    await rm(root, { recursive: true, force: true });
  }
});
