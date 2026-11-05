import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverOrStartChrome, BrowserStartupError } from '../packages/agent-loop/src/browser-startup';
import { IndependentBrowserUnavailableError } from '@core/native-host/browserConnector';

function fixture(sequence: (string[] | Error)[]) {
  let clock = 0, launched = 0, discovered = 0;
  return {
    dependencies: {
      discover: async (_directory: string) => {
        const value = sequence[Math.min(discovered++, sequence.length - 1)];
        if (value instanceof Error) throw value;
        return value;
      },
      launch: async () => { launched++; },
      now: () => clock,
      wait: async (ms: number) => { clock += ms; },
      report: (_message: string) => {},
    },
    state: () => ({clock, launched, discovered}),
  };
}
const absent = () => new IndependentBrowserUnavailableError('no_endpoints');
test('existing connection does not launch Chrome', async () => {
  const f = fixture([['endpoint']]);
  assert.deepEqual(await discoverOrStartChrome('/private', f.dependencies), ['endpoint']);
  assert.equal(f.state().launched, 0);
});
test('cold startup launches once and waits for the extension descriptor', async () => {
  const f = fixture([absent(), absent(), ['endpoint']]);
  assert.deepEqual(await discoverOrStartChrome('/private', f.dependencies), ['endpoint']);
  assert.equal(f.state().launched, 1);
  assert.equal(f.state().clock, 250);
});
test('missing installation and unsafe permissions do not trigger Chrome startup', async () => {
  for (const failure of [new IndependentBrowserUnavailableError('directory_missing'), new Error('unsafe permissions')]) {
    const f = fixture([failure]);
    await assert.rejects(discoverOrStartChrome('/private', f.dependencies), e => e === failure);
    assert.equal(f.state().launched, 0);
  }
});
test('timeout is bounded and offers explicit CDP deployment without switching profiles', async () => {
  const f = fixture([absent()]);
  await assert.rejects(discoverOrStartChrome('/private', f.dependencies, 500), e => e instanceof BrowserStartupError && /--cdp-browser/.test(e.message));
  assert.deepEqual(f.state(), {clock:500, launched:1, discovered:4});
});
test('launch failures retain cause and do not wait for a nonexistent startup', async () => {
  const f = fixture([absent()]);
  const cause = new Error('application missing');
  f.dependencies.launch = async () => { throw cause; };
  await assert.rejects(discoverOrStartChrome('/private', f.dependencies), e => e instanceof BrowserStartupError && e.cause === cause);
  assert.equal(f.state().clock, 0);
});
