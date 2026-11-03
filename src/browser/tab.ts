import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { withClipboard, type ClipboardBackend } from '../core/clipboard.js';
import { randomUUID } from 'node:crypto';
import type { CdpChannel as CDPSession, BrowserDriver as Page } from './driver.js';
import { AccessibilityCollector, onElement, renderAX, type ElementBinding } from './accessibility.js';
import { assert, checkAbort, CuaError } from '../core/errors.js';
import { SerialQueue } from '../core/serial.js';
import type { ActionOptions, Authorize, AuditEvent, ClickOptions, PasteOptions, DragOptions, SelectTextOptions, PressKeyOptions, ElementRef, Observation, Point, StateOptions } from '../core/types.js';

import type { FrameStamp } from './stamp.js';

interface TabConfig {
  sessionId: string;
  authorize: Authorize;
  audit?: (event: AuditEvent) => void;
  active: () => boolean;
  clipboard?: ClipboardBackend;
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
    return ['ax', 'screenshot', 'click', 'typeText', 'pressKey', 'scroll', 'setValue', 'navigation', 'selectText', 'drag', ...(this.config.clipboard ? ['paste'] : [])];
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
      assert(!this.closed, 'TARGET_NOT_FOUND', 'Handle released during authorization.');
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
  private normalizeKey(key: string): string {
    assert(typeof key === 'string' && key.length > 0, 'INVALID_ARGUMENT', 'key must be a nonempty string.');
    return key.replace(/^super\+/i, process.platform === 'darwin' ? 'Meta+' : 'Control+').replace(/Return/g, 'Enter');
  }
  private async releaseKeys(keys: string[]): Promise<void> {
    let failed = false;
    for (const key of keys.reverse()) { try { await this.page.keyboard.up(key); } catch { failed = true; } }
    if (failed) throw new CuaError('ACTION_OUTCOME_UNKNOWN', 'One or more key releases could not be confirmed.');
  }
  private async hold(ms: number, signal?: AbortSignal): Promise<void> {
    if (!ms) { if (signal?.aborted) throw new CuaError('ACTION_OUTCOME_UNKNOWN', 'Input was cancelled after dispatch; observe before retrying.'); return; }
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new CuaError('ACTION_OUTCOME_UNKNOWN', 'Input interrupted after dispatch; release attempted, observe before retrying.')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
  private async coordinateCheck(points: Point[]): Promise<void> {
    assert(this.snapshot?.screenshot, 'STALE_OBSERVATION', 'Coordinate input requires a fresh screenshot.');
    await this.collector.revisions.verify(this.stamps);
    const fresh = await this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    assert(Buffer.from(fresh.data, 'base64').equals(Buffer.from(this.snapshot.screenshot.bytes)), 'STALE_OBSERVATION', 'Visible pixels changed since screenshot; observe again.');
    const metrics = await this.cdp.send('Page.getLayoutMetrics');
    for (const point of points) assert(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= 0 && point[1] >= 0 && point[0] < metrics.cssVisualViewport.clientWidth && point[1] < metrics.cssVisualViewport.clientHeight, 'INVALID_ARGUMENT', 'Point is outside viewport.');
  }
  click(target: number | ElementRef | Point, options: ClickOptions = {}): Promise<void> {
    return this.run('click', 'write', options, async () => {
      assert(Number.isInteger(options.clickCount ?? 1) && (options.clickCount ?? 1) > 0 && (options.clickCount ?? 1) <= 3, 'INVALID_ARGUMENT', 'clickCount must be 1, 2 or 3.');
      assert(Number.isFinite(options.durationMs ?? 0) && (options.durationMs ?? 0) >= 0 && (options.durationMs ?? 0) <= 30000, 'INVALID_ARGUMENT', 'durationMs must be between 0 and 30000.');
      let cdp = this.cdp, x: number, y: number;
      if (Array.isArray(target)) {
        await this.coordinateCheck([target as unknown as Point]);
        [x, y] = target as unknown as Point;
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
      const keys = options.key ? this.normalizeKey(options.key).split('+') : [];
      assert(keys.every(key => ['Alt','Control','Meta','Shift'].includes(key)), 'INVALID_ARGUMENT', 'Click key accepts modifier chords only.');
      const held: string[] = [];
      const modifiers = keys.reduce((mask, key) => mask | ({ Alt:1, Control:2, Meta:4, Shift:8 }[key] ?? 0), 0);
      try {
        for (const key of keys) { held.push(key); await this.page.keyboard.down(key); }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
        for (let clickCount = 1; clickCount <= (options.clickCount ?? 1); clickCount++) {
          checkAbort(options.signal);
          try {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: buttonMask, clickCount, modifiers });
            await this.hold(options.durationMs ?? 0, options.signal);
          } finally {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount, modifiers });
          }
        }
      } finally {
        try { await this.releaseKeys(held); } finally { this.invalidate(); }
      }
    });
  }
  paste(target: number | ElementRef | null, text: string, options: PasteOptions = {}): Promise<{eventObserved:true;clipboardRestored:boolean}> {
    return this.run('paste','write',options,async () => {
      assert(this.config.clipboard,'UNSUPPORTED_CAPABILITY','Configure a clipboard backend (nativeHelperPath on macOS) to use real paste.');
      assert(typeof text === 'string' && text.length <= 200000,'INVALID_ARGUMENT','Paste input exceeds size budget.');
      const format = options.format ?? 'text';
      assert(['text','md','html'].includes(format),'INVALID_ARGUMENT','Unsupported paste format.');
      let binding: ElementBinding;
      if (target === null) {
        const current = await this.collector.capture();
        const focused = current.elements.filter(element => element.properties.focused && element.role !== 'RootWebArea' && current.bindings.has(element.id));
        assert(focused.length === 1,'ELEMENT_NOT_INTERACTABLE','Cannot identify a unique focused paste target.');
        binding = current.bindings.get(focused[0]!.id)!;
      } else { binding = await this.resolve(target); }
      await onElement(binding, `function () { if (!this.isConnected || this.disabled || this.readOnly || !(this.isContentEditable || this.tagName==='TEXTAREA' || (this.tagName==='INPUT' && /^(text|search|url|tel|email|password|number)$/.test(this.type)))) throw new Error('Paste target is not editable'); this.focus(); if(this.getRootNode().activeElement !== this) throw new Error('Paste focus failed'); }`);
      const html = format === 'text' ? undefined : sanitizeHtml(format === 'md' ? marked.parse(text,{async:false}) : text);
      const plain = format === 'html' ? await onElement<string>(binding, `function(html) { return new DOMParser().parseFromString(html,'text/html').body.textContent || ''; }`,[html]) : text;
      const pasteEpoch = this.epoch;
      const pasteStamps = (await this.collector.capture()).stamps;
      const validatePaste = async () => {
        checkAbort(options.signal);
        assert(this.config.active() && !this.closed,'CANCELLED','Paste handle was released.');
        assert(this.epoch === pasteEpoch,'STALE_OBSERVATION','Target navigated while paste waited.');
        await this.collector.revisions.verify(pasteStamps);
        await onElement(binding, `function(){if(!this.isConnected || this.getRootNode().activeElement!==this) throw new Error('Paste focus changed');}`);
      };
      const token = randomUUID();
      await onElement(binding, `function(token,expected,rich) {
        const win = this.ownerDocument.defaultView, doc = this.ownerDocument;
        win.__cuaPasteEvents ||= new Map();
        const state = { seen:false, matches:false, doc, handler:null };
        state.handler = event => { if(event.isTrusted && event.composedPath().includes(this)){state.seen = true;state.matches = event.clipboardData?.getData('text/plain') === expected && (!rich || event.clipboardData.types.includes('text/html'));} };
        doc.addEventListener('paste',state.handler,true); win.__cuaPasteEvents.set(token,state);
      }`,[token,plain,html!==undefined]);
      try {
        const pasted = await withClipboard(this.config.clipboard,{text:plain,...(html === undefined ? {} : {html})},async () => {
          await validatePaste();
          const held: string[] = [];
          try {
            for (const key of [process.platform === 'darwin' ? 'Meta':'Control','v']) { held.push(key); await this.page.keyboard.down(key); }
          } finally { await this.releaseKeys(held); }
          const seen = await onElement<boolean>(binding, `async function(token) {
            const state = this.ownerDocument.defaultView.__cuaPasteEvents.get(token);
            const deadline = Date.now()+2000;
            while (!state.seen && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
            await new Promise(resolve=>setTimeout(resolve,0)); return state.seen && state.matches;
          }`,[token]);
          assert(seen,'ACTION_OUTCOME_UNKNOWN','No trusted paste event with the expected payload observed; do not automatically replay.');
        },validatePaste);
        return {eventObserved:true,clipboardRestored:pasted.restored};
      } finally {
        await onElement(binding, `function(token) { const states=this.ownerDocument.defaultView.__cuaPasteEvents; const state=states?.get(token); if(state){state.doc.removeEventListener('paste',state.handler,true);states.delete(token);} }`,[token]).catch(()=>undefined);
        this.invalidate();
      }
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
  pressKey(target: number | ElementRef | null, key: string, options: PressKeyOptions = {}): Promise<void> {
    return this.run('pressKey', 'write', options, async () => {
      const ms = options.durationMs ?? 0;
      assert(Number.isSafeInteger(ms) && ms >= 0 && ms <= 30000, 'INVALID_ARGUMENT', 'durationMs must be 0..30000 integer milliseconds.');
      const normalized = this.normalizeKey(key);
      await this.focus(target); checkAbort(options.signal);
      const keys: string[] = [], held: string[] = [];
      let remainder = normalized, match: RegExpMatchArray | null;
      while ((match = remainder.match(/^(Alt|Control|Meta|Shift)\+/))) { keys.push(match[1]!); remainder = remainder.slice(match[0].length); }
      assert(remainder.length > 0, 'INVALID_ARGUMENT', 'Key chord needs a final key.'); keys.push(remainder);
      try {
        for (const part of keys) { held.push(part); await this.page.keyboard.down(part); }
        await this.hold(ms, options.signal);
      } finally {
        try { await this.releaseKeys(held); } finally { this.invalidate(); }
      }
    });
  }
  selectText(target: number | ElementRef, text: string, options: SelectTextOptions = {}): Promise<void> {
    return this.run('selectText', 'write', options, async () => {
      assert(typeof text === 'string' && text.length > 0, 'INVALID_ARGUMENT', 'Text selection requires a nonempty exact string.');
      const binding = await this.resolve(target); checkAbort(options.signal);
      try {
        await onElement(binding, `function (text, prefix, suffix) {
          const field = this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement;
          const content = field ? this.value : this.textContent;
          const matches = [];
          for (let from = 0; from <= content.length - text.length;) {
            const index = content.indexOf(text, from); if (index < 0) break;
            if ((!prefix || content.slice(0,index).endsWith(prefix)) && (!suffix || content.slice(index+text.length).startsWith(suffix))) matches.push(index);
            from = index + 1;
          }
          if (!matches.length) throw new Error('Selection text not found');
          if (matches.length > 1) throw new Error('Selection is ambiguous; provide prefix or suffix');
          const start = matches[0], end = start + text.length;
          if (field) { this.focus(); this.setSelectionRange(start,end); return; }
          const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
          let node, offset = 0, first, last;
          while ((node = walker.nextNode())) {
            const next = offset + node.textContent.length;
            if (!first && start >= offset && start < next) first = [node,start-offset];
            if (end > offset && end <= next) { last = [node,end-offset]; break; }
            offset = next;
          }
          if (!first || !last) throw new Error('Cannot resolve text range');
          const range = document.createRange(); range.setStart(...first); range.setEnd(...last);
          const selection = this.ownerDocument.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }`, [text, options.prefix ?? '', options.suffix ?? '']);
      } finally { this.invalidate(); }
    });
  }
  drag(from: Point, to: Point, options: DragOptions = {}): Promise<void> {
    return this.run('drag', 'write', options, async () => {
      const steps = options.steps ?? 20, duration = options.durationMs ?? 300;
      assert(Number.isSafeInteger(steps) && steps >= 1 && steps <= 200 && Number.isSafeInteger(duration) && duration >= 0 && duration <= 30000, 'INVALID_ARGUMENT', 'Drag steps must be 1..200 and durationMs 0..30000.');
      await this.coordinateCheck([from, to]); checkAbort(options.signal);
      let x = from[0], y = from[1], pressed = false;
      try {
        await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        pressed = true;
        await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button:'left', buttons:1, clickCount:1 });
        for (let step = 1; step <= steps; step++) {
          await this.hold(duration / steps, options.signal);
          x = from[0] + (to[0]-from[0])*step/steps; y = from[1] + (to[1]-from[1])*step/steps;
          await this.cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x, y, button:'left', buttons:1 });
        }
      } finally {
        try { if (pressed) await this.cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', buttons:0, clickCount:1 }); }
        finally { this.invalidate(); }
      }
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
  goto(url: string, options: ActionOptions = {}): Promise<void> {
    return this.run('goto', 'write', options, async () => {
      const parsed = new URL(url);
      assert(['http:', 'https:', 'about:'].includes(parsed.protocol), 'INVALID_ARGUMENT', 'Only HTTP(S) and about URLs are supported.');
      assert(await this.config.authorize({ sessionId: this.config.sessionId, targetId: this.id, url, operation: 'navigate', effect: 'write' }), 'PERMISSION_DENIED', 'Destination denied.');
      checkAbort(options.signal);
      assert(this.config.active(), 'SESSION_CLOSED', 'Session ended while awaiting destination authorization.');
      assert(!this.closed, 'TARGET_NOT_FOUND', 'Handle released while awaiting destination authorization.');
      try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
      finally { this.invalidate(); }
    });
  }
  close(options: ActionOptions = {}): Promise<void> { return this.run('close', 'write', options, () => this.page.close()); }
  async dispose(): Promise<void> { this.closed = true; this.invalidate(); await this.collector.dispose(); await this.cdp.detach().catch(() => undefined); }
}
