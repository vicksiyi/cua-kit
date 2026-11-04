import { AsyncLocalStorage } from "node:async_hooks";
/** Stores may outlive a tool call; only getCurrent enforces the active ID. */
export function createExecContext<State extends { id: unknown }>() {
  const storage = new AsyncLocalStorage<State>();
  let activeId: unknown = null;
  function getOptional(): State | null {
    const state = storage.getStore();
    return state && typeof state.id === "string" && state.id ? state : null;
  }
  function getAsync(): State {
    const state = getOptional();
    if (state === null) throw new Error("node_repl exec context not found");
    return state;
  }
  function getCurrent(): State {
    const state = getAsync();
    if (state.id !== activeId)
      throw new Error("node_repl exec context not found");
    return state;
  }
  return {
    get activeId() {
      return activeId;
    },
    activate(id: unknown) {
      activeId = id;
    },
    clear(id: unknown) {
      if (activeId === id) activeId = null;
    },
    getAsync,
    getCurrent,
    getOptional,
    run<T>(state: State, operation: () => T): T {
      return storage.run(state, operation);
    },
  };
}
