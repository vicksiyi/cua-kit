import { setTimeout } from "node:timers/promises";
type Timing = { now: () => number; sleep: (ms: number) => Promise<unknown> };
const defaultTiming: Timing = {
  now: () => performance.now(),
  sleep: setTimeout,
};
/** Deadline is extended by subsequent actions; wait rechecks it after every sleep. */
export class ActionSettler {
  #options: { post_action_sleep_ms?: number };
  #timing: Timing;
  #deadline = 0;
  constructor(
    options: { post_action_sleep_ms?: number },
    timing: Timing = defaultTiming,
  ) {
    this.#options = options;
    this.#timing = timing;
  }
  async wait(): Promise<void> {
    for (;;) {
      const remaining = this.#deadline - this.#timing.now();
      if (!(remaining > 0)) return;
      await this.#timing.sleep(remaining);
    }
  }
  defer(): void {
    const duration = Math.max(0, this.#options.post_action_sleep_ms ?? 100);
    this.#deadline = Math.max(this.#deadline, this.#timing.now() + duration);
  }
}
