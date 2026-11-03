import { randomUUID } from 'node:crypto';
import type { CdpChannel as CDPSession } from './driver.js';
import { CuaError } from '../core/errors.js';

export interface FrameStamp { frameId: string; cdp: CDPSession; contextId: number; value: string }
const expression = `(() => {
  if (!globalThis.__cuaRevision) {
    const state = { revision: 0, roots: new WeakSet() };
    Object.defineProperty(globalThis, '__cuaRevision', { value: state });
    state.observer = new MutationObserver(() => state.revision++);

  }
  const state = globalThis.__cuaRevision;
  const nodes = [];
  const scan = root => {
    if (!state.roots.has(root)) {
      state.roots.add(root); state.revision++;
      state.observer.observe(root, {subtree:true,childList:true,attributes:true,characterData:true});
    }
    for (const element of root.querySelectorAll('*')) { nodes.push(element); if (element.shadowRoot) scan(element.shadowRoot); }
  };
  scan(document);
  if (state.observer.takeRecords().length) state.revision++;
  // Property-only changes and scrolling do not necessarily emit DOM mutations.
  return JSON.stringify({ revision: state.revision, scroll: [scrollX,scrollY],
    viewport: [innerWidth,innerHeight,visualViewport?.offsetLeft,visualViewport?.offsetTop,visualViewport?.scale],
    controls: nodes.filter(e => e.matches('input,textarea,select')).map(e => [e.value,e.checked,e.selectedIndex]),
    scrollables: nodes.filter(e => e.scrollLeft || e.scrollTop).map(e => [e.scrollLeft,e.scrollTop]) });
})()`;

/** Isolated-world bookkeeping; page JavaScript cannot overwrite the observer state. */
export class FrameRevisions {
  private worldName = `cua-kit-${randomUUID()}`;
  async capture(frameId: string, cdp: CDPSession): Promise<FrameStamp> {
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: this.worldName });
    return { frameId, cdp, contextId: executionContextId, value: await this.read(cdp, executionContextId) };
  }
  async verify(stamps: Iterable<FrameStamp>): Promise<void> {
    for (const stamp of stamps) {
      let value: string;
      try { value = await this.read(stamp.cdp, stamp.contextId); }
      catch (cause) { throw new CuaError('STALE_OBSERVATION', 'Document context changed.', { cause }); }
      if (value !== stamp.value) throw new CuaError('STALE_OBSERVATION', 'Document, form value or viewport changed; observe again.');
    }
  }
  private async read(cdp: CDPSession, contextId: number): Promise<string> {
    const result = await cdp.send('Runtime.evaluate', { expression, contextId, returnByValue: true });
    if (result.exceptionDetails || typeof result.result.value !== 'string') throw new CuaError('STALE_OBSERVATION', 'Unable to read document revision.');
    return result.result.value;
  }
}
