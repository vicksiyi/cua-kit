/** Original service Za. Intentionally retains plain-object storage and last-match removal. */
export class CdpEventEmitter {
  listeners: Record<string, Array<(...args: any[]) => unknown>> = {};
  addListener(event: string, listener: (...args: any[]) => unknown) {
    const listeners = this.listeners[event];
    if (listeners == null) this.listeners[event] = [listener];
    else listeners.push(listener);
    return this;
  }
  on(event: string, listener: (...args: any[]) => unknown) {
    return this.addListener(event, listener);
  }
  removeListener(event: string, listener: (...args: any[]) => unknown) {
    const listeners = this.listeners[event];
    if (listeners == null) return this;
    const index = listeners.lastIndexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
    return this;
  }
  emit(event: string, ...args: any[]) {
    const listeners = this.listeners[event];
    if (listeners == null || listeners.length === 0) return false;
    for (const listener of [...listeners]) listener.apply(this, args);
    return true;
  }
}
