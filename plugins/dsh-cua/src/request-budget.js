/** Execution and human confirmation have separate, cumulative time budgets. */
export class RequestBudget {
  constructor(executionMs, approvalMs) {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.remaining = { execution: executionMs, approval: approvalMs };
    this.depth = 0;
    this.arm('execution');
  }

  arm(kind) {
    this.kind = kind;
    this.started = performance.now();
    this.timer = setTimeout(() => this.controller.abort(new Error(`CUA ${kind} timed out`)), this.remaining[kind]);
  }

  switchTo(kind) {
    clearTimeout(this.timer);
    this.remaining[this.kind] = Math.max(0, this.remaining[this.kind] - (performance.now() - this.started));
    if (!this.disposed && !this.signal.aborted) this.arm(kind);
  }

  async approve(operation) {
    if (this.depth++ === 0) this.switchTo('approval');
    try { return await operation(); }
    finally { if (--this.depth === 0) this.switchTo('execution'); }
  }

  dispose() { this.disposed = true; clearTimeout(this.timer); }
}
