/** Independent implementation of the trusted worker's suspend/resume wire contract. */
export interface DeadlineClock {
  now(): number;
  schedule(ms: number, callback: () => void): () => void;
}
const systemClock: DeadlineClock = {
  now: () => performance.now(),
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, Math.min(Math.ceil(ms), 2147483647));
    return () => clearTimeout(timer);
  },
};
export class ExecutionDeadline {
  private remaining: number;
  private started = 0;
  private depth = 0;
  private stopped = false;
  private cancel?: () => void;
  constructor(
    ms: number,
    private expire: () => void,
    private clock: DeadlineClock = systemClock,
  ) {
    if (!Number.isFinite(ms) || ms <= 0)
      throw Error("Invalid execution deadline");
    this.remaining = ms;
    this.arm();
  }
  get suspended() {
    return this.depth > 0;
  }
  private arm() {
    if (this.stopped) return;
    if (this.remaining <= 0) {
      this.dispose();
      this.expire();
      return;
    }
    this.started = this.clock.now();
    this.cancel = this.clock.schedule(this.remaining, () => {
      this.cancel = undefined;
      this.remaining -= Math.max(0, this.clock.now() - this.started);
      this.arm();
    });
  }
  suspend() {
    if (this.stopped) return;
    if (this.depth === 0) {
      this.remaining -= Math.max(0, this.clock.now() - this.started);
      this.cancel?.();
      this.cancel = undefined;
      if (this.remaining <= 0) {
        this.dispose();
        this.expire();
        return;
      }
    }
    this.depth++;
  }
  resume() {
    if (this.stopped) return;
    if (this.depth === 0) throw Error("Unbalanced timeout resume");
    if (--this.depth === 0) this.arm();
  }
  dispose() {
    this.stopped = true;
    this.cancel?.();
    this.cancel = undefined;
  }
}
