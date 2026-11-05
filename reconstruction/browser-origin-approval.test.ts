import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserOriginApproval } from '../packages/agent-loop/src/browser-origin-approval';
const request = (origin = 'https://www.google.com'): any => ({mode:'form',message:`Allow Browser use to access ${origin}?`,requestedSchema:{type:'object',properties:{}},_meta:{connector_id:'browser-use',tool_name:'access_browser_origin',codex_request_type:'approval_request',origin,tool_params:{origin}}});
test('no configuration preserves terminal capability and absence', () => {
  assert.equal(createBrowserOriginApproval({}),undefined);
  const fallback = async () => ({action:'cancel' as const});
  assert.equal(createBrowserOriginApproval({fallback}),fallback);
});
test('explicit origins permit exact origin only, including port and scheme', async () => {
  const handler=createBrowserOriginApproval({origins:'https://www.google.com,http://localhost:8080'})!;
  assert.equal((await handler(request())).action,'accept');
  for(const origin of ['http://www.google.com','https://www.google.com.evil.test','https://www.google.com:8443','http://localhost:8081']) assert.equal((await handler(request(origin))).action,'cancel');
});
test('wildcard approves browser access only; other forms still reach host UI', async () => {
  let fallbacks=0;
  const handler=createBrowserOriginApproval({origins:'*',fallback:async()=>{fallbacks++;return {action:'decline'};}})!;
  assert.equal((await handler(request('https://example.org'))).action,'accept');
  const variants=[request(),request(),request(),request(),request(),request()];
  variants[0]._meta.tool_name='send_message';
  variants[1]._meta.tool_params.origin='https://different.test';
  variants[2].requestedSchema.properties={password:{type:'string'}};
  variants[3]._meta=undefined;
  variants[4].mode='url';variants[4].url='https://example.org';
  variants[5]._meta.connector_id='another-connector';
  for(const r of variants) assert.equal((await handler(r)).action,'decline');
  assert.equal(fallbacks,variants.length);
});
test('configuration rejects URL paths, credentials, non-HTTP and partial wildcards',()=>{
  for(const origins of ['https://example.org/path','https://user:pass@example.org','file:///tmp','https://*.example.org/*','']) {
    if(origins) assert.throws(()=>createBrowserOriginApproval({origins}));
  }
});
test('cancellation prevents automatic and fallback acceptance',async()=>{
  const c=new AbortController();c.abort();
  assert.equal((await createBrowserOriginApproval({origins:'*',signal:c.signal})!(request())).action,'cancel');
});
