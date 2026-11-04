import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings, extensionFunctionCalls } from "./extension-source";
import { createTabAudioController } from "../packages/browser-extension/src/tab_audio";
function setup(
  original: boolean,
  chrome: any,
  observedIds = new Set<number>(),
) {
  let changed: (ids: number[]) => Promise<void>;
  const publications: number[][] = [];
  const observed = {
      isObserved: (id: number) => observedIds.has(id),
      setChangeHandler(fn: any) {
        changed = fn;
      },
    },
    overlay = {
      async republishTabStates(ids: number[]) {
        publications.push([...ids]);
      },
    };
  let api;
  if (original) {
    const Ra = new Set(),
      Oa = new Set();
    const bindings = extensionBindings(["Vu", "lS", "Wu", "Ku"], {
      chrome,
      Ra,
      Oa,
    });
    extensionFunctionCalls(null, ["hi.setChangeHandler"], {
      hi: observed,
      Ie: overlay,
      Ra,
      Oa,
      lS: bindings.lS,
    });
    api = {
      muteBackgroundTab: bindings.Vu,
      restoreTabAudio: bindings.Wu,
      restoreTabsAudio: bindings.lS,
    };
  } else {
    api = createTabAudioController(chrome);
    api.installObservedChangeHandler(observed, overlay);
  }
  return {
    api,
    change: (ids: number[]) => changed(ids),
    publications,
    observedIds,
  };
}
test("tab audio matches original active/muted ownership guards and swallowed tab failures", async () => {
  const run = async (original: boolean) => {
    const traces: any[] = [];
    for (const active of [false, true])
      for (const mutedInfo of [
        undefined,
        { muted: false },
        { muted: true, reason: "user" },
        { muted: true, reason: "extension", extensionId: "other" },
        { muted: true, reason: "extension", extensionId: "ours" },
      ]) {
        const trace: any[] = [],
          tab = { id: 1, active, mutedInfo: structuredClone(mutedInfo) };
        const chrome: any = {
          runtime: { id: "ours" },
          tabs: {
            async get(id: number) {
              trace.push(["get", id]);
              if (id === 404) throw Error("missing");
              return structuredClone(tab);
            },
            async update(id: number, info: any) {
              trace.push(["update", id, info]);
              if (id === 403) throw Error("denied");
              tab.mutedInfo = {
                muted: info.muted,
                reason: "extension",
                extensionId: "ours",
              };
              return tab;
            },
          },
        };
        const { api, change, observedIds, publications } = setup(
          original,
          chrome,
        );
        await api.muteBackgroundTab(1);
        observedIds.add(1);
        await change([1, 2]);
        await api.muteBackgroundTab(403);
        await api.muteBackgroundTab(404);
        await api.restoreTabsAudio([1, 403, 404]);
        traces.push({ trace, tab, publications });
      }
    return traces;
  };
  const actual = await run(false);
  assert.deepEqual(actual, await run(true));
  // An inactive unmuted tab is muted then restored on observation.
  assert.deepEqual(
    actual[0].trace.filter((entry: any) => entry[0] === "update").slice(0, 2),
    [
      ["update", 1, { muted: true }],
      ["update", 1, { muted: false }],
    ],
  );
  // User-owned and other-extension muting remain untouched.
  assert.equal(actual[2].tab.mutedInfo.muted, true);
  assert.equal(actual[3].tab.mutedInfo.muted, true);
});
test("tab activation racing a pending mute restores audio after the mute completes", async () => {
  const run = async (original: boolean, failMute: boolean) => {
    let completeMute!: () => void;
    const gate = new Promise<void>((resolve) => {
      completeMute = resolve;
    });
    const trace: any[] = [],
      tab = {
        id: 1,
        active: false,
        mutedInfo: { muted: false, reason: "extension", extensionId: "ours" },
      };
    let block = true;
    const chrome: any = {
      runtime: { id: "ours" },
      tabs: {
        async get(id: number) {
          trace.push(["get", id, tab.mutedInfo.muted]);
          return structuredClone(tab);
        },
        async update(id: number, info: any) {
          trace.push(["update-begin", id, info]);
          if (block && info.muted) {
            await gate;
            if (failMute) throw Error("mute failed");
          }
          tab.mutedInfo.muted = info.muted;
          trace.push(["update-end", id, info]);
          return tab;
        },
      },
    };
    const { api, change, observedIds, publications } = setup(original, chrome);
    const muting = api.muteBackgroundTab(1);
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(trace.some((row) => row[0] === "update-begin"));
    tab.active = true;
    observedIds.add(1);
    await change([1]);
    completeMute();
    await muting;
    const afterRace = structuredClone(tab);
    // Pending/restore sets must have been cleared, including when update failed.
    block = false;
    tab.active = false;
    observedIds.delete(1);
    await api.muteBackgroundTab(1);
    return { trace, afterRace, final: tab, publications };
  };
  for (const failure of [false, true]) {
    const actual = await run(false, failure);
    assert.deepEqual(actual, await run(true, failure));
    assert.equal(actual.afterRace.mutedInfo.muted, false);
    assert.equal(actual.final.mutedInfo.muted, true);
  }
});
