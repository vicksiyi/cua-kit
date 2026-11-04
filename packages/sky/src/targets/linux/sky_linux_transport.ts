import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
type Pending = {
  child: ChildProcessWithoutNullStreams;
  command: string;
  reject: (error: unknown) => void;
  resolve: (output: unknown) => void;
};
export class SkyLinuxTransport {
  #command: string;
  #args: string[];
  #child: ChildProcessWithoutNullStreams | null = null;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #stderr = "";
  #stdout = "";
  constructor(command: string, args: string[]) {
    this.#command = command;
    this.#args = args;
  }
  request(command: string, input: unknown): Promise<unknown> {
    const id = this.#nextId++,
      line = `${JSON.stringify({ id, command, input })}\n`,
      child = this.#child ?? this.#spawn();
    this.#child = child;
    child.ref();
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { child, command, reject, resolve });
      child.stdin.write(line, "utf8");
    });
  }
  #spawn() {
    const child = spawn(this.#command, this.#args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const stream of [child.stdin, child.stdout, child.stderr])
      if ("unref" in stream && typeof stream.unref === "function")
        stream.unref();
    child.stdin.on("error", (error) => {
      this.#reset(child);
      child.kill();
      this.#reject(error, child);
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (this.#child === child) this.#receive(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (this.#child === child)
        this.#stderr = `${this.#stderr}${chunk}`.slice(-8192);
    });
    child.on("exit", (code, signal) => {
      const status =
          signal == null ? `exit=${code ?? "unknown"}` : `signal=${signal}`,
        stderr = this.#child === child ? this.#stderr.trim() : "";
      const error = new Error(stderr === "" ? status : `${status}: ${stderr}`);
      this.#reset(child);
      this.#reject(error, child);
    });
    child.on("error", (error) => {
      this.#reset(child);
      this.#reject(error, child);
    });
    return child;
  }
  #reset(child: ChildProcessWithoutNullStreams) {
    if (this.#child === child) {
      this.#child = null;
      this.#stdout = "";
      this.#stderr = "";
      child.unref();
    }
  }
  #receive(chunk: string) {
    this.#stdout += chunk;
    for (;;) {
      const end = this.#stdout.indexOf("\n");
      if (end === -1) return;
      const line = this.#stdout.slice(0, end).trim();
      this.#stdout = this.#stdout.slice(end + 1);
      if (line !== "") this.#message(line);
    }
  }
  #message(line: string) {
    let response: any;
    try {
      response = JSON.parse(line);
    } catch {
      const error = new Error(`sky_linux server emitted invalid JSON: ${line}`),
        child = this.#child;
      if (child != null) {
        this.#reset(child);
        child.kill();
      }
      this.#reject(error);
      return;
    }
    if (
      response == null ||
      typeof response !== "object" ||
      typeof response.id !== "number"
    ) {
      const error = new Error("sky_linux server response missing numeric id"),
        child = this.#child;
      if (child != null) {
        this.#reset(child);
        child.kill();
      }
      this.#reject(error);
      return;
    }
    const pending = this.#pending.get(response.id);
    if (pending == null) return;
    this.#pending.delete(response.id);
    if (this.#pending.size === 0) pending.child.unref();
    if (response.ok === true) {
      pending.resolve(response.output);
      return;
    }
    const error = new Error(
      typeof response.error === "string"
        ? response.error
        : `sky_linux request failed: ${pending.command}`,
    );
    if (response.restart === true) {
      this.#reset(pending.child);
      pending.child.kill();
      this.#reject(error, pending.child);
    }
    pending.reject(error);
  }
  #reject(error: unknown, child: ChildProcessWithoutNullStreams | null = null) {
    for (const [id, pending] of this.#pending)
      if (child == null || pending.child === child) {
        pending.reject(error);
        this.#pending.delete(id);
      }
  }
}
