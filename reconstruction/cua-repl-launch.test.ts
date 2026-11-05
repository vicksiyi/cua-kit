import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { create_launch_environment } from "../packages/cua-repl/src/environment";
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
        const run = (fn: typeof load_instructions, directory: URL) => {
          try {
            return { value: fn(directory, platform, environment, guidance) };
          } catch (e: any) {
            return { error: e.message };
          }
        };
        assert.deepEqual(
          run(
            load_instructions,
            pathToFileURL(resolve("packages/cua-repl/instructions") + "/"),
          ),
          remap(
            run(
              originalInstructions.load_instructions,
              pathToFileURL(`${vendor}/cua-repl/instructions/`),
            ),
          ),
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
      `#!${process.execPath}\nconst keys = ["CUA_REPL_ENABLED_SURFACES","NODE_REPL_UNTRUSTED_ENV_ALLOWLIST","NODE_REPL_TRUSTED_SERVICES","NODE_REPL_JS_BANNER","NODE_REPL_TOOL_OVERRIDES","NODE_REPL_JS_COMPLETION_SUMMARY"]; console.log(JSON.stringify(Object.fromEntries(keys.map(k=>[k,process.env[k]])))); process.exitCode=Number(process.env.FIXTURE_EXIT||0); if(process.env.FIXTURE_SIGNAL) process.kill(process.pid,process.env.FIXTURE_SIGNAL);\n`,
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
        NODE_REPL_ENABLE_AUDIO: "1",
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

test("environment builder matches current source audio flags, title and completion-summary contract", async () => {
  const original = (
    await import(pathToFileURL(`${originalDirectory}/environment.js`).href)
  ).create_launch_environment;
  const restoredDirectory = pathToFileURL(
    resolve("packages/cua-repl/instructions") + "/",
  );
  const vendorDirectory = pathToFileURL(`${vendor}/cua-repl/instructions/`);
  for (const platform of [
    "darwin",
    "linux",
    "win32",
    "freebsd",
  ] as NodeJS.Platform[])
    for (const surfaces of [
      undefined,
      "",
      "browser",
      "computer",
      "browser, computer,browser",
      "invalid",
    ])
      for (const audio of [
        {},
        { SKY_ENABLE_AUDIO: "1", NODE_REPL_ENABLE_AUDIO: "1" },
        { SKY_ENABLE_AUDIO: "1", SKY_AUDIO_ATTACHMENTS: "1" },
        { SKY_ENABLE_AUDIO: "true", NODE_REPL_ENABLE_AUDIO: "1" },
      ]) {
        const env = {
          CUA_REPL_ENABLED_SURFACES: surfaces,
          NODE_REPL_JS_COMPLETION_SUMMARY: "caller-old-value",
          ...audio,
        };
        const run = (fn: typeof create_launch_environment, directory: URL) => {
          try {
            return {
              value: fn({ env, instructions_directory: directory, platform }),
            };
          } catch (error: any) {
            return { error: error.message };
          }
        };
        assert.deepEqual(
          remap(run(create_launch_environment, restoredDirectory)),
          remap(run(original, vendorDirectory)),
        );
      }
  const disabled = create_launch_environment({
    env: { CUA_REPL_ENABLED_SURFACES: "" },
    instructions_directory: restoredDirectory,
    platform: "darwin",
  });
  assert.equal(disabled.NODE_REPL_JS_COMPLETION_SUMMARY, undefined);
  const enabled = create_launch_environment({
    env: { CUA_REPL_ENABLED_SURFACES: "computer" },
    instructions_directory: restoredDirectory,
    platform: "darwin",
  });
  assert.ok(
    JSON.parse(enabled.NODE_REPL_TOOL_OVERRIDES!).tools.js.field_descriptions
      .title.length > 0,
  );
  assert.ok(
    JSON.parse(enabled.NODE_REPL_JS_COMPLETION_SUMMARY!).instructions.length >
      0,
  );
});
