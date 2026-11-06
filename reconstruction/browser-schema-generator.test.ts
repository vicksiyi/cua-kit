import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as inputs from "../packages/browser/src/commands/cua_input";
import * as controls from "../packages/browser/src/commands/tab_control";
import * as locators from "../packages/browser/src/commands/playwright_locator";
import * as pages from "../packages/browser/src/commands/playwright_page";
const files = [
  "cua_input",
  "tab_control",
  "playwright_locator",
  "playwright_page",
].map((name) => `packages/browser/src/commands/${name}.ts`);
test("schema generator is reproducible and rejects changed sources without modifying outputs", async (t) => {
  execFileSync(
    process.execPath,
    ["scripts/reconstruct-input-schemas.mjs", "--check"],
    { stdio: "pipe" },
  );
  const before = await Promise.all(files.map((path) => readFile(path, "utf8")));
  const root = await mkdtemp(join(tmpdir(), "cua-schema-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = join(
    root,
    "cua/dist/lib/js/oai_js_browser/dist/skill/scripts",
  );
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "browser-client.js"), "// changed build");
  const result = spawnSync(
    process.execPath,
    ["scripts/reconstruct-input-schemas.mjs"],
    { env: { ...process.env, CUA_VENDOR_ROOT: root }, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Installed browser client changed/);
  assert.deepEqual(
    await Promise.all(files.map((path) => readFile(path, "utf8"))),
    before,
  );
});
test("all regenerated command schemas match the current client payload and result contracts", async () => {
  const root =
    process.env.CUA_VENDOR_ROOT ??
    "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
  const source = await readFile(
    `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
    "utf8",
  );
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4",
  );
  const vendor = (
    await import(
      `data:text/javascript;base64,${Buffer.from(source + "\nexport {d as Commands}").toString("base64")}`
    )
  ).Commands;
  const examples = [
    undefined,
    null,
    {},
    [],
    {
      browser_id: "b",
      tab_id: "1",
      url: "https://fixture.test",
      prepare_accessibility: true,
    },
    {
      browser_id: "b",
      tab_id: "1",
      url: "https://fixture.test",
      prepare_accessibility: false,
    },
    {
      browser_id: "b",
      tab_id: "1",
      selector: "button",
      value: "hello",
      text: "hi",
      keys: ["Enter"],
      duration: 0.25,
      x: 1,
      y: 2,
      scroll_x: 0,
      scroll_y: 20,
      node_id: "s1",
      path: [{ x: 1, y: 2 }],
      status: "deliverable",
      state: "visible",
      timeout_ms: 10,
      replace: true,
      selections: [{ label: "A" }],
      files: [],
      file_chooser_id: "c",
      download_id: "d",
      name: "href",
      checked: true,
      action: "dismiss",
      dialog_id: "j",
      script: "() => 1",
    },
    {
      dom_snapshot: "page",
      snapshotId: "id",
      siwc: { status: "no_deterministic_matches", candidates: [] },
    },
    { data: "AQID", dialog: { id: "j", type: "prompt" } },
    { value: 123 },
    [{ tagName: "button", preview: "button", selector: {} }],
  ];
  const parse = (schema: any, value: any) => {
    const r = schema.safeParse(value);
    return r.success ? { data: r.data } : { issues: r.error.issues };
  };
  let count = 0;
  for (const [name, command] of Object.entries({
    ...inputs,
    ...controls,
    ...locators,
    ...pages,
  })) {
    const publicName =
      (
        {
          LocatorDoubleClick: "PlaywrightLocatorDblclick",
          WaitForUrl: "PlaywrightWaitForURL",
        } as any
      )[name] ?? (vendor[name] ? name : `Playwright${name}`);
    const ref = vendor[publicName];
    assert(ref, publicName);
    assert.equal(command.commandType, ref.commandType);
    for (const example of examples)
      for (const field of ["PayloadSchema", "ResultSchema"] as const)
        assert.deepEqual(
          parse(command[field], example),
          parse(ref[field], example),
          `${name}.${field}`,
        );
    count++;
  }
  assert.equal(count, 52);
});
