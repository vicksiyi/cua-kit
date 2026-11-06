import test from "node:test";
import assert from "node:assert/strict";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import { originalServiceBindings, serviceClassWithMethods, serviceSourceSha256 } from "./service-source";
const sourceClass = serviceClassWithMethods([
  "sendRequest", "handleIncomingMessage", "handleIncomingRequest", "rejectPendingRequests",
  "registerRequestHandler", "sendNotification", "addEventListener", "removeEventListener",
]);
const Original = originalServiceBindings([sourceClass])[sourceClass];

test("RPC errors preserve original rejection values rather than wrapping them as Error", async t => {
  t.diagnostic(`Installed browser-service ${serviceSourceSha256}; RPC class ${sourceClass}`);
  for (const message of ["Debugger unattached", "Detached while handling command", "", null, 42, {detail:"opaque"}]) {
    for (const Peer of [BrowserRpcPeer, Original]) {
      let received: any;
      let request: any;
      const peer = new Peer({setMessageCallback(fn: any) {received=fn;},sendMessage(value: any) {request=value;}});
      const pending = peer.sendRequest("executeCdp", {}).then(
        () => assert.fail("error response resolved"), (error: unknown) => error,
      );
      received({jsonrpc:"2.0",id:request.id,error:{code:1,message}});
      const rejected = await pending;
      assert.equal(rejected,message || "Something went wrong");
      assert.equal(rejected instanceof Error,false);
      assert.equal(peer.pendingRequests.size,0);
    }
  }
});

test("thrown provider strings and Error instances cross RPC as the original message string", async () => {
  for (const failure of ["Debugger unattached",new Error("Debugger unattached"),new Error("Detached while handling command")]) {
    for (const Peer of [BrowserRpcPeer, Original]) {
      let left: any, right: any;
      const replies: any[]=[];
      const client=new Peer({setMessageCallback(fn: any) {left=fn;},sendMessage(value: any) {queueMicrotask(()=>right(value));}});
      const server=new Peer({setMessageCallback(fn: any) {right=fn;},sendMessage(value: any) {replies.push(value);queueMicrotask(()=>left(value));}});
      server.registerRequestHandler("executeCdp",()=>{throw failure;});
      const result=await client.sendRequest("executeCdp",{}).catch((error: unknown)=>error);
      const expected=failure instanceof Error?failure.message:failure;
      assert.equal(result,expected);
      assert.deepEqual(replies[0].error,{code:1,message:expected});
    }
  }
});
