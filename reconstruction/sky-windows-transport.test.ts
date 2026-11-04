import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WindowsHelperTransport } from "../packages/sky/src/targets/windows/internal/helper_transport";
import { USER_STOPPED_MESSAGE } from "../packages/sky/src/targets/windows/internal/helper_protocol";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const Original = (
  await import(
    pathToFileURL(
      `${root}/sky/dist/project/cua/sky_js/src/targets/windows/internal/helper_transport.js`,
    ).href
  )
).WindowsHelperTransport;
const helper = `
const readline=require('node:readline');
const history=[];
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const q=JSON.parse(line);history.push(q);
 if(q.method==='hang')return;
 if(q.method==='bad'){process.stdout.write('invalid-json\\n');return;}
 if(q.method==='exit130'){process.exit(130);return;}
 if(q.method==='stop'){send({id:q.id,error:process.env.STOP_MESSAGE});return;}
 if(q.method==='approve' && q.meta['x-oai-cua-approved-app']!=='fixture.exe'){
 send({id:q.id,approvalRequest:{app:'fixture.exe',displayName:'Fixture'}});return;
 }
 if(q.method==='event')send({event:'fixture'});
 send({id:q.id,ok:true,result:{history:[...history],pid:process.pid}});
 if(q.method==='close')process.exit(0);
});`;
async function fixture(
  run: (create: (C: any, preserve?: boolean) => any) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-win-transport-"));
  const previous = process.env.CODEX_HOME;
  // Relative CODEX_HOME avoids WSL conversion and isolates all interrupt markers.
  process.env.CODEX_HOME = path.relative(process.cwd(), dir);
  const file = path.join(dir, "helper.cjs");
  await writeFile(file, helper);
  const clients: any[] = [];
  try {
    await run((C, preserve = false) => {
      const c = new C({
        helperCommand: process.execPath,
        helperArgs: [file],
        helperEnv: { STOP_MESSAGE: USER_STOPPED_MESSAGE },
        timeoutMs: 2000,
        preserveHelperOnTimeout: preserve,
      });
      clients.push(c);
      return c;
    });
  } finally {
    await Promise.all(clients.map((c) => c.close()));
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
const scope = (turn: string) => ({
  codexTurnMetadata: { session_id: "fixture-session", turn_id: turn },
});
test("Windows transport matches original approval, events and turn-transition request traces", async () => {
  await fixture(async (create) => {
    const traces: any[] = [];
    for (const [index, C] of [Original, WindowsHelperTransport].entries()) {
      const client = create(C),
        events: any[] = [],
        approvals: any[] = [];
      const off = client.onEvent((e: any) => events.push(e));
      assert.equal(await client.request("end_turn", {}, scope("unused")), null);
      await client.request(
        "approve",
        { value: 1 },
        {
          ...scope("one"),
          createElicitation: async (q: any) => {
            approvals.push(q);
            return { action: "accept" };
          },
        },
      );
      await client.request("event", {}, scope("one"));
      off();
      const result = await client.request("echo", {}, scope("two"));
      assert.deepEqual(
        result.history.map((x: any) => x.method),
        ["approve", "approve", "event", "end_turn", "echo"],
      );
      assert.equal(
        result.history[1].meta["x-oai-cua-approved-app"],
        "fixture.exe",
      );
      assert.equal(result.history[3].meta.turn_id, "one");
      assert.equal(result.history[4].meta["x-oai-cua-request-budget-ms"], 2000);
      assert.deepEqual(events, [{ event: "fixture" }]);
      traces.push({ history: result.history, approvals, events });
      await client.close();
    }
    assert.deepEqual(traces[1], traces[0]);
  });
});
test("Windows transport retains helper after malformed JSON and optionally after timeout", async () => {
  await fixture(async (create) => {
    for (const C of [Original, WindowsHelperTransport])
      for (const preserve of [false, true]) {
        const client = create(C, preserve),
          before = await client.request("echo", {});
        await assert.rejects(
          client.request("bad", {}),
          /emitted invalid JSON: invalid-json/,
        );
        assert.equal((await client.request("echo", {})).pid, before.pid);
        const pending = client.request("hang", {}, { timeoutMs: 50 });
        await assert.rejects(pending, /request timed out: hang/);
        const after = await client.request("echo", {});
        assert.equal(after.pid === before.pid, preserve);
        await client.close();
      }
  });
});
test("Windows transport persists synthetic user-stop signals and permits a different turn", async () => {
  await fixture(async (create) => {
    for (const [index, C] of [Original, WindowsHelperTransport].entries())
      for (const signal of ["stop", "exit130"]) {
        const metadata = scope(`stop-${index}-${signal}`),
          client = create(C);
        await assert.rejects(
          client.request(signal, {}, metadata),
          (e) => e instanceof Error && e.message === USER_STOPPED_MESSAGE,
        );
        await assert.rejects(
          client.request("echo", {}, metadata),
          /physical Escape key/,
        );
        const fresh = create(C);
        await assert.rejects(
          fresh.request("echo", {}, metadata),
          /physical Escape key/,
        );
        assert.ok(
          await fresh.request("echo", {}, scope(`next-${index}-${signal}`)),
        );
        await fresh.close();
        await client.close();
      }
  });
});

test("Windows transport denies approval without replay and rejects sibling requests on fatal timeout", async () => {
  await fixture(async (create) => {
    for (const C of [Original, WindowsHelperTransport]) {
      const client = create(C);
      await assert.rejects(
        client.request(
          "approve",
          {},
          {
            createElicitation: async () => ({ action: "decline" }),
          },
        ),
        /was not approved to use Fixture/,
      );
      const snapshot = await client.request("echo", {});
      assert.deepEqual(
        snapshot.history.map((q: any) => q.method),
        ["approve", "echo"],
      );
      const results = await Promise.allSettled([
        client.request("hang", {}, { timeoutMs: 40 }),
        client.request("hang", {}, { timeoutMs: 1000 }),
      ]);
      for (const result of results) {
        assert.equal(result.status, "rejected");
        if (result.status === "rejected")
          assert.equal(
            result.reason.message,
            "computer-use request timed out: hang",
          );
      }
      assert.notEqual((await client.request("echo", {})).pid, snapshot.pid);
      await client.close();
    }
  });
});
