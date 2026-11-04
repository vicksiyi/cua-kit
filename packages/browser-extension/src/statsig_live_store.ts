import EvaluationStore from "@statsig/js-client/src/EvaluationStore";
import { V1InitializeContainer } from "@statsig/js-client/src/V1InitializeContainer";
import { V2InitializeContainer } from "@statsig/js-client/src/V2InitializeContainer";
import {
  _DJB2,
  _getFullUserHash,
  _typedJsonParse,
  SDKFlags,
  type DataAdapterResult,
  type StatsigUser,
} from "@statsig/client-core";
// Node ESM exposes this upstream CommonJS default as a module object; bundlers may unwrap it.
const StoreBase = ((
  EvaluationStore as unknown as { default?: typeof EvaluationStore }
).default ?? EvaluationStore) as unknown as new (
  ...args: ConstructorParameters<typeof EvaluationStore>
) => Record<string, any>;
const categories = [
  "feature_gates",
  "dynamic_configs",
  "layer_configs",
] as const;
type Category = (typeof categories)[number];
type Names = Record<Category, Set<string>>;
type Retained = Record<Category, Map<string, { result: any; details: any }>>;
interface LiveState {
  values: V1InitializeContainer;
  entityNames: Names;
  retainedValues: Retained;
  source: string;
  lcut: number;
  receivedAt: number;
  loadedAt: number;
  cursor: { previousDerivedFields: unknown; fullChecksum?: string } | null;
}
function names(input: any): Names {
  return {
    feature_gates: new Set(input.feature_gates),
    dynamic_configs: new Set([...input.dynamic_configs, ...input.experiments]),
    layer_configs: new Set(input.layer_configs),
  };
}
function emptyRetained(): Retained {
  return {
    feature_gates: new Map(),
    dynamic_configs: new Map(),
    layer_configs: new Map(),
  };
}
function withHashes(input: Set<string>) {
  const output = new Set(input);
  input.forEach((name) => output.add(_DJB2(name)));
  return output;
}
function matches(input: Set<string>, name: string) {
  return input.has(name) || input.has(_DJB2(name));
}
/** Bundled qm delta, reusing upstream evaluation containers and ordinary store helpers. */
export class ExtensionStatsigEvaluationStore extends StoreBase {
  private live: LiveState | null = null;
  private loadedAt: number | undefined;
  constructor(
    key: string,
    options: ConstructorParameters<typeof EvaluationStore>[1],
    private liveEnabled = false,
  ) {
    super(key, options);
  }
  reset() {
    super.reset();
    this.loadedAt = undefined;
    this.live = null;
  }
  setValues(
    result: DataAdapterResult | null,
    user: StatsigUser,
    loadedAt?: number,
  ) {
    if (!result) return false;
    const value = _typedJsonParse<any>(
      result.data,
      "has_updates",
      "EvaluationResponse",
    );
    if (value == null) return false;
    this._source = result.source;
    if (value.has_updates !== true || (value.time ?? 0) < this._lcut)
      return true;
    this._valuesForExternalUse = _typedJsonParse<any>(
      result.data,
      "has_updates",
      "EvaluationResponse",
    );
    this._lcut = value.time;
    this._receivedAt = result.receivedAt;
    const time = loadedAt ?? Date.now();
    this.loadedAt = time;
    if (value.response_format === "init-v2") {
      this._values = new V2InitializeContainer(value);
      this.live = null;
    } else {
      this._values = new V1InitializeContainer(value);
      if (this.live?.cursor == null || value.time >= this.live.lcut)
        this.seedLive(value, result, user, time);
    }
    this._bootstrapMetadata = this._extractBootstrapMetadata(
      result.source,
      value,
    );
    if (result.source && value.user) this._setWarningState(user, value);
    SDKFlags.setFlags(this._sdkKey, value.sdk_flags ?? {});
    return true;
  }
  private seedLive(
    value: any,
    result: DataAdapterResult,
    user: StatsigUser,
    time: number,
  ) {
    if (
      !this.liveEnabled ||
      value.has_updates !== true ||
      !("live_entity_names" in value) ||
      value.live_entity_names == null
    ) {
      this.live = null;
      return;
    }
    const sameUser =
      result.fullUserHash != null &&
      result.fullUserHash === _getFullUserHash(user);
    this.live = {
      values: new V1InitializeContainer(value),
      entityNames: names(value.live_entity_names),
      retainedValues: emptyRetained(),
      source: result.source,
      lcut: value.time,
      receivedAt: result.receivedAt,
      loadedAt: time,
      cursor: sameUser ? { previousDerivedFields: value.derived_fields } : null,
    };
  }
  private lookup(
    category: Category,
    method: "getGate" | "getConfig" | "getLayer",
    name: string,
  ): any {
    const live = this.live;
    if (live && matches(live.entityNames[category], name)) {
      const result = live.values[method](name);
      return { result, details: this.liveDetails(result == null, live) };
    }
    const retained = live
      ? (live.retainedValues[category].get(name) ??
        live.retainedValues[category].get(_DJB2(name)))
      : undefined;
    if (retained) {
      const details = { ...retained.details };
      if (details.warnings) details.warnings = [...details.warnings];
      return { result: retained.result, details };
    }
    return this._getDetailedStoreResult(
      this._values ? this._values[method](name) : null,
    );
  }
  getGate(name: string) {
    return this.lookup("feature_gates", "getGate", name);
  }
  getConfig(name: string) {
    return this.lookup("dynamic_configs", "getConfig", name);
  }
  getLayer(name: string) {
    return this.lookup("layer_configs", "getLayer", name);
  }
  getConfigList() {
    const live = this.live;
    if (!live) return this._values?.getConfigList() ?? [];
    const current = live.entityNames.dynamic_configs;
    const retained = new Set(live.retainedValues.dynamic_configs.keys());
    const currentHashes = withHashes(current),
      retainedHashes = withHashes(retained);
    const base =
      this._values
        ?.getConfigList()
        .filter(
          (name: string) =>
            !matches(currentHashes, name) && !matches(retainedHashes, name),
        ) ?? [];
    const overlay = live.values
      .getConfigList()
      .filter((name) => current.has(name));
    return [...new Set<string>([...base, ...overlay, ...retained])];
  }
  getLiveCursor() {
    const live = this.live;
    return live?.cursor == null
      ? {}
      : {
          sinceTime: live.lcut,
          previousDerivedFields: live.cursor.previousDerivedFields,
          ...(live.cursor.fullChecksum == null
            ? {}
            : { fullChecksum: live.cursor.fullChecksum }),
        };
  }
  advanceLiveCursor(time: number) {
    const live = this.live;
    if (live?.cursor == null || !Number.isFinite(time) || time < live.lcut)
      return false;
    live.lcut = time;
    return true;
  }
  setLiveValues(value: any, receivedAt: number) {
    if (!this.liveEnabled) return false;
    const previous = this.live;
    if (previous?.cursor != null && value.time < previous.lcut) return false;
    const nextNames = names(value.live_entity_names);
    const retained =
      previous?.cursor != null
        ? this.retainDropped(previous, nextNames)
        : emptyRetained();
    for (const category of categories) {
      const hashes = withHashes(nextNames[category]);
      retained[category].forEach((_value, name) => {
        if (matches(hashes, name)) retained[category].delete(name);
      });
    }
    this.live = {
      values: new V1InitializeContainer(value),
      entityNames: nextNames,
      retainedValues: retained,
      source: "Network",
      lcut: value.time,
      receivedAt,
      loadedAt: receivedAt,
      cursor: {
        previousDerivedFields: value.derived_fields,
        fullChecksum: value.full_checksum,
      },
    };
    return true;
  }
  private retainDropped(previous: LiveState, next: Names): Retained {
    const retained: Retained = {
      feature_gates: new Map(previous.retainedValues.feature_gates),
      dynamic_configs: new Map(previous.retainedValues.dynamic_configs),
      layer_configs: new Map(previous.retainedValues.layer_configs),
    };
    const recognized = this.liveDetails(false, previous),
      unrecognized = this.liveDetails(true, previous);
    for (const [category, method] of [
      ["feature_gates", "getGate"],
      ["dynamic_configs", "getConfig"],
      ["layer_configs", "getLayer"],
    ] as const) {
      const hashes = withHashes(next[category]);
      previous.entityNames[category].forEach((name) => {
        if (matches(hashes, name)) return;
        const result = previous.values[method](name);
        retained[category].set(name, {
          result,
          details: result ? recognized : unrecognized,
        });
      });
    }
    return retained;
  }
  getCurrentSourceDetails(): any {
    const details = super.getCurrentSourceDetails();
    if (this._source === "Uninitialized" || this._source === "NoValues")
      return details;
    if (this.loadedAt != null) details.loadedAt = this.loadedAt;
    return details;
  }
  private liveDetails(unrecognized: boolean, live: LiveState): any {
    if (live.source === "Uninitialized" || live.source === "NoValues")
      return { reason: live.source };
    const details: any = {
      reason: live.source,
      lcut: live.lcut,
      receivedAt: live.receivedAt,
      loadedAt: live.loadedAt,
    };
    const warnings = Array.from(this._warnings);
    if (warnings.length > 0) details.warnings = warnings;
    let reason = details.reason;
    if (live.source === "Bootstrap" && warnings.length > 0)
      reason += warnings[0];
    details.reason = `${reason}:${unrecognized ? "Unrecognized" : "Recognized"}`;
    if (live.source === "Bootstrap" && this._bootstrapMetadata)
      details.bootstrapMetadata = this._bootstrapMetadata;
    return details;
  }
}
