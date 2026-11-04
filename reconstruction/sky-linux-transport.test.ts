import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { SkyLinuxTransport } from "../packages/sky/src/targets/linux/sky_linux_transport";
import { package_bin } from "../packages/sky/src/core/package_bin";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/`;
const Original = (
  await import(
    pathToFileURL(base + "targets/linux/sky_linux_transport.js").href
  )
).SkyLinuxTransport;
const originalBin = (
  await import(pathToFileURL(base + "core/package_bin.js").href)
).package_bin;
const worker = String.raw`
const readline=require('node:readline');
let count=0;
readline.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);count++;
 const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
 if(r.command==='invalid'){process.stdout.write('{\n');return;}
 if(r.command==='missing-id'){send({ok:true});return;}
 if(r.command==='exit'){process.stderr.write('x'.repeat(9000)+' tail\n',()=>process.exit(7));return;}
 if(r.command==='restart'){send({id:r.id,ok:false,error:'restart requested',restart:true});return;}
 if(r.command==='fail'){send({id:r.id,ok:false});return;}
 if(r.command==='explicit'){send({id:r.id,ok:false,error:'explicit'});return;}
 if(r.command==='wait')return;
 if(r.command==='quit'){send({id:r.id,ok:true,output:'bye'});setTimeout(()=>process.exit(0),1);return;}
 const response=JSON.stringify({id:r.id,ok:true,output:{input:r.input,count}})+'\n';
 process.stdout.write('\n'+JSON.stringify({id:999999,ok:true,output:'ignore'})+'\n');
 process.stdout.write(response.slice(0,3));process.stdout.write(response.slice(3));
});
`;
async function outcome(p: Promise<any>) {
  try {
    return { value: await p };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("Linux transport matches real helper framing, reuse and nonfatal command errors", async () => {
  async function run(Type: any) {
    const pipe = new Type(process.execPath, ["-e", worker]);
    const results = await Promise.all([
      pipe.request("echo", { n: 1 }),
      pipe.request("echo", { n: 2 }),
    ]);
    const errors = await Promise.all([
      outcome(pipe.request("fail", {})),
      outcome(pipe.request("explicit", {})),
    ]);
    const after = await pipe.request("echo", { n: 3 });
    await pipe.request("quit", {});
    return { results, errors, after };
  }
  assert.deepEqual(await run(SkyLinuxTransport), await run(Original));
});
test("Linux fatal helper messages reject pending requests and recreate process with reset buffers", async () => {
  for (const command of ["invalid", "missing-id", "restart", "exit"]) {
    async function run(Type: any) {
      const pipe = new Type(process.execPath, ["-e", worker]);
      await pipe.request("echo", {});
      const results = await Promise.all([
        outcome(pipe.request("wait", {})),
        outcome(pipe.request(command, {})),
      ]);
      const after = await pipe.request("echo", { restarted: true });
      await pipe.request("quit", {});
      return { results, after };
    }
    assert.deepEqual(
      await run(SkyLinuxTransport),
      await run(Original),
      command,
    );
  }
});
test("Linux transport surfaces real process spawn errors and retries subsequent requests", async () => {
  async function run(Type: any) {
    const pipe = new Type("/nonexistent/sky-fixture", []);
    return [
      await outcome(pipe.request("first", {})),
      await outcome(pipe.request("second", {})),
    ];
  }
  assert.deepEqual(await run(SkyLinuxTransport), await run(Original));
});
test("package binary lookup preserves override bypass and package-relative existence checks", () => {
  const key = "CUA_TEST_PACKAGE_BINARY",
    prior = process.env[key];
  try {
    process.env[key] = " /synthetic/missing ";
    assert.equal(
      package_bin({ relative_path: ["none"], env_var_override: key }),
      originalBin({ relative_path: ["none"], env_var_override: key }),
    );
    process.env[key] = " ";
    const local = package_bin({
        relative_path: ["package.json"],
        env_var_override: key,
      }),
      vendor = originalBin({
        relative_path: ["package.json"],
        env_var_override: key,
      });
    assert.equal(path.basename(local), "package.json");
    assert.equal(path.basename(vendor), "package.json");
    for (const fn of [package_bin, originalBin]) {
      assert.equal(
        path.basename(fn({ relative_path: ["missing"], check_exists: false })),
        "missing",
      );
      assert.throws(
        () => fn({ relative_path: ["missing"] }),
        /^Error: missing bin=/,
      );
    }
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});

test("Linux command wrapper uses override binary, option-keyed helper reuse and original JSON output", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(path.join(tmpdir(), "sky-linux-wrapper-")),
    binary = path.join(directory, "helper");
  const prior = process.env.OAI_SKY_LINUX_BIN;
  await writeFile(binary, "#!" + process.execPath + "\n" + worker, {
    mode: 0o700,
  });
  const original = (
    await import(pathToFileURL(base + "targets/linux/sky_linux.js").href)
  ).sky_linux;
  const restored = (await import("../packages/sky/src/targets/linux/sky_linux"))
    .sky_linux;
  try {
    process.env.OAI_SKY_LINUX_BIN = " " + binary + " ";
    async function run(fn: any) {
      const outputs = [];
      for (const mouse_size_px of [0, 8]) {
        const options = { mouse_size_px };
        outputs.push(await fn("echo", { options, input: null }));
        outputs.push(await fn("echo", { options, input: { n: 1 } }));
        outputs.push(await fn("quit", { options }));
      }
      return outputs;
    }
    assert.deepEqual(await run(restored), await run(original));
  } finally {
    if (prior === undefined) delete process.env.OAI_SKY_LINUX_BIN;
    else process.env.OAI_SKY_LINUX_BIN = prior;
    await rm(directory, { recursive: true, force: true });
  }
});
