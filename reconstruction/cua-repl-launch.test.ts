import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { load_instructions } from "../packages/cua-repl/src/instructions";
const vendor =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const originalDirectory = `${vendor}/cua-repl/dist/lib/js/oai_js_cua_repl/src`;
const originalInstructions = await import(
  pathToFileURL(`${originalDirectory}/instructions.js`).href
);
const remap = (value: unknown) =>
  JSON.parse(JSON.stringify(value).replaceAll("@oai/", "@core/"));
test("REPL instructions preserve platform/environment/guidance selection and errors", () => {
  for (const platform of [
    "darwin",
    "linux",
    "win32",
    "freebsd",
  ] as NodeJS.Platform[])
    for (const environment of [
      undefined,
      "codex-app",
      "cloud",
      "orbit",
      "unknown",
    ])
      for (const guidance of [undefined, "tool_description", "other"]) {
        const run = (fn: typeof load_instructions) => {
          try {
            return { value: fn(platform, environment, guidance) };
          } catch (e: any) {
            return { error: e.message };
          }
        };
        assert.deepEqual(
          run(load_instructions),
          remap(run(originalInstructions.load_instructions)),
        );
      }
});
function launch(file: string, environment: NodeJS.ProcessEnv) {
  return new Promise<{
    code: unknown;
    signal: unknown;
    stdout: string;
    stderr: string;
  }>((resolveResult) => {
    execFile(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `try { await (await import(${JSON.stringify(pathToFileURL(file).href)})).launch(); } catch (error) { console.error(error.message); process.exitCode = 1; }`,
      ],
      { env: { PATH: process.env.PATH, ...environment }, timeout: 10000 },
      (error, stdout, stderr) =>
        resolveResult({
          code: error?.code ?? 0,
          signal: error?.signal ?? null,
          stdout,
          stderr,
        }),
    );
  });
}
test("REPL launcher preserves actual child environment, overrides, validation and exit status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-repl-launch-"));
  try {
    const child = join(directory, "node-repl-fixture");
    await writeFile(
      child,
      `#!${process.execPath}\nconst keys = ["CUA_REPL_ENABLED_SURFACES","NODE_REPL_UNTRUSTED_ENV_ALLOWLIST","NODE_REPL_TRUSTED_SERVICES","NODE_REPL_JS_BANNER","NODE_REPL_TOOL_OVERRIDES"]; console.log(JSON.stringify(Object.fromEntries(keys.map(k=>[k,process.env[k]])))); process.exitCode=Number(process.env.FIXTURE_EXIT||0); if(process.env.FIXTURE_SIGNAL) process.kill(process.pid,process.env.FIXTURE_SIGNAL);\n`,
    );
    await chmod(child, 0o700);
    const cases: NodeJS.ProcessEnv[] = [
      {},
      { CUA_REPL_NODE_REPL_PATH: "relative" },
      { CUA_REPL_NODE_REPL_PATH: child },
      ...[
        "browser",
        "computer",
        "browser, computer,browser",
        "",
        "invalid",
      ].map((CUA_REPL_ENABLED_SURFACES) => ({
        CUA_REPL_NODE_REPL_PATH: child,
        CUA_REPL_ENABLED_SURFACES,
      })),
      {
        CUA_REPL_NODE_REPL_PATH: child,
        CUA_REPL_ENABLED_SURFACES: "computer",
        SKY_ENABLE_AUDIO: "1",
        SKY_AUDIO_ATTACHMENTS: "1",
      },
      {
        CUA_REPL_NODE_REPL_PATH: child,
        CUA_REPL_ENABLED_SURFACES: "browser",
        CUA_REPL_BROWSER_ENV: "orbit",
        CUA_REPL_BROWSER_GUIDANCE: "tool_description",
      },
      {
        CUA_REPL_NODE_REPL_PATH: child,
        CUA_REPL_ENABLED_SURFACES: "browser",
        NODE_REPL_JS_BANNER: "",
        NODE_REPL_TRUSTED_SERVICES: "",
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "EXISTING",
        FIXTURE_EXIT: "7",
      },
    ];
    cases.push({
      CUA_REPL_NODE_REPL_PATH: child,
      CUA_REPL_ENABLED_SURFACES: "browser",
      FIXTURE_SIGNAL: "SIGTERM",
    });
    for (const environment of cases) {
      const expected = await launch(
        `${originalDirectory}/launch.js`,
        environment,
      );
      const actual = await launch(
        resolve("packages/cua-repl/dist/launch.js"),
        environment,
      );
      assert.deepEqual(actual, remap(expected));
      if (actual.code === 0) {
        const output = JSON.parse(actual.stdout);
        assert.ok(
          output.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST.endsWith(
            "CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV",
          ),
        );
        assert.equal(
          typeof JSON.parse(output.NODE_REPL_TOOL_OVERRIDES).tools.js
            .description,
          "string",
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
