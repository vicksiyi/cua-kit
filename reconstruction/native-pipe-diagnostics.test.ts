import test from "node:test";
import assert from "node:assert/strict";
import { createNativePipeDiagnostics } from "../packages/agent-loop/src/native-pipe-diagnostics";
function setup() {
  const lines: string[] = [];
  const observer = createNativePipeDiagnostics(line => lines.push(line));
  observer.observe({type:"native_pipe_request",id:"secret-id",op:"connect",path:"/private/secret"},"request");
  observer.observe({type:"native_pipe_response",id:"secret-id",ok:true,result:{connection_id:"secret-connection"}},"response");
  const send = (bytes: Buffer) => observer.observe({type:"native_pipe_data",connection_id:"secret-connection",data_base64:bytes.toString("base64")},"response");
  return {lines, observer, send};
}
function frame(value: unknown) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header,body]);
}
test("native diagnostics decode split handshake and error frames without leaking contents", () => {
  const {lines, observer, send} = setup();
  const bytes = Buffer.concat([frame({jsonrpc:"2.0",id:1,result:{serverApiVersion:"private-version"}}), frame({jsonrpc:"2.0",id:2,error:{code:-10000,message:"secret-token"}})]);
  for (let offset=0; offset<bytes.length; offset+=3) send(bytes.subarray(offset,offset+3));
  observer.observe({type:"native_pipe_closed",connection_id:"secret-connection",error:"secret-error"},"response");
  assert.deepEqual(lines,["native pipe #1 connected","native pipe #1 handshake response received","native pipe #1 JSON-RPC error code -10000","native pipe #1 closed with transport error"]);
  assert.doesNotMatch(lines.join("\n"), /secret|private/);
});
test("oversize frames stop inspection without treating payload as a new frame", () => {
  const {lines,send,observer} = setup();
  const header=Buffer.alloc(4);header.writeUInt32LE(5000);send(header);
  send(frame({jsonrpc:"2.0",error:{code:-10000}}));
  assert.deepEqual(lines,["native pipe #1 connected"]);
  observer.close();
});
