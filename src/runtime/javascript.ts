import { parse } from 'acorn';
import { getQuickJS, type QuickJSContext, type QuickJSDeferredPromise } from 'quickjs-emscripten';
import type { MacApp } from '../native/provider.js';
import type { Cua, CuaTab } from '../index.js';
import { SerialQueue } from '../core/serial.js';
import { CuaError } from '../core/errors.js';

export type RuntimeOutput = { type: 'text'; text: string } | { type: 'image'; mimeType: 'image/png'; data: string };
export interface ExecutionResult { value?: unknown; output: RuntimeOutput[] }

/** REPL declarations become session globals; block/function-local declarations stay local. */
function compileCell(code: string): string {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true });
  const parts = ast.body.map((statement, index) => {
    if (statement.type === 'VariableDeclaration') {
      return statement.declarations.map(declaration => {
        if (declaration.id.type !== 'Identifier') throw new CuaError('INVALID_ARGUMENT', 'Top-level destructuring is not yet supported by the REPL.');
        const value = declaration.init ? code.slice(declaration.init.start, declaration.init.end) : 'undefined';
        return `globalThis[${JSON.stringify(declaration.id.name)}] = (${value});`;
      }).join('\n');
    }
    if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
      if (!statement.id) throw new CuaError('INVALID_ARGUMENT', 'Declaration requires a name.');
      return `globalThis[${JSON.stringify(statement.id.name)}] = (${code.slice(statement.start, statement.end)});`;
    }
    if (statement.type === 'ExpressionStatement' && index === ast.body.length - 1) return `return (${code.slice(statement.expression.start, statement.expression.end)});`;
    return code.slice(statement.start, statement.end);
  });
  return `(async () => {\n${parts.join('\n')}\n})()`;
}

const bootstrap = `(() => {
  const invoke = async (target, method, args) => {
    const result = JSON.parse(await __bridge(JSON.stringify({target,method,args})));
    if (!result.ok) { const e = new Error(result.message); e.code = result.code; throw e; }
    return result.value;
  };
  const tab = id => Object.freeze({
    id,
    observe: (...args) => invoke(id,'observe',args),
    getAXState: (...args) => invoke(id,'getAXState',args),
    getScreenshot: (...args) => invoke(id,'getScreenshot',args),
    getAXStateAndScreenshot: (...args) => invoke(id,'getAXStateAndScreenshot',args),
    click: (...args) => invoke(id,'click',args),
    typeText: (...args) => invoke(id,'typeText',args),
    setValue: (...args) => invoke(id,'setValue',args),
    pressKey: (...args) => invoke(id,'pressKey',args),
    scroll: (...args) => invoke(id,'scroll',args),
    drag: (...args) => invoke(id,'drag',args),
    selectText: (...args) => invoke(id,'selectText',args),
    goto: (...args) => invoke(id,'goto',args),
    close: (...args) => invoke(id,'close',args)
  });
  const app = id => Object.freeze({ id,
    listWindows: (...args) => invoke(id,'listWindows',args),
    getScreenshot: (...args) => invoke(id,'getScreenshot',args),
    getAXStateAndScreenshot: (...args) => invoke(id,'getAXStateAndScreenshot',args),
    observe: (...args) => invoke(id,'observe',args),
    getAXState: (...args) => invoke(id,'getAXState',args),
    click: (...args) => invoke(id,'click',args),
    setValue: (...args) => invoke(id,'setValue',args)
  });
  globalThis.cua = Object.freeze({
    listApps: () => invoke(null,'listApps',[]),
    getApp: async (...args) => app(await invoke(null,'getApp',args)),
    getState: () => invoke(null,'getState',[]),
    listBrowsers: () => invoke(null,'listBrowsers',[]),
    listTabs: (...args) => invoke(null,'listTabs',args),
    getTab: async (...args) => tab(await invoke(null,'getTab',args)),
    createBrowserTab: async (...args) => tab(await invoke(null,'createBrowserTab',args))
  });
  globalThis.nodeRepl = Object.freeze({ write: value => __write(JSON.stringify(value)) });
  globalThis.console = Object.freeze({ log: (...values) => __write(values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')) });
})();`;

/** No host require/process/fs/net is injected. This is an engine boundary, not an OS sandbox claim. */
export class JavascriptSession {
  private vm!: QuickJSContext;
  private queue = new SerialQueue();
  private outputs: RuntimeOutput[] = [];
  private tabs = new Map<string, CuaTab>();
  private apps = new Map<string, MacApp>();
  private pending = new Set<QuickJSDeferredPromise>();
  private inFlight = new Set<Promise<void>>();
  private hostOutstanding = 0;
  private alive = true;
  private closing = false;
  private needsReset = false;
  private generation = 0;
  private deadline = Infinity;
  private currentAbort?: AbortController;
  private outputBytes = 0;
  private constructor(private cua: Cua) {}
  static async create(cua: Cua): Promise<JavascriptSession> {
    const session = new JavascriptSession(cua); await session.initialize(); return session;
  }
  private async initialize(): Promise<void> {
    this.deadline = Infinity; this.currentAbort = undefined;
    this.vm = (await getQuickJS()).newContext();
    const vm = this.vm;
    vm.runtime.setMemoryLimit(32 * 1024 * 1024);
    vm.runtime.setMaxStackSize(512 * 1024);
    vm.runtime.setInterruptHandler(() => Date.now() > this.deadline || !!this.currentAbort?.signal.aborted);
    vm.runtime.setModuleLoader(() => { throw new Error('Module imports are disabled.'); });
    const write = vm.newFunction('__write', handle => {
      const text = vm.getString(handle);
      this.append({ type: 'text', text });
      return vm.undefined;
    });
    vm.setProp(vm.global, '__write', write); write.dispose();
    const bridge = vm.newFunction('__bridge', request => {
      const serialized = vm.getString(request);
      if (serialized.length > 1024 * 1024 || this.hostOutstanding >= 64) throw new CuaError('INVALID_ARGUMENT', 'Capability request size or concurrency budget exceeded.');
      const args = JSON.parse(serialized);
      const promise = vm.newPromise(), generation = this.generation;
      this.pending.add(promise);
      const inFlight = this.inFlight; this.hostOutstanding++;
      const task = this.dispatch(args, generation, this.currentAbort?.signal).then(value => ({ ok: true, value }), error => ({ ok: false, code: error instanceof CuaError ? error.code : 'EXECUTION_ERROR', message: String(error.message ?? error) }))
        .then(result => {
          if (!this.alive || generation !== this.generation) return;
          const handle = vm.newString(JSON.stringify(result));
          promise.resolve(handle); handle.dispose();
          this.pending.delete(promise); promise.dispose();
          this.pump();
        }).catch(() => { if (generation === this.generation) this.currentAbort?.abort(); }).finally(() => { inFlight.delete(task); this.hostOutstanding--; });
      inFlight.add(task);
      return promise.handle;
    });
    vm.setProp(vm.global, '__bridge', bridge); bridge.dispose();
    vm.unwrapResult(vm.evalCode(bootstrap)).dispose();
  }
  private append(output: RuntimeOutput): void {
    const size = output.type === 'text' ? Buffer.byteLength(output.text, 'utf8') : output.data.length;
    if (this.outputBytes + size > 8 * 1024 * 1024) throw new CuaError('INVALID_ARGUMENT', 'Output budget exceeded.');
    this.outputBytes += size; this.outputs.push(output);
  }
  private pump(): void {
    if (!this.alive) return;
    const result = this.vm.runtime.executePendingJobs();
    if (result.error) result.error.dispose();
  }
  private async dispatch(request: { target: unknown; method: unknown; args: unknown }, generation: number, signal?: AbortSignal): Promise<unknown> {
    const emit = (output: RuntimeOutput) => { if (generation === this.generation) this.append(output); };
    if (typeof request.method !== 'string' || !Array.isArray(request.args)) throw new CuaError('INVALID_ARGUMENT', 'Malformed capability request.');
    if (Date.now() > this.deadline || this.currentAbort?.signal.aborted) throw new CuaError('CANCELLED', 'Cell deadline exceeded.');
    const args = request.args;
    if (request.target === null) {
      switch (request.method) {
        case 'listApps': return this.cua.listApps();
        case 'getApp': {
          const app = await this.cua.getApp(args[0], { signal });
          if (generation !== this.generation) { await app.release(); throw new CuaError('CANCELLED', 'Retired cell.'); }
          this.apps.set(app.id, app); emit({ type: 'text', text: await app.getAXState({ signal }) }); return app.id;
        }
        case 'getState': return this.cua.getState();
        case 'listBrowsers': return this.cua.listBrowsers();
        case 'listTabs': return this.cua.listTabs(args[0]);
        case 'getTab': case 'createBrowserTab': {
          const target = request.method === 'getTab'
            ? await this.cua.getTab(args[0], { ...args[1], signal })
            : await this.cua.createBrowserTab(args[0], args[1], { signal });
          if (generation !== this.generation) throw new CuaError('CANCELLED', 'Retired cell.');
          this.tabs.set(target.id, target);
          emit({ type: 'text', text: await target.getAXState({ signal }) });
          return target.id;
        }
        default: throw new CuaError('UNSUPPORTED_CAPABILITY', 'Unknown SDK method.');
      }
    }
    const app = typeof request.target === 'string' ? this.apps.get(request.target) : undefined;
    if (app) {
      const options = { signal };
      switch (request.method) {
        case 'observe': {
          const result = await app.observe({ ...args[0], ...options });
          if (result.screenshot) {
            const { bytes, ...metadata } = result.screenshot;
            emit({ type: 'image', mimeType: 'image/png', data: Buffer.from(bytes).toString('base64') });
            return { ...result, screenshot: { ...metadata, emitted: true } };
          }
          return result;
        }
        case 'listWindows': return app.listWindows(options);
        case 'getScreenshot': {
          const result = await app.captureScreenshot({ ...args[0], ...options });
          const { bytes, ...metadata } = result;
          emit({ type: 'image', mimeType: 'image/png', data: Buffer.from(bytes).toString('base64') });
          return { ...metadata, emitted: true };
        }
        case 'getAXStateAndScreenshot': {
          const result = await app.getAXStateAndScreenshot({ ...args[0], ...options });
          emit({ type: 'text', text: result.state });
          emit({ type: 'image', mimeType: 'image/png', data: Buffer.from(result.screenshot).toString('base64') });
          return { state: result.state, screenshotEmitted: true };
        }
        case 'getAXState': { const text = await app.getAXState(options); emit({ type: 'text', text }); return text; }
        case 'click': return app.click(args[0], options);
        case 'setValue': return app.setValue(args[0], args[1], options);
        default: throw new CuaError('UNSUPPORTED_CAPABILITY', 'Native target does not support this method.');
      }
    }
    const tab = typeof request.target === 'string' ? this.tabs.get(request.target) : undefined;
    if (!tab) throw new CuaError('TARGET_NOT_FOUND', 'Handle does not belong to this runtime session.');
    const options = { signal };
    switch (request.method) {
      case 'observe': return tab.observe({ ...args[0], ...options });
      case 'getAXState': {
        const text = await tab.getAXState({ ...args[0], ...options }); emit({ type: 'text', text }); return text;
      }
      case 'getScreenshot': {
        const bytes = await tab.getScreenshot(options);
        emit({ type: 'image', mimeType: 'image/png', data: Buffer.from(bytes).toString('base64') });
        return { emitted: true, mimeType: 'image/png', bytes: bytes.byteLength };
      }
      case 'getAXStateAndScreenshot': {
        const result = await tab.getAXStateAndScreenshot({ ...args[0], ...options });
        emit({ type: 'text', text: result.state });
        emit({ type: 'image', mimeType: 'image/png', data: Buffer.from(result.screenshot).toString('base64') });
        return { state: result.state, screenshotEmitted: true };
      }
      case 'click': return tab.click(args[0], { ...args[1], ...options });
      case 'typeText': return tab.typeText(args[0], args[1], options);
      case 'setValue': return tab.setValue(args[0], args[1], options);
      case 'pressKey': return tab.pressKey(args[0], args[1], { ...args[2], ...options });
      case 'selectText': return tab.selectText(args[0], args[1], { ...args[2], ...options });
      case 'drag': return tab.drag(args[0], args[1], { ...args[2], ...options });
      case 'scroll': return tab.scroll(args[0], args[1], args[2], options);
      case 'goto': return tab.goto(args[0], options);
      case 'close': return tab.close(options);
      default: throw new CuaError('UNSUPPORTED_CAPABILITY', 'Unknown target method.');
    }
  }
  execute(code: string, timeoutMs = 20000, options: { signal?: AbortSignal } = {}): Promise<ExecutionResult> {
    return this.queue.run(async () => {
      if (!this.alive || this.closing) throw new CuaError('SESSION_CLOSED', 'JavaScript session ended.');
      if (this.needsReset) throw new CuaError('CANCELLED', 'Previous cell was interrupted; reset before continuing.');
      if (options.signal?.aborted) throw new CuaError('CANCELLED', 'Execution cancelled before dispatch.');
      if (typeof code !== 'string' || code.length > 100000) throw new CuaError('INVALID_ARGUMENT', 'Cell source exceeds 100000 characters.');
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new CuaError('INVALID_ARGUMENT', 'timeoutMs must be in 1..60000.');
      this.outputs = []; this.outputBytes = 0; this.deadline = Date.now() + timeoutMs;
      const controller = new AbortController(); this.currentAbort = controller;
      const cancel = () => controller.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
      let rejectAbort: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new CuaError('CANCELLED', 'Cell interrupted; in-flight actions may have taken effect. Reset and observe.')); });
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
      const timer = setTimeout(cancel, timeoutMs);
      let handle: import('quickjs-emscripten').QuickJSHandle | undefined;
      try {
        const work = (async () => {
          const result = this.vm.evalCode(compileCell(code)); handle = this.vm.unwrapResult(result);
          const resolved = this.vm.resolvePromise(handle); this.pump();
          const value = await resolved;
          const data = this.vm.unwrapResult(value);
          let dumped: unknown;
          try { dumped = this.vm.dump(data); } finally { data.dispose(); }
          // No fire-and-forget host work crosses a successful cell boundary.
          while (this.inFlight.size) await Promise.all([...this.inFlight]);
          return { value: dumped, output: structuredClone(this.outputs) };
        })();
        return await Promise.race([work, cancelled]);
      } finally {
        clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
        controller.signal.removeEventListener('abort', rejectAbort); handle?.dispose();
        if (Date.now() > this.deadline || controller.signal.aborted || this.inFlight.size) {
          controller.abort(); this.needsReset = true; this.generation++;
        }
        this.deadline = Infinity;
      }
    });
  }
  reset(): Promise<void> {
    if (!this.alive || this.closing) return Promise.reject(new CuaError('SESSION_CLOSED', 'JavaScript session ended.'));
    this.needsReset = true; this.currentAbort?.abort();
    return this.queue.run(async () => {
      this.currentAbort?.abort(); this.generation++;
      for (const promise of this.pending) promise.dispose(); this.pending.clear(); this.inFlight = new Set();
      this.vm.dispose(); this.tabs.clear(); this.apps.clear(); await this.cua.reset();
      this.needsReset = false; await this.initialize();
    });
  }
  close(): Promise<void> {
    this.closing = true; this.currentAbort?.abort();
    return this.queue.run(async () => {
      if (!this.alive) return;
      this.alive = false; this.currentAbort?.abort(); this.generation++;
      for (const promise of this.pending) promise.dispose(); this.pending.clear(); this.inFlight = new Set();
      this.vm.dispose(); await this.cua.endSession();
    });
  }
}
