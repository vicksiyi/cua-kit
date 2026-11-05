import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProcessWorkerPort } from "../packages/runtime-supervisor/src/process-port";
const skip=process.platform==="win32";
const start=(code:string,limits:Record<string,number>={})=>ProcessWorkerPort.start({command:process.execPath,args:["-e",code],cwd:tmpdir(),env:{},terminateGraceMs:20,...limits});
const next=(port:ProcessWorkerPort)=>new Promise<any>((resolve,reject)=>{
 const timer=setTimeout(()=>{off();reject(Error("Message timed out"));},3000);
 const off=port.onMessage(message=>{clearTimeout(timer);off();resolve(message);});
});
const exited=(port:ProcessWorkerPort)=>new Promise<void>(resolve=>{port.onExit(resolve);});
test("process port frames fragmented UTF-8 JSONL and inherits no ambient token",{skip},async()=>{
 process.env.CUA_TEST_SECRET="not-for-worker";
 const port=await start(`const b=Buffer.from(JSON.stringify({text:"你好🌍",secret:process.env.CUA_TEST_SECRET??null})+"\\n");process.stdout.write(b.subarray(0,11));setTimeout(()=>{process.stdout.write(b.subarray(11));},10);setInterval(()=>{},1000);`);
 try{assert.deepEqual(await next(port),{text:"你好🌍",secret:null});}finally{await port.close();delete process.env.CUA_TEST_SECRET;}
});
test("malformed, oversized and unterminated frames retire workers",{skip},async()=>{
 for(const code of ['process.stdout.write("bad\\n");setInterval(()=>{},1000);','process.stdout.write("x".repeat(1025));setInterval(()=>{},1000);','process.stdout.write("{\\"value\\":1}");']){
  const port=await start(code,{maxFrameBytes:1024,maxQueuedBytes:2048});await exited(port);assert.ok(port.error);await port.close();
 }
});
test("startup output and oversized input are bounded",{skip},async()=>{
 const noisy=await start('process.stdout.write((JSON.stringify({value:"1234567890"})+"\\n").repeat(500));setInterval(()=>{},1000);',{maxFrameBytes:128,maxQueuedBytes:256});
 await exited(noisy);assert.ok(noisy.error);await noisy.close();
 const port=await start('setInterval(()=>{},1000);',{maxFrameBytes:1024,maxQueuedBytes:2048});
 try{assert.throws(()=>port.send({value:"x".repeat(1025)}),/limit/);}finally{await port.close();}
});
test("closing worker group terminates its ordinary descendants",{skip},async()=>{
 const port=await start(`const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",env:{}});console.log(JSON.stringify({child:child.pid}));setInterval(()=>{},1000);`);
 const {child}=await next(port);assert.ok(Number.isInteger(child));
 await port.close();
 const deadline=Date.now()+2000;
 while(true){
  let alive=false;
  try{const {stdout}=await promisify(execFile)("/bin/ps",["-o","stat=","-p",String(child)]);alive=!!stdout.trim()&&!stdout.trim().startsWith("Z");}catch{}
  if(!alive)break;assert.ok(Date.now()<deadline,"Owned descendant survived group retirement");await new Promise(resolve=>setTimeout(resolve,20));
 }
});
test("spawn failures reject without returning an unusable port",{skip},async()=>{
 await assert.rejects(ProcessWorkerPort.start({command:"/nonexistent/core-worker",args:[],cwd:tmpdir(),env:{}}),/ENOENT/);
});

test("final complete frame is delivered before a normal worker exit",{skip},async()=>{
 const port=await start('process.stdout.write(JSON.stringify({result:"final"})+"\\n");');
 try{assert.deepEqual(await next(port),{result:"final"});await exited(port);assert.equal(port.error,undefined);}finally{await port.close();}
});

test("a worker that never reads input cannot accumulate an unbounded write queue",{skip},async()=>{
 const port=await start('setInterval(()=>{},1000);',{maxFrameBytes:1024,maxQueuedBytes:2048});
 try{assert.throws(()=>{for(let i=0;i<10000;i++)port.send({value:"x".repeat(500)});},/limit/);}finally{await port.close();}
});
