import { isPlainObject } from "./worker_values";
type Hook = { run: (event: unknown) => unknown; timeoutMs: number };
export function createLifecycleHandlers(name: string, concurrent = false) {
  const hooks = new Set<Hook>();
  return {
    add(options: unknown) {
      if (
        !isPlainObject(options) ||
        typeof options.run !== "function" ||
        !Number.isSafeInteger(options.timeoutMs) ||
        (options.timeoutMs as number) <= 0
      ) {
        throw new Error(
          `nodeRepl.${name} expected { run: function, timeoutMs: positive integer }`,
        );
      }
      const hook = {
        run: options.run as Hook["run"],
        timeoutMs: options.timeoutMs as number,
      };
      hooks.add(hook);
      return () => hooks.delete(hook);
    },
    async run(event: unknown) {
      const runHandler = async ({ run, timeoutMs }: Hook) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.resolve().then(() => run(event)),
            new Promise((resolve) => {
              timer = setTimeout(resolve, timeoutMs);
            }),
          ]);
        } catch {
          // Hooks are best-effort side effects.
        } finally {
          clearTimeout(timer);
        }
      };
      if (concurrent) {
        await Promise.all([...hooks].map(runHandler));
      } else {
        for (const hook of [...hooks]) await runHandler(hook);
      }
    },
  };
}
