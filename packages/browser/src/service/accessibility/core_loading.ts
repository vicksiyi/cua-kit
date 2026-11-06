/** Current lF/cF/Jh: speculative AX loading is scoped to a frozen environment.
 * Navigation leases can cancel speculative reads; an explicit capture consumes
 * the shared promise and falls back to a normal load if speculation failed.
 */
export type AccessibilityEnvironment = Record<string, string | undefined>;
export type AccessibilitySource = URL | string | ArrayBuffer | Uint8Array;
export function createAccessibilityCoreLoading<T>(
  load: (
    source?: AccessibilitySource,
    options?: { env?: AccessibilityEnvironment },
  ) => Promise<T>,
  install: (core: T) => void,
) {
  let initialized: Promise<void> | undefined;
  let speculative:
    | {
        env: AccessibilityEnvironment;
        binding: Promise<T>;
        abort: AbortController;
        navigations: number;
      }
    | undefined;
  function cancel(env: AccessibilityEnvironment) {
    if (speculative?.env === env) {
      speculative.abort.abort();
      speculative = undefined;
    }
  }
  function initialize(
    source?: AccessibilitySource,
    options?: { env?: AccessibilityEnvironment },
  ) {
    if (initialized != null) return initialized;
    if (
      speculative != null &&
      (source !== undefined || speculative.env !== options?.env)
    )
      cancel(speculative.env);
    const fallback = () => load(source, options);
    const binding = speculative?.binding.catch(fallback) ?? fallback();
    speculative = undefined;
    return (initialized = binding.then(install));
  }
  function preload(
    env: AccessibilityEnvironment,
    read: (signal: AbortSignal) => Promise<Uint8Array>,
  ) {
    if (
      initialized != null ||
      !Object.isFrozen(env) ||
      env.BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH?.trim() ||
      (speculative != null && speculative.env !== env)
    )
      return;
    if (speculative == null) {
      const abort = new AbortController();
      const binding = read(abort.signal).then((bytes) => {
        abort.signal.throwIfAborted();
        return load(bytes, { env });
      });
      speculative = { env, binding, abort, navigations: 0 };
      binding.catch(() => {
        if (speculative?.binding === binding) speculative = undefined;
      });
    }
    const pending = speculative;
    pending.navigations++;
    return () => {
      if (--pending.navigations === 0 && speculative === pending) cancel(env);
    };
  }
  return { initialize, preload, cancel };
}
