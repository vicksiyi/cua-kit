import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { projectKernelBrowserSettings, diffKernelBrowserSettings, parseKernelPermissionRules, createKernelSessionConfig, createKernelGlobalConfig } from "../packages/browser-extension/src/kernel_config";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const names = new Set(["NU", "FU", "BU", "Ps", "UU", "$U", "zb", "LU"]), definitions: string[] = [];
for (const n of (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body) {
  if (n.type === "FunctionDeclaration" && names.has(n.id.name)) definitions.push(source.slice(n.start, n.end));
  if (n.type === "VariableDeclaration") for (const d of n.declarations) if (names.has(d.id.name)) definitions.push(`const ${source.slice(d.start, d.end)};`);
}
const original = (locks: any = {}) => new Function("navigator", `${definitions.join("\n")};return {NU,BU,Ps,UU,$U}`)({ locks });
const settings = () => ({ revision: "rev", preferences: { approval_mode: "always_ask", history_approval_mode: "always_ask", iab_history_approval_mode: "always_ask", download_approval_mode: "always_ask", upload_approval_mode: "always_ask", disable_auto_review: false, full_cdp_access_enabled: false, webmcp_enabled: true }, rules: { origin: { a: "allow", b: "deny" }, download: {}, upload: {}, full_cdp: {}, webmcp: {} } });
const result = (fn: () => any) => { try { return { value: fn() }; } catch (e: any) { return { error: e.message }; } };

test("kernel settings projection, validation and revision patch match original", () => {
  const source = original();
  const current = settings();
  assert.deepEqual(projectKernelBrowserSettings(current), source.Ps(current));
  const baseline = source.Ps(current);
  const patches: any[] = [{}, baseline, { ...baseline, origins: {} }, { ...baseline, origins: { allowed: ["a", "b", "new"], denied: ["new"] } }, { ...baseline, unknown: 1 }];
  for (const key of ["approval_mode", "history_approval_mode", "iab_history_approval_mode", "download_approval_mode", "upload_approval_mode", "disable_auto_review", "full_cdp_access_enabled", "webmcp_enabled"])
    for (const value of [true, false, "always_ask", "never_ask", "disabled", null, 1]) patches.push({ ...baseline, [key]: value });
  for (const patch of patches) assert.deepEqual(result(() => diffKernelBrowserSettings(current, patch)), result(() => source.UU(current, patch)));
  for (const value of [null, [], {}, { extra: [] }, { allowed: null }, { allowed: "x" }, { allowed: [1] }, { allowed: ["", "a", "a"], denied: ["a"] }, Object.create({ allowed: ["inherited"] })])
    assert.deepEqual(result(() => parseKernelPermissionRules(value)), result(() => source.$U(value)));
  const unexpected = { ...current, rules: { ...current.rules, origin: { a: "unknown" } } };
  assert.deepEqual(projectKernelBrowserSettings(unexpected), source.Ps(unexpected));
});

test("kernel config adapters preserve locked read-update-write, refresh and no-op behavior", async () => {
  for (const mode of ["normal", "updater-error", "read-error", "write-error"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      let snapshot: any = Object.assign(Object.create({ inherited: "hidden" }), { own: "value" });
      let tail = Promise.resolve();
      const locks: any = { request(name: string, fn: any) {
        const pending = tail.then(async () => { trace.push(["lock", name]); try { return await fn(); } finally { trace.push(["unlock", name]); } });
        tail = pending.catch(() => {}); return pending;
      } };
      const control: any = {
        async readSessionConfig(id: string) { trace.push(["read-session", id]); if (mode === "read-error") throw Error("read"); return snapshot; },
        async writeSessionConfig(value: any) { trace.push(["write-session", value]); if (mode === "write-error") throw Error("write"); snapshot = value.config; },
        async readBrowserSettings(force: boolean) { trace.push(["read-global", force]); if (mode === "read-error") throw Error("read"); return settings(); },
        async patchBrowserSettings(value: any) { trace.push(["patch", value]); if (mode === "write-error") throw Error("write"); },
      };
      const source = original(locks);
      const session = restored ? createKernelSessionConfig(control, "session", locks) : source.NU(control, "session");
      const global = restored ? createKernelGlobalConfig(control, locks) : source.BU(control);
      const values: any[] = [];
      const run = async (fn: () => any) => { try { values.push(structuredClone(await fn())); } catch (e: any) { values.push({ error: e.message }); } };
      await run(() => session.get("inherited")); await run(() => session.get("own"));
      await run(() => Promise.all([session.set("first", 1), session.set("second", 2)]));
      await run(() => session.readSnapshot());
      await run(() => global.get("approval_mode")); await run(() => global.readSnapshot({ refresh: true }));
      await run(() => global.set("approval_mode", "always_ask")); // no patch
      await run(() => global.update((value: any) => {
        if (mode === "updater-error") throw Error("updater");
        assert.equal(value.approval_mode, "always_ask"); return { approval_mode: "never_ask", origins: { denied: ["a"] } };
      }));
      outputs.push({ trace, values });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
