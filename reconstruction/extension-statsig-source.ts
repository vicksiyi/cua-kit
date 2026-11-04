import { createRequire } from "node:module";
import { extensionBindings } from "./extension-source";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
/** Execute the inspected bundled NetworkCore module only; reuse official 3.33.4 support modules. */
export function originalStatsigNetworkCore() {
  const imports: Record<string, string> = {
    Ot: "$_StatsigGlobal",
    vs: "Diagnostics",
    le: "Log",
    Er: "NetworkConfig",
    Sm: "NetworkFallbackResolver",
    $c: "SDKFlags",
    Ln: "SDKType",
    Ge: "SafeJs",
    Ar: "SessionID",
    Cr: "StableID",
    Fc: "StatsigClientEventEmitter",
    Tr: "StatsigMetadata",
    kr: "StatsigOptionsCommon",
    Ir: "VisibilityObserving",
  };
  const dependencies = Object.fromEntries(
    Object.entries(imports).map(([binding, module]) => [
      binding,
      () => require(`@statsig/client-core/src/${module}`),
    ]),
  );
  return extensionBindings(["Bc"], {
    ...dependencies,
    L: (factory: (exports: Record<string, unknown>) => void) => () => {
      const exports = {};
      factory(exports);
      return exports;
    },
  }).Bc().NetworkCore;
}

export function originalStatsigEvaluationStore() {
  return extensionBindings(["Bm", "jm", "qm"], {
    ze: () => require("@statsig/client-core"),
    L: (factory: (exports: Record<string, unknown>) => void) => () => {
      const exports = {};
      factory(exports);
      return exports;
    },
  }).qm().default;
}

/** Class definition only; callers create a prototype fixture without running its constructor. */
export function originalStatsigClientPrototype(
  overrides: Record<string, unknown> = {},
) {
  return extensionBindings(["Vm"], {
    ze: () => ({
      ...require("@statsig/client-core"),
      ...((overrides.core as object) ?? {}),
    }),
    qm: () => ({}),
    Kc: () => ({}),
    Gm: () => ({}),
    zm: () => ({}),
    L: (factory: (exports: Record<string, unknown>) => void) => () => {
      const exports = {};
      factory(exports);
      return exports;
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "core"),
    ),
  }).Vm().default;
}

/** Actual bundled Kc and its delta resolver, on the inspected bundled core. */
export function originalStatsigNetwork() {
  return extensionBindings(["Hm", "Kc"], {
    ze: () => ({
      ...require("@statsig/client-core"),
      NetworkCore: originalStatsigNetworkCore(),
    }),
    L: (factory: (exports: Record<string, unknown>) => void) => () => {
      const exports = {};
      factory(exports);
      return exports;
    },
  }).Kc().default;
}
