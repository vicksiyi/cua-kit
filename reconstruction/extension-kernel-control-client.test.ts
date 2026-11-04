import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { KernelControlClient, KernelAgentPeer } from "../packages/browser-extension/src/kernel_control_client";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0/chunks`;
const host = readFileSync(`${root}/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(host).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const shared = readFileSync(`${root}/src-BsTzWBmo.js`, "utf8");
assert.equal(createHash("sha256").update(shared).digest("hex"), "2284e7e24f4fc756e5af9e00d652914415a238128e5dcf4ab02bb0388c130dd0");
function extract(source: string, names: string[]) {
  const definitions: string[] = [];
  for (const n of (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body) {
    if (n.type === "FunctionDeclaration" && names.includes(n.id.name)) definitions.push(source.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations)
      if (names.includes(d.id.name)) definitions.push(`const ${source.slice(d.start, d.end)};`);
  }
  return definitions.join("\n");
}
const originals = new Function(`${extract(shared, ["Mt"])};const Ql=Mt;${extract(host, ["OU", "HU", "Wb", "PU"])};return {OU,HU}`)();
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test("kernel control client matches original fetch body serialization, errors and cancellation precedence", async () => {
  for (const mode of ["text", "binary", "empty", "url-params", "response-error", "null-body", "reject", "pre-abort", "during-abort", "abort-reject"]) {
    const outputs = [];
    for (const Client of [originals.OU, KernelControlClient]) {
      const trace: any[] = [];
      const abort = new AbortController();
      let peer: any, request: any;
      const wire = { setMessageCallback() {}, sendMessage(message: any) {
        if (message.method === "fetch") {
          request = message;
          trace.push({ ...message, params: { ...message.params, id: "fetch-id" } });
          if (!["during-abort", "abort-reject"].includes(mode)) queueMicrotask(() => peer.handleIncomingMessage({ id: message.id, ...(mode === "reject" ? { error: { message: "server" } } : { result: { status: mode === "response-error" ? 0 : mode === "null-body" ? 204 : 201, statusText: mode === "null-body" ? "No Content" : "Created", headers: [["x-test", "yes"]], body: mode === "null-body" ? null : "aGVsbG8=" } }) }));
        } else {
          trace.push({ ...message, params: "fetch-id" });
          queueMicrotask(() => peer.handleIncomingMessage({ id: message.id, result: null }));
        }
      } };
      peer = new Client(wire, {});
      const body = mode === "empty" ? undefined : mode === "binary" ? new Uint8Array([0, 255]) : mode === "url-params" ? new URLSearchParams({ a: "b c" }) : "hello";
      if (mode === "pre-abort") abort.abort(Error("cancelled"));
      const detached = peer.fetch;
      const outcome = detached(new URL("https://example.test/path"), { method: "POST", body, signal: abort.signal }).then(async (r: Response) => ({ status: r.status, type: r.type, headers: [...r.headers], body: await r.text() }), (error: any) => ({ error: error instanceof Error ? error.message : error }));
      await flush();
      if (["during-abort", "abort-reject"].includes(mode)) {
        abort.abort(Error("cancelled"));
        await peer.handleIncomingMessage({ id: request.id, ...(mode === "abort-reject" ? { error: { message: "server" } } : { result: { status: 200, body: null, headers: [] } }) });
      }
      const result = await outcome;
      abort.abort(Error("late")); await flush();
      outputs.push({ trace, result });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("kernel control bound methods and agent RPC use original shared peer behavior", async () => {
  for (const kind of ["control", "agent"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const sent: any[] = [];
      const Peer = kind === "control" ? (restored ? KernelControlClient : originals.OU) : (restored ? KernelAgentPeer : originals.HU);
      const peer = new Peer({ setMessageCallback() {}, sendMessage(message: any) { sent.push(message); } }, { async setup() { return { ready: true }; } });
      await peer.handleIncomingMessage({ id: "in", method: "setup" });
      if (kind === "control") {
        for (const name of ["getChatGptAccessPolicy", "isBrowserElicitationEnabled", "readRequirements", "captureTabPdfToLibrary", "readSessionConfig", "writeSessionConfig", "readBrowserSettings", "patchBrowserSettings", "createElicitation", "displayValue", "displayImage"]) {
          const fn = peer[name]; const result = fn("value");
          const id = sent.at(-1).id;
          await peer.handleIncomingMessage({ id, result: "result" });
          assert.equal(await result, "result");
        }
      }
      outputs.push(sent);
    }
    assert.deepEqual(outputs[1], outputs[0], kind);
  }
});
