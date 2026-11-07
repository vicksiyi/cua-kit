import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {ChatCompletionsModel, ModelHttpError} from '../packages/agent-loop/src/chat-model';

const input = {system:'fixture',messages:[],tools:[]};
for (const statuses of [[500,502,200], [503,503,503], [401], [402]]) {
 test(`bounded HTTP model retry ${statuses}`, async t=>{
  let calls=0;const events: unknown[]=[];const bodies:string[]=[];
  const server=createServer(async(req,res)=>{
   let body='';for await(const chunk of req)body+=chunk;bodies.push(body);
   const status=statuses[Math.min(calls++,statuses.length-1)];
   res.writeHead(status,{'Content-Type':'application/json'});
   res.end(status===200 ? JSON.stringify({choices:[{message:{content:'done'}}]}) : 'private-provider-body');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close()});
  const address=server.address();assert(address&&typeof address!=='string');
  const model=new ChatCompletionsModel({endpoint:`http://127.0.0.1:${address.port}`,apiKey:'fixture',model:'fixture',onRetry:event=>events.push(event)});
  if(statuses.at(-1)===200)assert.equal((await model.decide(input)).text,'done');
  else await assert.rejects(model.decide(input),error=>{
   assert(error instanceof ModelHttpError);assert.equal(error.attempts,statuses.length);
   assert.doesNotMatch(error.message,/private-provider-body/);return true;
  });
  assert.equal(calls,statuses.length);assert.equal(events.length,statuses.length-1);
  assert(bodies.every(body=>body===bodies[0]));
 });
}
test('abort during retry delay prevents another request',async t=>{
 let calls=0;const controller=new AbortController();
 const server=createServer((_req,res)=>{calls++;res.writeHead(500);res.end()});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close()});
 const address=server.address();assert(address&&typeof address!=='string');
 const model=new ChatCompletionsModel({endpoint:`http://127.0.0.1:${address.port}`,apiKey:'fixture',model:'fixture',onRetry:()=>controller.abort()});
 await assert.rejects(model.decide({...input,signal:controller.signal}),{name:'AbortError'});
 assert.equal(calls,1);
});
