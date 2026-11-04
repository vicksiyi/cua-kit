import {
  ConfigReadError,
  isRecord,
  validPreferenceSession,
} from "../preferences/persisted_permissions";
export interface ReplConfig {
  read(options: { cwd: string; includeLayers: boolean }): Promise<any>;
  readRequirements(): Promise<any>;
  readToml(path: string): Promise<any>;
  writeToml(path: string, value: Record<string, any>): Promise<any>;
}
export interface ConfigHost {
  config: ReplConfig;
  cwd: string;
}
interface CacheState {
  generation: number;
  invalidatedAt: number;
  snapshot?: {
    expiresAt: number;
    generation: number;
    value: Record<string, any>;
  };
  pending?: Promise<Record<string, any>>;
}
/** Original _6/w6/yu/v6/lle. Cache belongs to a bridge; write queues span bridges sharing one host config. */
export function createConfigBridgeFactory(
  now: () => number = () => Date.now(),
) {
  const updates = new WeakMap<ReplConfig, Map<string, Promise<unknown>>>();
  function stateFor(cache: Map<string, CacheState>, path: string) {
    let state = cache.get(path);
    if (state == null) {
      state = { generation: 0, invalidatedAt: 0 };
      cache.set(path, state);
    }
    return state;
  }
  function read(
    host: ConfigHost,
    path: string,
    cache: Map<string, CacheState>,
    refresh = false,
  ): Promise<Record<string, any>> {
    const state = stateFor(cache, path),
      snapshot = state.snapshot;
    if (!refresh && snapshot != null && now() < snapshot.expiresAt)
      return Promise.resolve(snapshot.value);
    if (!refresh && state.pending != null) return state.pending;
    const generation = ++state.generation;
    const latest = (): Promise<Record<string, any>> =>
      cache.get(path) !== state
        ? read(host, path, cache, true)
        : state.snapshot != null
          ? Promise.resolve(state.snapshot.value)
          : state.pending != null
            ? state.pending
            : read(host, path, cache, true);
    const pending: Promise<Record<string, any>> = Promise.resolve()
      .then(() => host.config.readToml(path))
      .then(
        (value) => {
          if (cache.get(path) !== state || state.invalidatedAt > generation)
            return latest();
          if (state.snapshot != null && state.snapshot.generation > generation)
            return state.snapshot.value;
          const record = isRecord(value) ? value : {};
          state.snapshot = {
            expiresAt: now() + 300000,
            generation,
            value: record,
          };
          return record;
        },
        (error) => {
          if (cache.get(path) !== state || state.invalidatedAt > generation)
            return latest();
          if (state.snapshot != null && state.snapshot.generation > generation)
            return state.snapshot.value;
          if (state.generation !== generation && state.pending != null)
            return state.pending;
          cache.delete(path);
          throw new ConfigReadError("config", error);
        },
      )
      .finally(() => {
        if (state.pending === pending) delete state.pending;
      });
    state.pending = pending;
    return pending;
  }
  function serialize(
    host: ConfigHost,
    path: string,
    perform: () => Promise<unknown>,
  ) {
    let queue = updates.get(host.config);
    if (queue == null) {
      queue = new Map();
      updates.set(host.config, queue);
    }
    const pending = (queue.get(path) ?? Promise.resolve())
      .catch(() => {})
      .then(perform);
    queue.set(path, pending);
    const clear = () => {
      if (queue!.get(path) === pending) queue!.delete(path);
    };
    pending.then(clear, clear);
    return pending;
  }
  function store(
    host: ConfigHost,
    path: string,
    cache: Map<string, CacheState>,
  ) {
    return {
      async get(key: string, options?: { refresh?: boolean }) {
        return (await read(host, path, cache, options?.refresh))[key];
      },
      readSnapshot(options?: { refresh?: boolean }) {
        return read(host, path, cache, options?.refresh);
      },
      async set(key: string, value: any) {
        await this.update((snapshot) => ({ ...snapshot, [key]: value }));
      },
      async update(transform: (snapshot: Record<string, any>) => any) {
        await serialize(host, path, async () => {
          const snapshot = await read(host, path, cache, true),
            changes = transform(snapshot),
            merged = { ...snapshot, ...changes },
            state = stateFor(cache, path);
          state.invalidatedAt = ++state.generation;
          delete state.snapshot;
          delete state.pending;
          await host.config.writeToml(path, merged);
          await read(host, path, cache, true);
        });
      },
    };
  }
  function createConfig(host: ConfigHost) {
    const cache = new Map<string, CacheState>();
    return {
      global: store(host, "browser/config.toml", cache),
      async readAll() {
        try {
          return await host.config.read({
            cwd: host.cwd,
            includeLayers: false,
          });
        } catch (error) {
          throw new ConfigReadError("config", error);
        }
      },
      async readRequirements() {
        try {
          return await host.config.readRequirements();
        } catch (error) {
          throw new ConfigReadError("requirements", error);
        }
      },
      session(id: string) {
        if (!validPreferenceSession(id))
          throw Error("Browser-use session id is invalid");
        return store(host, `browser/sessions/${id}.toml`, cache);
      },
    };
  }
  return createConfig;
}
export const createBrowserConfig = createConfigBridgeFactory();
