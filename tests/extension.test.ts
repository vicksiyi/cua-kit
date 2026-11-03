import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCua } from '../src/index.js';
import { ExtensionBridge } from '../src/extension/bridge.js';

test('real extension + native messaging: explicit grants, debugger AX/screenshot and revoke', { timeout: 30000 }, async () => {
  const { extensionId } = JSON.parse(await readFile('extensions/chrome/identity.json', 'utf8'));
  const bridge = await ExtensionBridge.listen(extensionId);
  const profile = await mkdtemp(join(tmpdir(), 'cua-extension-test-'));
  const server = createServer((_, response) => { response.setHeader('Content-Type','text/html'); response.end('<h1>Extension fixture</h1><button onclick="this.textContent=\'Clicked by extension\'">Press</button>'); }).listen(0);
  await once(server,'listening');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await bridge.installHost(profile, resolve('dist/extension/native-host.js'));
    const extension = resolve('dist/chrome-extension');
    context = await chromium.launchPersistentContext(profile, { channel:'chromium', headless:true, args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const tab = await context.newPage();
    const url = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
    await tab.goto(url);
    // Drive the same consent callback as the extension action, in a disposable test profile only.
    const tabId = await worker.evaluate(async url => {
      const tabs = await (globalThis as any).chrome.tabs.query({});
      const tab = tabs.find((tab: any) => tab.url.startsWith(url));
      await (globalThis as any).cuaTestGrant(tab.id); return tab.id;
    }, url);
    await bridge.waitForReady(10000);
    assert.deepEqual((await bridge.listTabs()).map(tab => tab.id), [tabId]);
    await assert.rejects(bridge.attach(tabId + 99999), /not granted/);
    await bridge.attach(tabId);
    await bridge.send(tabId,'Accessibility.enable');
    const state = await bridge.send(tabId,'Accessibility.getFullAXTree');
    assert.ok(state.nodes.some((node: any) => node.name?.value === 'Extension fixture'));
    const shot = await bridge.send(tabId,'Page.captureScreenshot',{format:'png'});
    assert.equal(Buffer.from(shot.data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const provider = await createCua({ extensionBridge:bridge, authorize: () => true });
    assert.ok((await provider.listBrowsers()).some(browser => browser.id === 'chrome-extension'));
    const apiTab = await provider.getTab(`ext:${tabId}`);
    const observed = await apiTab.observe({ screenshot:true });
    const button = observed.elements.find(node => node.role === 'button' && node.name === 'Press');
    assert.ok(button); await apiTab.click(button.id);
    assert.match(await apiTab.getAXState(), /Clicked by extension/);
    await provider.endSession();
    assert.equal(tab.isClosed(), false, 'Closing SDK detaches but preserves user-owned tabs');
    await bridge.attach(tabId);
    assert.equal(await tab.locator('button').textContent(),'Clicked by extension');
    await assert.rejects(bridge.send(tabId,'Page.navigate',{url:'https://not-granted.example'}), /granted origin/);
    await worker.evaluate(async id => { await (globalThis as any).cuaTestRevoke(id); },tabId);
    await assert.rejects(bridge.send(tabId,'Accessibility.getFullAXTree'), /not granted/);
    await worker.evaluate(async id => { await (globalThis as any).cuaTestGrant(id); }, tabId);
    await bridge.attach(tabId);
    const revoked = once(bridge, 'revoked');
    await tab.goto(url.replace('127.0.0.1','localhost')); await revoked;
    assert.deepEqual(await bridge.listTabs(), [], 'Cross-origin user navigation revokes the grant');
  } finally { await context?.close(); await bridge.close(); await rm(profile,{recursive:true,force:true}); server.close(); }
});
