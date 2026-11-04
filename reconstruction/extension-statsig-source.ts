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
