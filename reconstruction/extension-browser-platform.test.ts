import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  browserFamilies,
  chromiumExtensionChannels,
  extensionDistributions,
} from "../packages/browser/src/service/browser_family";
import {
  identifyBrowserFamily,
  isBrowserInternalTab,
  isBrowserNewTab,
  extensionBuildChannel,
} from "../packages/browser-extension/src/browser_platform";
const original = extensionBindings(["Ue", "Ap", "uc", "Jt", "Cn", "dc", "Rr"], {
  An: chromiumExtensionChannels,
  Zt: extensionDistributions,
  Km: "prod",
});
const outcome = (fn: () => unknown) => {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { name: error.name, message: error.message };
  }
};

test("extension reuses the original browser family table and preserves rightmost-token detection", () => {
  assert.deepEqual(browserFamilies, original.Ue);
  assert.equal(
    browserFamilies.chrome.extensionChannels,
    browserFamilies.brave.extensionChannels,
  );
  const tokens = Object.values(browserFamilies).flatMap(
    (info) => info.userAgentIdentifiers,
  );
  const agents = [
    "",
    "unknown",
    "chrome/",
    "Mozilla Chrome/100 Edg/101",
    "Brave/1 Chrome/2",
    ...tokens,
  ];
  for (const left of tokens)
    for (const right of tokens) agents.push(`${left}1 ${right}2 ${left}3`);
  for (const agent of agents)
    for (const brave of [false, true])
      assert.equal(
        identifyBrowserFamily(agent, brave),
        original.Jt(agent, brave),
        agent,
      );
});

test("extension internal/new-tab URLs and build-channel parsing retain original exact boundaries", () => {
  const urls: any[] = [
    undefined,
    null,
    "",
    "https://example.test",
    "chrome://newtab",
    "chrome://newtab/",
    "chrome://newtab/?x=1",
    "CHROME://newtab/",
    {},
    7,
  ];
  for (const info of Object.values(browserFamilies))
    for (const scheme of info.internalUrlSchemes)
      for (const path of [
        "newtab/",
        "new-tab-page/",
        "new-tab-page-third-party/",
        "settings",
        "extensions",
        "",
      ])
        urls.push(`${scheme}://${path}`);
  for (const family of [
    ...Object.keys(browserFamilies),
    "missing",
    "__proto__",
  ])
    for (const url of urls) {
      // Error wording names minified properties differently; error type and successful values are contractual here.
      for (const [restored, source] of [
        [isBrowserInternalTab, original.Cn],
        [isBrowserNewTab, original.dc],
      ]) {
        const a = outcome(() => restored(family, url)),
          b = outcome(() => source(family, url));
        assert.equal(a.name, b.name);
        assert.deepEqual(a.value, b.value);
      }
    }
  for (const value of [
    undefined,
    null,
    0,
    {},
    [],
    false,
    "dev",
    "internal",
    "prod",
    "",
    "production",
    "DEV",
  ])
    assert.deepEqual(
      outcome(() => extensionBuildChannel(value)),
      outcome(() => original.Rr(value)),
    );
});
