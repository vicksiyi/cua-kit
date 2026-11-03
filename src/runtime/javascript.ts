import { parse } from 'acorn';
import { getQuickJS, type QuickJSContext, type QuickJSDeferredPromise } from 'quickjs-emscripten';
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
    goto: (...args) => invoke(id,'goto',args),
    close: (...args) => invoke(id,'close',args)
  });
  globalThis.cua = Object.freeze({
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
  private pending = new Set<QuickJSDeferredPromise>();
  private alive = true;
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
      const args = JSON.parse(vm.getString(request));
      const promise = vm.newPromise(), generation = this.generation;
      this.pending.add(promise);
      void this.dispatch(args, generation).then(value => ({ ok: true, value }), error => ({ ok: false, code: error instanceof CuaError ? error.code : 'EXECUTION_ERROR', message: String(error.message ?? error) }))
        .then(result => {
          if (!this.alive || generation !== this.generation) return;
          const handle = vm.newString(JSON.stringify(result));
          promise.resolve(handle); handle.dispose();
          this.pending.delete(promise); promise.dispose();
          this.pump();
        });
      return promise.handle;
    });
    vm.setProp(vm.global, '__bridge', bridge); bridge.dispose();
    vm.unwrapResult(vm.evalCode(bootstrap)).dispose();
  }
  private append(output: RuntimeOutput): void {
    const size = output.type === 'text' ? output.text.length : output.data.length;
    if (this.outputBytes + size > 8 * 1024 * 1024) throw new CuaError('INVALID_ARGUMENT', 'Output budget exceeded.');
    this.outputBytes += size; this.outputs.push(output);
  }
  private pump(): void {
    if (!this.alive) return;
    const result = this.vm.runtime.executePendingJobs();
    if (result.error) result.error.dispose();
  }
  private async dispatch(request: { target: unknown; method: unknown; args: unknown }, generation: number): Promise<unknown> {
    const emit = (output: RuntimeOutput) => { if (generation === this.generation) this.append(output); };
    if (typeof request.method !== 'string' || !Array.isArray(request.args)) throw new CuaError('INVALID_ARGUMENT', 'Malformed capability request.');
    if (Date.now() > this.deadline || this.currentAbort?.signal.aborted) throw new CuaError('CANCELLED', 'Cell deadline exceeded.');
    const args = request.args;
    if (request.target === null) {
      switch (request.method) {
        case 'getState': return this.cua.getState();
        case 'listBrowsers': return this.cua.listBrowsers();
        case 'listTabs': return this.cua.listTabs(args[0]);
        case 'getTab': case 'createBrowserTab': {
          const target = request.method === 'getTab'
            ? await this.cua.getTab(args[0], args[1])
            : await this.cua.createBrowserTab(args[0], args[1]);
          if (generation !== this.generation) throw new CuaError('CANCELLED', 'Retired cell.');
          this.tabs.set(target.id, target);
          emit({ type: 'text', text: await target.getAXState() });
          return target.id;
        }
        default: throw new CuaError('UNSUPPORTED_CAPABILITY', 'Unknown SDK method.');
      }
    }
    const tab = typeof request.target === 'string' ? this.tabs.get(request.target) : undefined;
    if (!tab) throw new CuaError('TARGET_NOT_FOUND', 'Handle does not belong to this runtime session.');
    const options = { signal: this.currentAbort?.signal };
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
      case 'pressKey': return tab.pressKey(args[0], args[1], options);
      case 'scroll': return tab.scroll(args[0], args[1], args[2], options);
      case 'goto': return tab.goto(args[0]);
      case 'close': return tab.close();
      default: throw new CuaError('UNSUPPORTED_CAPABILITY', 'Unknown target method.');
    }
  }
  execute(code: string, timeoutMs = 20000): Promise<ExecutionResult> {
    return this.queue.run(async () => {
      if (!this.alive) throw new CuaError('SESSION_CLOSED', 'JavaScript session ended.');
      if (this.needsReset) throw new CuaError('CANCELLED', 'Previous cell timed out; reset the session before continuing.');
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new CuaError('INVALID_ARGUMENT', 'timeoutMs must be in 1..60000.');
      this.outputs = []; this.outputBytes = 0; this.deadline = Date.now() + timeoutMs;
      this.currentAbort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let handle: import('quickjs-emscripten').QuickJSHandle | undefined;
      try {
        const result = this.vm.evalCode(compileCell(code));
        handle = this.vm.unwrapResult(result);
        const resolved = this.vm.resolvePromise(handle);
        this.pump();
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { this.currentAbort?.abort(); reject(new CuaError('CANCELLED', 'JavaScript cell deadline exceeded.')); }, timeoutMs);
        });
        const value = await Promise.race([resolved, deadline]);
        const data = this.vm.unwrapResult(value);
        try { return { value: this.vm.dump(data), output: this.outputs }; }
        finally { data.dispose(); }
      } finally {
        clearTimeout(timer); handle?.dispose();
        if (Date.now() > this.deadline || this.currentAbort?.signal.aborted) {
          this.currentAbort?.abort(); this.needsReset = true; this.generation++;
        }
        this.deadline = Infinity;
      }
    });
  }
  reset(): Promise<void> {
    return this.queue.run(async () => {
      this.currentAbort?.abort(); this.generation++;
      for (const promise of this.pending) promise.dispose(); this.pending.clear();
      this.vm.dispose(); this.tabs.clear(); await this.cua.reset();
      this.needsReset = false; await this.initialize();
    });
  }
  close(): Promise<void> {
    return this.queue.run(async () => {
      if (!this.alive) return;
      this.alive = false; this.currentAbort?.abort(); this.generation++;
      for (const promise of this.pending) promise.dispose(); this.pending.clear();
      this.vm.dispose(); await this.cua.endSession();
    });
  }
}
