// Reconstructed from jm's constructor closure and pl in browser-client.js.
// The original lexical dependencies p (runtime export registry) and jh (Tab)
// are explicit internal dependencies until the full registry is reconstructed.
export interface ApiMemberInfo {
  unsupportedByDefaultIn?: string[];
  [key: string]: unknown;
}
export interface ApiManifest {
  interfaces: Record<string, Record<string, ApiMemberInfo>>;
  [key: string]: unknown;
}
export type RuntimeType = abstract new (...args: any[]) => object;
export type ApiView = <T>(value: T, disabledMemberIds: Set<string>) => T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

export function createApiView(
  manifest: ApiManifest,
  decorateTab: ((tab: any) => unknown) | undefined,
  runtimeTypes: object,
  TabType: RuntimeType,
): ApiView {
  // Shared across separate view calls: arguments can unwrap proxies from another view.
  const rawByProxy = new WeakMap<object, object>();
  const interfaceTypes = Object.keys(manifest.interfaces).map((name) => {
    const runtimeType = Reflect.get(runtimeTypes, name);
    if (!(typeof runtimeType === "function" && runtimeType.prototype != null)) {
      throw new Error(`Browser API interface has no runtime type: ${name}`);
    }
    return [runtimeType as RuntimeType, name] as const;
  });

  return <T>(value: T, disabledMemberIds: Set<string>): T => {
    // Per call, not per factory. The same raw instance gets a new view on a new call.
    const proxyByRaw = new WeakMap<object, object>();
    const unwrap = (value: any): any => {
      if (value == null || typeof value !== "object") return value;
      return (
        rawByProxy.get(value) ??
        (Array.isArray(value)
          ? value.map(unwrap)
          : isPlainObject(value)
            ? Object.fromEntries(
                Object.entries(value).map(([key, entry]) => [
                  key,
                  unwrap(entry),
                ]),
              )
            : value)
      );
    };
    const wrap = (value: any): any => {
      if (value == null || typeof value !== "object" || rawByProxy.has(value))
        return value;
      if (value instanceof Promise) return value.then(wrap);
      if (Array.isArray(value)) return value.map(wrap);
      const interfaceName = interfaceTypes.find(
        ([type]) => value instanceof type,
      )?.[1];
      if (interfaceName == null) return value;
      const cached = proxyByRaw.get(value);
      if (cached != null) return cached;
      const isVisible = (key: PropertyKey) =>
        typeof key !== "string" ||
        !disabledMemberIds.has(`${interfaceName}.${key}`);
      const methods = new Map<PropertyKey, Function>();
      const proxy = new Proxy(value, {
        get(target, key) {
          if (!isVisible(key)) return;
          const member = Reflect.get(target, key, target);
          if (key === "constructor") return member;
          if (typeof member !== "function") return wrap(member);
          const cached = methods.get(key);
          if (cached != null) return cached;
          const method = (...args: any[]) =>
            wrap(Reflect.apply(member, target, args.map(unwrap)));
          methods.set(key, method);
          return method;
        },
        getOwnPropertyDescriptor(target, key) {
          if (!isVisible(key)) return;
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          return descriptor != null && "value" in descriptor
            ? { ...descriptor, value: wrap(descriptor.value) }
            : descriptor;
        },
        has: (target, key) => isVisible(key) && Reflect.has(target, key),
        ownKeys: (target) => Reflect.ownKeys(target).filter(isVisible),
      });
      proxyByRaw.set(value, proxy);
      rawByProxy.set(proxy, value);
      if (proxy instanceof TabType) decorateTab?.(proxy);
      return proxy;
    };
    return wrap(value);
  };
}

/** Original jm.createBrowser inline helper. Overrides do not re-enable globally disabled members. */
export function getDisabledMemberIds({
  apiManifest,
  browserInfo,
  disabledMemberIds,
}: {
  apiManifest: ApiManifest;
  browserInfo: { type: string; apiSupportOverrides?: Record<string, boolean> };
  disabledMemberIds: Iterable<string>;
}): Set<string> {
  const result = new Set(disabledMemberIds);
  for (const [interfaceName, members] of Object.entries(
    apiManifest.interfaces,
  )) {
    for (const [memberName, info] of Object.entries(members)) {
      const id = `${interfaceName}.${memberName}`;
      if (!(
        browserInfo.apiSupportOverrides?.[id] ??
        info.unsupportedByDefaultIn?.includes(browserInfo.type) !== true
      )) {
        result.add(id);
      }
    }
  }
  return result;
}
