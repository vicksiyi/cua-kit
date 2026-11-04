export type BackgroundResult = {
  ok: boolean;
  error: unknown;
  observation: { observed: boolean };
};
export type BackgroundState = {
  pendingBackgroundTasks: Set<Promise<BackgroundResult>>;
};
export type TrackedOperation<T> = Pick<
  Promise<T>,
  "then" | "catch" | "finally"
>;
/** Delay rejection creation until the caller observes this thenable. */
export function makeRejectedThenable(error: unknown): TrackedOperation<never> {
  return {
    then(onFulfilled, onRejected) {
      return Promise.reject(error).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.reject(error).catch(onRejected);
    },
    finally(onFinally) {
      return Promise.reject(error).finally(onFinally);
    },
  };
}
export function trackExecBackgroundOperation<T>(
  execState: BackgroundState,
  operation: Promise<T>,
): TrackedOperation<T> {
  const observation = { observed: false };
  const trackedOperation = operation.then(
    () => ({ ok: true, error: null, observation }),
    (error) => ({ ok: false, error, observation }),
  );
  execState.pendingBackgroundTasks.add(trackedOperation);
  return {
    then(onFulfilled, onRejected) {
      observation.observed = true;
      return operation.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      observation.observed = true;
      return operation.catch(onRejected);
    },
    finally(onFinally) {
      observation.observed = true;
      return operation.finally(onFinally);
    },
  };
}
