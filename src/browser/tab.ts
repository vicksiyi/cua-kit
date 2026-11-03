import { randomUUID } from 'node:crypto';
import type { CDPSession, Page } from 'playwright';
import { AccessibilityCollector, onElement, renderAX, type ElementBinding } from './accessibility.js';
import { assert, checkAbort, CuaError } from '../core/errors.js';
import { SerialQueue } from '../core/serial.js';
import type { ActionOptions, Authorize, AuditEvent, ClickOptions, ElementRef, Observation, Point, StateOptions } from '../core/types.js';

import type { FrameStamp } from './stamp.js';

interface TabConfig {
  sessionId: string;
  authorize: Authorize;
  audit?: (event: AuditEvent) => void;
  active: () => boolean;
}

/** Browser implementation independent of MCP or any vendor host runtime. */
export class CuaTab {
  private epoch = 0;
  private closed = false;
  private queue = new SerialQueue();
  private collector: AccessibilityCollector;
  private snapshot?: Observation;
  private previous?: Observation;
  private bindings = new Map<number, ElementBinding>();
  private stamps: FrameStamp[] = [];

  private constructor(readonly id: string, private page: Page, private cdp: CDPSession, private config: TabConfig) {
    this.collector = new AccessibilityCollector(page, cdp);
    page.on('framenavigated', () => this.invalidate());
    page.on('close', () => { this.closed = true; this.invalidate(); });
  }
  static async create(id: string, page: Page, config: TabConfig): Promise<CuaTab> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    await cdp.send('Page.enable');
    return new CuaTab(id, page, cdp, config);
  }
  get url(): string { return this.page.url(); }
  get capabilities(): readonly string[] {
    return ['ax', 'screenshot', 'click', 'typeText', 'pressKey', 'scroll', 'setValue', 'navigation'];
  }
  invalidate(): void { this.epoch++; this.snapshot = undefined; this.bindings.clear(); this.stamps = []; }

  private run<T>(operation: string, effect: 'read' | 'write', options: ActionOptions, fn: () => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      assert(this.config.active(), 'SESSION_CLOSED', 'This session has ended.');
      assert(!this.closed && !this.page.isClosed(), 'TARGET_NOT_FOUND', 'Tab is closed.');
      checkAbort(options.signal);
      const beforeEpoch = this.epoch, beforeUrl = this.url;
      const request = { sessionId: this.config.sessionId, targetId: this.id, url: beforeUrl, operation, effect };
      assert(await this.config.authorize(request), 'PERMISSION_DENIED', `Access to ${operation} was denied.`);
      checkAbort(options.signal);
      assert(this.config.active(), 'SESSION_CLOSED', 'This session ended during authorization.');
      assert(beforeEpoch === this.epoch && beforeUrl === this.url, 'STALE_OBSERVATION', 'Target changed while authorization was pending. Observe again.');
      const started = performance.now(), requestId = randomUUID();
      try {
        const value = await fn();
        this.config.audit?.({ ...request, requestId, durationMs: performance.now() - started, status: 'completed' });
        return value;
      } catch (error) {
        this.config.audit?.({ ...request, requestId, durationMs: performance.now() - started, status: 'failed', errorCode: error instanceof CuaError ? error.code : 'PROVIDER_ERROR' });
        throw error;
      }
    });
  }

  observe(options: StateOptions = {}): Promise<Observation> {
    return this.run('observe', 'read', options, async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await this.capture(options); }
        catch (error) {
          if (!(error instanceof CuaError) || error.code !== 'STALE_OBSERVATION' || attempt >= 2) throw error;
          checkAbort(options.signal);
          await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        }
      }
    });
  }
  private async capture(options: StateOptions): Promise<Observation> {
      const epoch = this.epoch;
      const capture = await this.collector.capture();
      checkAbort(options.signal);
      const screenshot = options.screenshot ? {
        id: randomUUID(), bytes: new Uint8Array(Buffer.from((await this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64')),
        mimeType: 'image/png' as const, coordinateSpace: 'css-viewport' as const, capturedAt: new Date().toISOString(),
      } : undefined;
      assert(epoch === this.epoch, 'STALE_OBSERVATION', 'Navigation occurred during capture.');
      await this.collector.revisions.verify(capture.stamps);
      checkAbort(options.signal);
      const result: Observation = {
        sessionId: this.config.sessionId, targetId: this.id, snapshotId: randomUUID(), epoch,
        capturedAt: new Date().toISOString(), url: this.url, elements: capture.elements,
        text: renderAX(capture.elements), warnings: capture.warnings, ...(screenshot ? { screenshot } : {}),
      };
      if (this.previous && !options.disableDiffing && this.previous.url === result.url) {
        const before = new Map(this.previous.elements.map(element => [element.id, element]));
        const after = new Map(result.elements.map(element => [element.id, element]));
        result.diff = {
          baseSnapshotId: this.previous.snapshotId,
          removed: [...before.keys()].filter(id => !after.has(id)),
          added: result.elements.filter(element => !before.has(element.id)),
          changed: result.elements.filter(element => before.has(element.id) && JSON.stringify(before.get(element.id)) !== JSON.stringify(element)),
        };
      }
      this.snapshot = result; this.previous = result; this.bindings = capture.bindings; this.stamps = capture.stamps;
      return structuredClone(result);
  }
  async getAXState(options: StateOptions = {}): Promise<string> { return (await this.observe(options)).text; }
  async getScreenshot(options: ActionOptions = {}): Promise<Uint8Array> { return (await this.observe({ ...options, screenshot: true })).screenshot!.bytes; }
  async getAXStateAndScreenshot(options: StateOptions = {}): Promise<{ state: string; screenshot: Uint8Array }> {
    const result = await this.observe({ ...options, screenshot: true });
    return { state: result.text, screenshot: result.screenshot!.bytes };
  }
  ref(elementId: number): ElementRef {
    assert(this.snapshot && this.bindings.has(elementId), 'STALE_OBSERVATION', 'Observe the element before obtaining a reference.');
    return { targetId: this.id, snapshotId: this.snapshot.snapshotId, elementId };
  }
  private async resolve(target: number | ElementRef): Promise<ElementBinding> {
    assert(this.snapshot, 'STALE_OBSERVATION', 'Observe again before using an element.');
    if (typeof target !== 'number') {
      assert(target.targetId === this.id && target.snapshotId === this.snapshot.snapshotId, 'STALE_OBSERVATION', 'Element reference belongs to another target or snapshot.');
    }
    const id = typeof target === 'number' ? target : target.elementId;
    const binding = this.bindings.get(id);
    assert(binding, 'STALE_OBSERVATION', `Element ${id} is not an actionable node in the current snapshot.`);
    await this.collector.revisions.verify(this.stamps);
    return binding;
  }
  private async focus(target: number | ElementRef | null): Promise<{ cdp: CDPSession }> {
    if (target === null) return { cdp: this.cdp };
    const binding = await this.resolve(target);
    await onElement(binding, `function () {
      if (!this.isConnected || this.disabled || this.readOnly) throw new Error('Element cannot accept input');
      if (typeof this.focus !== 'function') throw new Error('Element cannot be focused');
      this.focus();
      if (this.getRootNode().activeElement !== this) throw new Error('Focus failed');
    }`);
    return binding;
  }
  click(target: number | ElementRef | Point, options: ClickOptions = {}): Promise<void> {
    return this.run('click', 'write', options, async () => {
      assert(Number.isInteger(options.clickCount ?? 1) && (options.clickCount ?? 1) > 0 && (options.clickCount ?? 1) <= 3, 'INVALID_ARGUMENT', 'clickCount must be 1, 2 or 3.');
      assert(Number.isFinite(options.durationMs ?? 0) && (options.durationMs ?? 0) >= 0 && (options.durationMs ?? 0) <= 30000, 'INVALID_ARGUMENT', 'durationMs must be between 0 and 30000.');
      let cdp = this.cdp, x: number, y: number;
      if (Array.isArray(target)) {
        assert(this.snapshot?.screenshot, 'STALE_OBSERVATION', 'Coordinate input requires a fresh screenshot.');
        await this.collector.revisions.verify(this.stamps);
        const fresh = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        assert(Buffer.from(fresh.data, 'base64').equals(Buffer.from(this.snapshot.screenshot.bytes)), 'STALE_OBSERVATION', 'Visible pixels changed since screenshot; observe again.');
        [x, y] = target as unknown as Point;
        const metrics = await cdp.send('Page.getLayoutMetrics');
        assert(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < metrics.cssVisualViewport.clientWidth && y < metrics.cssVisualViewport.clientHeight, 'INVALID_ARGUMENT', 'Point is outside viewport.');
      } else {
        const binding = await this.resolve(target as number | ElementRef);
        cdp = this.cdp;
        const point = await onElement<{ x: number; y: number }>(binding, `async function () {
          if (!this.isConnected || this.disabled) throw new Error('Element is disabled or detached');
          this.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const r = this.getBoundingClientRect();
          if (!r.width || !r.height) throw new Error('Element has no visible bounds');
          const style = getComputedStyle(this);
          if (style.visibility === 'hidden' || style.display === 'none') throw new Error('Element is hidden');
          let x = Math.max(0, Math.min(innerWidth, r.right) + Math.max(0, r.left)) / 2;
          let y = Math.max(0, Math.min(innerHeight, r.bottom) + Math.max(0, r.top)) / 2;
          const hit = this.getRootNode().elementFromPoint(x,y);
          if (hit !== this && !this.contains(hit)) throw new Error('Element is covered');
          return {x,y};
        }`);
        ({ x, y } = await this.collector.toMainFramePoint(binding.frameId, point));
      }
      checkAbort(options.signal);
      const button = options.mouseButton ?? 'left';
      assert(['left', 'right', 'middle'].includes(button), 'INVALID_ARGUMENT', 'Unknown mouse button.');
      const buttonMask = button === 'left' ? 1 : button === 'right' ? 2 : 4;
      try {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (let clickCount = 1; clickCount <= (options.clickCount ?? 1); clickCount++) {
          checkAbort(options.signal);
          try {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: buttonMask, clickCount });
            if (options.durationMs) await new Promise<void>((resolve, reject) => {
              const cancel = () => { clearTimeout(timer); reject(new CuaError('ACTION_OUTCOME_UNKNOWN', 'Click interrupted after mouse-down; release sent, observe before retrying.')); };
              const timer = setTimeout(() => { options.signal?.removeEventListener('abort', cancel); resolve(); }, options.durationMs);
              options.signal?.addEventListener('abort', cancel, { once: true });
              if (options.signal?.aborted) cancel();
            });
          } finally {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount });
          }
        }
      } finally { this.invalidate(); }
    });
  }
  typeText(target: number | ElementRef | null, text: string, options: ActionOptions = {}): Promise<void> {
    return this.run('typeText', 'write', options, async () => {
      assert(typeof text === 'string', 'INVALID_ARGUMENT', 'text must be a string.');
      const { cdp } = await this.focus(target);
      checkAbort(options.signal);
      try { await cdp.send('Input.insertText', { text }); } finally { this.invalidate(); }
    });
  }
  setValue(target: number | ElementRef, value: string, options: ActionOptions = {}): Promise<void> {
    return this.run('setValue', 'write', options, async () => {
      assert(typeof value === 'string', 'INVALID_ARGUMENT', 'value must be a string.');
      const binding = await this.resolve(target);
      checkAbort(options.signal);
      try {
        await onElement(binding, `function (value) {
          if (!this.isConnected || this.disabled || this.readOnly) throw new Error('Element is not editable');
          const proto = this.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : this.tagName === 'INPUT' ? HTMLInputElement.prototype : this.tagName === 'SELECT' ? HTMLSelectElement.prototype : null;
          if (!proto) throw new Error('setValue requires input, textarea or select');
          Object.getOwnPropertyDescriptor(proto,'value').set.call(this,value);
          this.dispatchEvent(new Event('input',{bubbles:true})); this.dispatchEvent(new Event('change',{bubbles:true}));
        }`, [value]);
      } finally { this.invalidate(); }
    });
  }
  pressKey(target: number | ElementRef | null, key: string, options: ActionOptions = {}): Promise<void> {
    return this.run('pressKey', 'write', options, async () => {
      await this.focus(target);
      checkAbort(options.signal);
      const normalized = key.replace(/^super\+/i, process.platform === 'darwin' ? 'Meta+' : 'Control+').replace(/Return/g, 'Enter');
      try { await this.page.keyboard.press(normalized); } finally { this.invalidate(); }
    });
  }
  scroll(target: number | ElementRef, direction: 'up' | 'down' | 'left' | 'right', pages = 1, options: ActionOptions = {}): Promise<void> {
    return this.run('scroll', 'write', options, async () => {
      assert(['up','down','left','right'].includes(direction) && Number.isFinite(pages) && pages > 0, 'INVALID_ARGUMENT', 'Invalid scroll direction or page count.');
      const binding = await this.resolve(target);
      checkAbort(options.signal);
      try {
        await onElement(binding, `function (direction, pages) {
          const horizontal = direction === 'left' || direction === 'right';
          let node = this.nodeType === 1 ? this : this.parentElement;
          while (node && (horizontal ? node.scrollWidth <= node.clientWidth : node.scrollHeight <= node.clientHeight)) node = node.parentElement;
          node ||= this.ownerDocument?.scrollingElement || this.scrollingElement;
          if (!node) throw new Error('No scrollable target');
          const sign = direction === 'up' || direction === 'left' ? -1 : 1;
          node.scrollBy({left:horizontal ? sign*pages*node.clientWidth : 0,top:horizontal ? 0 : sign*pages*node.clientHeight,behavior:'instant'});
        }`, [direction, pages]);
      } finally { this.invalidate(); }
    });
  }
  goto(url: string): Promise<void> {
    return this.run('goto', 'write', {}, async () => {
      const parsed = new URL(url);
      assert(['http:', 'https:', 'about:'].includes(parsed.protocol), 'INVALID_ARGUMENT', 'Only HTTP(S) and about URLs are supported.');
      assert(await this.config.authorize({ sessionId: this.config.sessionId, targetId: this.id, url, operation: 'navigate', effect: 'write' }), 'PERMISSION_DENIED', 'Destination denied.');
      try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
      finally { this.invalidate(); }
    });
  }
  close(): Promise<void> { return this.run('close', 'write', {}, () => this.page.close()); }
  async dispose(): Promise<void> { this.closed = true; this.invalidate(); await this.collector.dispose(); await this.cdp.detach().catch(() => undefined); }
}
