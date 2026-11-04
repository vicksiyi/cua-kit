import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { originalStatsigEvaluationStore } from "./extension-statsig-source";
import { ExtensionStatsigEvaluationStore } from "../packages/browser-extension/src/statsig_live_store";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const { _DJB2, _getFullUserHash } = require("@statsig/client-core");
const user = { userID: "fixture-user" };
function values(
  time: number,
  live: string[],
  hashed: boolean,
  version: number,
) {
  const key = (name: string) => (hashed ? _DJB2(name) : name);
  return {
    has_updates: true,
    time,
    feature_gates: {
      [key("gate")]: {
        name: key("gate"),
        value: version > 0,
        rule_id: `r${version}`,
      },
    },
    dynamic_configs: {
      [key("config")]: {
        name: key("config"),
        value: { version },
        rule_id: `r${version}`,
      },
      base: { name: "base", value: { version }, rule_id: "base" },
    },
    layer_configs: {
      [key("layer")]: {
        name: key("layer"),
        value: { version },
        rule_id: `r${version}`,
      },
    },
    param_stores: {},
    live_entity_names: {
      feature_gates: live.includes("gate") ? [key("gate"), key("missing")] : [],
      dynamic_configs: live.includes("config") ? [key("config")] : [],
      experiments: [],
      layer_configs: live.includes("layer") ? [key("layer")] : [],
    },
    derived_fields: { version },
    full_checksum: `c${version}`,
  };
}
test("live evaluation store matches base/overlay/retained values, cursors and reset", () => {
  const Original = originalStatsigEvaluationStore();
  for (const mode of [
    "normal",
    "hashed",
    "disabled",
    "wrong-user",
    "bootstrap",
    "warnings",
    "no-live-seed",
  ]) {
    const outputs = [];
    for (const Store of [Original, ExtensionStatsigEvaluationStore]) {
      const store: any = new Store("fixture-store", {}, mode !== "disabled");
      const trace: any[] = [];
      const snapshot = () => {
        const view = {
          gate: store.getGate("gate"),
          config: store.getConfig("config"),
          layer: store.getLayer("layer"),
          missing: store.getGate("missing"),
          param: store.getParamStore("none"),
          list: store.getConfigList(),
          source: store.getCurrentSourceDetails(),
          cursor: store.getLiveCursor(),
          values: store.getValues(),
        };
        trace.push(structuredClone(view));
        // Returned warning arrays must be detached from retained records.
        view.gate.details.warnings?.push("caller-mutation");
      };
      const seed = (time: number, version: number, includeLive = true) => {
        const data: any = values(
          time,
          ["gate", "config", "layer"],
          mode === "hashed",
          version,
        );
        if (!includeLive) delete data.live_entity_names;
        trace.push(
          store.setValues(
            {
              data: JSON.stringify(data),
              source: mode === "bootstrap" ? "Bootstrap" : "Network",
              receivedAt: time + 1,
              fullUserHash:
                mode === "wrong-user" ? "wrong" : _getFullUserHash(user),
            },
            user,
            time + 2,
          ),
        );
      };
      snapshot();
      seed(10, 0, mode !== "no-live-seed");
      if (mode === "warnings") store._warnings.add("PartialUserMatch");
      snapshot();
      trace.push(
        store.advanceLiveCursor(9),
        store.advanceLiveCursor(11),
        store.advanceLiveCursor(NaN),
      );
      snapshot();
      trace.push(
        store.setLiveValues(
          values(12, ["gate", "config", "layer"], mode === "hashed", 1),
          20,
        ),
      );
      snapshot();
      trace.push(store.setLiveValues(values(11, [], false, 2), 21));
      snapshot();
      trace.push(store.setLiveValues(values(13, [], false, 2), 22));
      snapshot();
      seed(11, 9);
      snapshot(); // new base must not erase a newer live cursor/retained value
      trace.push(
        store.setLiveValues(
          values(14, ["gate", "config", "layer"], false, 3),
          23,
        ),
      );
      snapshot();
      trace.push(store.setLiveValues(values(15, [], false, 4), 24));
      snapshot();
      seed(16, 5, false);
      snapshot();
      trace.push(
        store.setValues(
          { data: '{"has_updates":false}', source: "Cache", receivedAt: 30 },
          user,
        ),
      );
      snapshot();
      store.reset();
      snapshot();
      store.finalize();
      snapshot();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("live store preserves V2/reset, malformed names and detached returned values", () => {
  const outputs = [];
  for (const Store of [
    originalStatsigEvaluationStore(),
    ExtensionStatsigEvaluationStore,
  ]) {
    const store: any = new Store("fixture-v2", {}, true);
    const trace: any[] = [];
    function set(value: any) {
      try {
        trace.push([
          "set",
          store.setValues(
            {
              data: JSON.stringify(value),
              source: "Network",
              receivedAt: 100,
              fullUserHash: _getFullUserHash(user),
            },
            user,
            200,
          ),
        ]);
      } catch (error) {
        trace.push(["error", (error as Error).name]);
      }
      trace.push([
        store.getLiveCursor(),
        store.getSource(),
        store.getCurrentSourceDetails(),
      ]);
    }
    set(values(10, ["gate", "config"], false, 1));
    const external = store.getValues();
    external.feature_gates.gate.value = "mutated";
    trace.push(store.getGate("gate"));
    set({ ...values(11, [], false, 2), response_format: "init-v2" });
    trace.push(store.advanceLiveCursor(15));
    set({ ...values(12, [], false, 3), live_entity_names: {} });
    trace.push(store.getConfigList());
    store.reset();
    trace.push(store.getCurrentSourceDetails());
    outputs.push(structuredClone(trace));
  }
  assert.deepEqual(outputs[1], outputs[0]);
});
