import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { desktopBindings } from "./desktop-source";
import {
  browserFamilies,
  extensionDistributions,
  chromiumExtensionChannels,
} from "../packages/browser/src/service/browser_family";
import { browserProfileDirectory } from "../packages/browser/src/service/runtime/browser_profiles";
import {
  listBackendPipes,
} from "../packages/browser/src/service/runtime/browser_discovery";
const catalog = desktopBindings(["Dm", "lR", "cR", "Si", "Om", "Wc"]);
test("desktop catalog matches restored family/distribution metadata and reference sharing", () => {
  assert.deepEqual(browserFamilies, catalog.Wc);
  assert.deepEqual(extensionDistributions, catalog.Si);
  assert.deepEqual(chromiumExtensionChannels, catalog.Om);
  for (const family of ["chrome", "brave", "opera", "vivaldi"]) {
    assert.equal(catalog.Wc[family].extensionChannels, catalog.Om);
  }
  assert.equal(catalog.Om.prod.distributions, catalog.Si.chrome.prod);
  assert.equal(catalog.Si.edge.prod[2], catalog.lR);
});
test("desktop profile paths match restored implementation for all families/platforms and environment precedence", () => {
  for (const environment of [
    {},
    {
      CHROME_CONFIG_HOME: "/chrome",
      XDG_CONFIG_HOME: "/xdg",
      LOCALAPPDATA: "C:\\local",
    },
    { XDG_CONFIG_HOME: "/xdg" },
    { CHROME_CONFIG_HOME: "", XDG_CONFIG_HOME: "/xdg", LOCALAPPDATA: "" },
  ]) {
    const original = desktopBindings(["C3"], {
      Wc: catalog.Wc,
      UT: path.posix,
      S3: path.win32,
      FT: { homedir: () => "/synthetic-home" },
      qT: environment,
    }).C3;
    for (const family of Object.keys(browserFamilies))
      for (const platform of ["darwin", "linux", "win32", "unsupported"])
        assert.deepEqual(
          capture(() =>
            browserProfileDirectory(
              family,
              platform,
              environment,
              "/synthetic-home",
            ),
          ),
          capture(() => original(family, platform)),
        );
  }
});
function capture(fn: () => unknown) {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
test("desktop pipe discovery preserves configured path validation, enumeration and deduplication", async () => {
  const cases = [
    { platform: "darwin", env: {} },
    { platform: "win32", env: {} },
    {
      platform: "linux",
      env: { BROWSER_USE_BACKEND_PATHS: "/tmp/a::/tmp/b:/tmp/a" },
    },
    {
      platform: "win32",
      env: { BROWSER_USE_BACKEND_PATHS: "C:\\a;;C:\\b;C:\\a" },
    },
    { platform: "linux", env: { BROWSER_USE_BACKEND_PATHS: "relative" } },
    { platform: "linux", env: { BROWSER_USE_BACKEND_PATHS: " /absolute" } },
    { platform: "linux", env: { BROWSER_USE_BACKEND_PATHS: "" } },
  ];
  for (const runtime of cases)
    for (const failure of [false, true]) {
      async function run(original: boolean) {
        const calls: string[] = [];
        const read = async (directory: string) => {
          calls.push(directory);
          if (failure) throw Error("synthetic enumeration failure");
          return ["codex-browser-use-a", "other", "b"];
        };
        const vendor = desktopBindings(["Gc", "Jce", "Yce", "Xce"], {
          bb: path,
          N3: read,
        });
        try {
          return {
            calls,
            value: await (original
              ? vendor.Xce(runtime)
              : listBackendPipes(runtime, read)),
          };
        } catch (error: any) {
          return { calls, error: error.message };
        }
      }
      assert.deepEqual(await run(false), await run(true));
    }
});
