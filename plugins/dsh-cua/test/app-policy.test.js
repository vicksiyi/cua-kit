import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Config, serverParameters } from '../src/config.js';
import { CuaConnection, formatApprovalReason } from '../src/connection.js';

const runtime = async config => JSON.parse((await serverParameters(Config(config))).env.CUA_MCP_ENV);

test('default DSH app policy enables approval requests for otherwise unlisted apps', async () => {
  const policy = JSON.parse((await runtime({surfaces:'computer'})).CORE_CUA_APP_POLICY);
  assert.deepEqual(policy, {'*':{decision:'allowed',risk:'high',allowPersistentApproval:false}});
});

test('allowlist mode, browser-only mode and app-server policy do not get a default allow rule', async () => {
  for (const config of [
    {surfaces:'computer',nativeAppPolicyMode:'allowlist'},
    {surfaces:'browser'},
    {surfaces:'computer',runtimeEnvironment:{CORE_CUA_POLICY_SOURCE:'app-server'}},
  ]) assert.equal((await runtime(config)).CORE_CUA_APP_POLICY, undefined);
});

test('an explicit app rule map, including an empty map, remains authoritative', async () => {
  for (const encoded of ['{}',JSON.stringify({'com.openai.codex':{decision:'denied',risk:'high',allowPersistentApproval:false}})]) {
    assert.equal((await runtime({runtimeEnvironment:{CORE_CUA_APP_POLICY:encoded}})).CORE_CUA_APP_POLICY, encoded);
  }
});

test('native app approval presents the resolved application identity and risk', () => {
  assert.equal(formatApprovalReason({message:'Allow Computer Use to use "Codex"?',_meta:{connector_id:'computer-use',tool_params:{app:'com.openai.codex'},riskLevel:'high',subtitle:'Only continue with user approval'}}),
    'CUA MCP confirmation:\nAllow Computer Use to use "Codex"?\nApplication: com.openai.codex\nRisk: high\nOnly continue with user approval');
  assert.equal(formatApprovalReason({message:'Allow a website?'}),'CUA MCP confirmation:\nAllow a website?');
});

test('real default policy reaches user approval and a rejection prevents app launch', {
  skip: process.platform !== 'darwin' || process.env.CUA_TEST_DSH_APP_POLICY !== '1', timeout:30000,
}, async () => {
  const root = await mkdtemp('/tmp/dsh-app-approval-');
  const identifier = 'com.core.fixture.dsh-approval';
  const path = join(root, 'ApprovalFixture.app');
  await mkdir(join(path,'Contents'),{recursive:true});
  await writeFile(join(path,'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleName</key><string>DSH Approval Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  let approvals = 0;
  const connection = new CuaConnection(await serverParameters(Config({surfaces:'computer'})), {
    approve: async params => {
      approvals++;
      assert.equal(params._meta?.connector_id,'computer-use');
      assert.equal(params._meta?.tool_params?.app,identifier);
      assert.equal(params._meta?.riskLevel,'high');
      return 'rejected';
    },
  });
  const exec = {signal:AbortSignal.timeout(20000)};
  try {
    assert.notEqual((await connection.call('js',{code:'await cua.getState();'},exec,1)).isError,true);
    const result = await connection.call('js',{code:`await cua.getApp(${JSON.stringify(path)});`},exec,1);
    assert.equal(approvals,1,'An unlisted app must ask the user, rather than fail at policy evaluation');
    assert.equal(result.isError,true);
    const text = result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
    assert.match(text,/Computer Use was not approved to use DSH Approval Fixture/);
    assert.doesNotMatch(text,/organization's policy/);
    await connection.endTurn(1);
  } finally {
    await connection.dispose();
    await rm(root,{recursive:true,force:true});
  }
});
