import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { extractNodeReplSources } from '../scripts/extract-node-repl-sources.mjs';
import { createResponseMetaTracer } from '../packages/node-repl/src/tracing';
const { files } = await extractNodeReplSources(process.env.CUA_NODE_REPL_BINARY);
const sourceModule = { exports: {} as any };
new Function('require', 'module', files['tracing.js'])((id: string) => {
  if (id === 'node:async_hooks') return { AsyncLocalStorage };
  if (id === 'node:perf_hooks') return { performance };
  throw new Error(id);
}, sourceModule);
async function compare(run: (factory: any) => Promise<any>) {
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  const outputs = [];
  try {
    for (const factory of [sourceModule.exports.createResponseMetaTracer, createResponseMetaTracer]) {
      let tick = 0;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => ++tick / 3 });
      outputs.push(await run(factory));
    }
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor);
    else delete (performance as any).now;
  }
  assert.deepEqual(outputs[1], outputs[0]);
  return outputs[1];
}
test('tracing preserves nested async spans, result attributes, errors and idempotent end', async () => {
  const out = await compare(async factory => {
    const exec = { id: 'exec', requestMeta: {} };
    const tracer = factory({ enabled: true, getCurrentExecState: () => exec });
    const result = await tracer.bridge.withSpan('parent', { a: 1 }, async () => {
      await Promise.resolve();
      const child = tracer.bridge.startSpan('child', { overwritten: 1 });
      child.end({ attrs: { overwritten: 2 } }); child.end({ status: 'error' });
      await assert.rejects(tracer.bridge.withSpan('failure', {}, () => { throw new TypeError('private'); }), TypeError);
      return 42;
    }, { resultAttrs: (value: number) => ({ answer: value }) });
    const trace = tracer.buildTrace(exec);
    return { result, trace, second: tracer.buildTrace(exec), frozen: Object.isFrozen(tracer) && Object.isFrozen(tracer.bridge) };
  });
  assert.equal(out.result, 42);
  assert.equal(out.trace.spans.length, 3);
  assert.equal(out.trace.spans[1].parent_id, 'span-1');
  assert.equal(out.trace.spans[2].attrs['error.kind'], 'TypeError');
  assert.equal(out.second, null);
});
test('tracing retains enablement, Unicode limits, attribute filters and dropped-span accounting', async () => {
  const out = await compare(async factory => {
    let available = false;
    const exec = { id: 'exec', requestMeta: { traceparent: undefined as unknown } };
    const tracer = factory({ enabled: false, getCurrentExecState: () => { if (!available) throw Error('inactive'); return exec; } });
    const enabled = [tracer.isEnabled()];
    tracer.bridge.startSpan('disabled').end();
    available = true; enabled.push(tracer.isEnabled());
    exec.requestMeta.traceparent = ''; enabled.push(tracer.isEnabled());
    const attrs = { '': 1, bad: Infinity, array: [], bool: false, unicode: '😀'.repeat(300), ['😀'.repeat(129)]: 1, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['key'+i, i])) };
    const span = tracer.bridge.startSpan('😀'.repeat(140), attrs);
    span.end();
    for (let i = 0; i < 1025; i++) tracer.bridge.startSpan('').end();
    return { enabled, trace: tracer.buildTrace(exec) };
  });
  assert.deepEqual(out.enabled, [false, false, true]);
  assert.equal(out.trace.spans.length, 1024);
  assert.equal(out.trace.dropped_span_count, 2);
  assert.equal([...out.trace.spans[0].name].length, 128);
  assert.equal([...out.trace.spans[0].attrs.unicode].length, 256);
  assert.equal(Object.keys(out.trace.spans[0].attrs).length, 32);
});
test('tracing preserves result callback isolation, detached end and execution map cleanup', async () => {
  await compare(async factory => {
    let exec = { id: 'one' };
    const tracer = factory({ enabled: true, getCurrentExecState: () => exec });
    const detached = tracer.bridge.startSpan('late');
    const empty = tracer.buildTrace(exec);
    detached.end();
    const discarded = tracer.buildTrace(exec);
    const values = [];
    for (const callback of [() => { throw Error('ignored'); }, () => [], () => new Date(0)]) {
      values.push(await tracer.bridge.withSpan('result', {}, () => 'value', { resultAttrs: callback }));
    }
    values.push(await tracer.bridge.withSpan('invalid', {}, null));
    const first = tracer.buildTrace(exec);
    exec = { id: 'two' };
    try { await tracer.bridge.withSpan('non-error', {}, () => { throw 'reason'; }); } catch {}
    return { empty, discarded, values, first, second: tracer.buildTrace(exec) };
  });
});
