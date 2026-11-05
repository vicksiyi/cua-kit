import test from 'node:test';
import assert from 'node:assert/strict';
import { MacApp, type MacProvider } from '../src/native/provider.js';
import { CuaError } from '../src/core/errors.js';

function fixture(options: {denied?: boolean; fail?: boolean; restored?: boolean} = {}) {
  const calls: Array<{method:string; params:Record<string,unknown>}> = [];
  const provider = {
    sessionId: 'fixture',
    authorize: async (_id: string, _app: unknown, operation: string) => {
      if (options.denied && operation === 'paste') throw new CuaError('PERMISSION_DENIED','Denied');
    },
    helper: {request: async (method:string, params:Record<string,unknown>) => {
      calls.push({method,params});
      if (method === 'observe') return {snapshotId:'snapshot',elements:[],warnings:[]};
      if (method === 'pasteFormatted') {
        if (options.fail) throw new CuaError('ACTION_OUTCOME_UNKNOWN','Native input uncertain');
        return {outcome:'observed',verification:'AXValue',clipboardRestored:options.restored ?? true};
      }
      throw Error(`Unexpected native call ${method}`);
    }},
  } as unknown as MacProvider;
  return {calls,app:new MacApp('target',{pid:1,name:'Fixture',bundleId:'test.fixture',path:'/Fixture.app',launchTime:1},provider)};
}

test('public native paste forwards raw formats without TS clipboard or renderer calls', async () => {
  for (const format of ['text','md','html'] as const) {
    const {app,calls} = fixture();
    await app.observe();
    const text = '**hello** <b>世界</b>';
    assert.deepEqual(await app.paste(text,{format}),{outcome:'observed',verification:'AXValue',clipboardRestored:true});
    assert.deepEqual(calls.map(call=>call.method),['observe','pasteFormatted']);
    assert.deepEqual(calls[1]!.params,{targetId:'target',snapshotId:'snapshot',text,format,timeoutMs:2000});
    await assert.rejects(app.paste('again'),{code:'STALE_OBSERVATION'});
  }
});
test('public native paste blocks denied or cancelled requests before native dispatch', async () => {
  for (const denied of [false,true]) {
    const {app,calls} = fixture({denied});
    await app.observe();
    await assert.rejects(app.paste('x',denied?{}:{signal:AbortSignal.abort()}),{code:denied?'PERMISSION_DENIED':'CANCELLED'});
    assert.deepEqual(calls.map(call=>call.method),['observe']);
  }
});
test('public native paste invalidates snapshot on failure and rejects incomplete restoration', async () => {
  for (const options of [{fail:true},{restored:false}]) {
    const {app,calls} = fixture(options);
    await app.observe();
    await assert.rejects(app.paste('x'),{code:'ACTION_OUTCOME_UNKNOWN'});
    await assert.rejects(app.paste('x'),{code:'STALE_OBSERVATION'});
    assert.equal(calls.filter(call=>call.method==='pasteFormatted').length,1);
  }
});

test('native paste shares browser clipboard scheduling and rechecks cancellation while queued', async () => {
  const {runClipboardOperation} = await import('../src/core/clipboard.js');
  let release!: () => void;
  const blocked = runClipboardOperation(()=>new Promise<void>(resolve=>{release=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));
  const {app,calls} = fixture();
  await app.observe();
  const abort = new AbortController();
  const pending = app.paste('queued',{signal:abort.signal});
  const rejected = assert.rejects(pending,{code:'CANCELLED'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.map(call=>call.method),['observe']);
  abort.abort(); release();
  await blocked; await rejected;
  assert.deepEqual(calls.map(call=>call.method),['observe']);
});
