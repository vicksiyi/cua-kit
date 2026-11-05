/** Independent POSIX process/JSONL transport. OS sandbox policy is supplied by its launcher. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Message, WorkerPort } from "./session";
export interface ProcessSpec {
  command: string; args: readonly string[]; cwd: string;
  /** Exact environment. Never merged with process.env. */
  env: Readonly<Record<string,string>>;
  maxFrameBytes?: number; maxQueuedBytes?: number; terminateGraceMs?: number;
}
export class ProcessWorkerPort implements WorkerPort {
  readonly pid: number;
  private readonly child: ChildProcessWithoutNullStreams;
  private messages=new Set<(message:Message)=>void>();
  private exits=new Set<()=>void>();
  private buffer=Buffer.alloc(0);
  private queued:Array<{message:Message;bytes:number}>=[];
  private queuedBytes=0;
  private ended=false;
  private notified=false;
  private closing?:Promise<void>;
  private closed:Promise<void>;
  private failure?:Error;
  private exited=false;
  private drainTimer?:ReturnType<typeof setTimeout>;
  private constructor(child:ChildProcessWithoutNullStreams,private spec:Required<ProcessSpec>){
    this.child=child;this.pid=child.pid!;
    this.closed=new Promise(resolve=>child.once("close",()=>resolve()));
    child.stderr.resume();
    child.stdout.on("data",(chunk:Buffer)=>this.read(chunk));
    child.stdout.on("end",()=>{
      if(this.buffer.length)this.stop(Error("Worker ended with a truncated JSONL frame"));
      else if(this.exited)this.stop();
    });
    child.stdin.on("error",()=>this.stop(Error("Worker input pipe failed")));
    child.on("error",()=>this.stop(Error("Worker process failed")));
    child.on("exit",()=>{
      this.exited=true;if(this.ended)return;
      if(child.stdout.readableEnded)this.stop(this.buffer.length?Error("Worker exited with a truncated JSONL frame"):undefined);
      else this.drainTimer=setTimeout(()=>this.stop(this.buffer.length?Error("Worker exited with a truncated JSONL frame"):undefined),50);
    });
  }
  static async start(spec:ProcessSpec):Promise<ProcessWorkerPort>{
    if(process.platform==="win32")throw Error("POSIX process-group transport is unavailable on Windows");
    if(!isAbsolute(spec.command)||!isAbsolute(spec.cwd))throw Error("Worker command and cwd must be absolute");
    const config={...spec,maxFrameBytes:spec.maxFrameBytes??8*1024*1024,maxQueuedBytes:spec.maxQueuedBytes??16*1024*1024,terminateGraceMs:spec.terminateGraceMs??500};
    if(!Number.isSafeInteger(config.maxFrameBytes)||config.maxFrameBytes<1||!Number.isSafeInteger(config.maxQueuedBytes)||config.maxQueuedBytes<config.maxFrameBytes||!Number.isSafeInteger(config.terminateGraceMs)||config.terminateGraceMs<0||config.terminateGraceMs>5000)throw Error("Invalid worker transport limits");
    // detached creates a new process group; termination targets only this owned group.
    const child=spawn(spec.command,[...spec.args],{cwd:spec.cwd,env:{...spec.env},detached:true,stdio:["pipe","pipe","pipe"]});
    await new Promise<void>((resolve,reject)=>{child.once("spawn",resolve);child.once("error",reject);});
    return new ProcessWorkerPort(child,config);
  }
  get error(){return this.failure;}
  private read(chunk:Buffer){
    if(this.ended)return;
    let offset=0;
    try{
      while(offset<chunk.length){
        const newline=chunk.indexOf(10,offset),end=newline<0?chunk.length:newline;
        const part=chunk.subarray(offset,end);
        if(this.buffer.length+part.length>this.spec.maxFrameBytes)throw Error("Worker JSONL frame exceeds limit");
        const line=Buffer.concat([this.buffer,part]);
        if(newline<0){this.buffer=line;break;}
        this.buffer=Buffer.alloc(0);offset=newline+1;
        const text=new TextDecoder("utf-8",{fatal:true}).decode(line);
        const message=JSON.parse(text);
        if(!message||typeof message!=="object"||Array.isArray(message))throw Error("Worker JSONL must contain an object");
        if(this.messages.size){for(const listener of this.messages)listener(message);}
        else{
          if(this.queued.length>=256||this.queuedBytes+line.length>this.spec.maxQueuedBytes)throw Error("Unconsumed worker output exceeds limit");
          this.queued.push({message,bytes:line.length});this.queuedBytes+=line.length;
        }
        if(this.ended)return;
      }
    }catch{this.stop(Error("Invalid or oversized worker JSONL output"));}
  }
  send(message:Message){
    if(this.ended)throw this.failure??Error("Worker process is closed");
    const text=JSON.stringify(message),bytes=Buffer.byteLength(text);
    if(bytes>this.spec.maxFrameBytes||this.child.stdin.writableLength+bytes+1>this.spec.maxQueuedBytes){
      this.stop(Error("Worker input exceeds transport limit"));throw this.failure!;
    }
    this.child.stdin.write(text+"\n");
  }
  onMessage(listener:(message:Message)=>void){
    this.messages.add(listener);
    // Subscribe synchronously, flush after the caller has installed its exit handler.
    queueMicrotask(()=>{
      if(this.ended||!this.messages.has(listener))return;
      const queued=this.queued.splice(0);this.queuedBytes=0;
      for(const {message} of queued){if(this.ended)break;try{for(const handler of this.messages)handler(message);}catch{this.stop(Error("Worker message listener failed"));}}
    });
    return()=>{this.messages.delete(listener);};
  }
  onExit(listener:()=>void){
    if(this.ended){let active=true;queueMicrotask(()=>{if(active)listener();});return()=>{active=false;};}
    this.exits.add(listener);return()=>{this.exits.delete(listener);};
  }
  private notifyExit(){
    if(this.notified)return;this.notified=true;
    for(const listener of this.exits){try{listener();}catch{}}
    this.exits.clear();
  }
  private stop(error?:Error){
    if(this.ended)return;this.ended=true;this.failure=error;
    if(this.drainTimer)clearTimeout(this.drainTimer);
    this.buffer=Buffer.alloc(0);this.queued=[];this.queuedBytes=0;
    this.notifyExit();
    void this.close().catch(()=>{});
  }
  private async signal(signal:NodeJS.Signals){
    for(let attempt=0;;attempt++){
      try{process.kill(-this.pid,signal);return;}
      catch(error){
        const code=(error as NodeJS.ErrnoException).code;
        if(code==="ESRCH")return;
        // Darwin can report EPERM for a group whose sole leader is a zombie,
        // before Node reaps it and emits exit. Retry briefly, never ignore a
        // persistent permission error or request broader permissions.
        if(code!=="EPERM"||attempt>=5)throw error;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
    }
  }
  close():Promise<void>{
    if(this.closing)return this.closing;
    // Retire descendants even after the group leader has exited normally.
    this.ended=true;
    this.closing=Promise.resolve().then(async()=>{
      this.notifyExit();if(this.drainTimer)clearTimeout(this.drainTimer);this.child.stdin.destroy();await this.signal("SIGTERM");
      await new Promise(resolve=>setTimeout(resolve,this.spec.terminateGraceMs));
      await this.signal("SIGKILL");
      // Do not wait forever for inherited pipes held by a process that escaped
      // the group. Preventing such escapes is the OS launch policy's job.
      this.child.stdout.destroy();this.child.stderr.destroy();
      await this.closed;
    });
    return this.closing;
  }
}
