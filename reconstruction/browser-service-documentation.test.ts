import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serviceExpression } from "./service-source";
import { createBrowserDocumentation } from "../packages/browser/src/service/context/documentation";
const moduleUrl = "file:///fixture/pkg/dist/scripts/service.mjs";
function original(bundle: any) {
  const names = ["YX", "wf", "oD", "iD", "M_", "JX", "N_", "ZX"];
  return new Function(
    "O_",
    `let nD; const XX=/^(?:[A-Za-z0-9_-]+\\/)*[A-Za-z0-9_-]+$/u; ${names.map((name) => `const ${name}=(${serviceExpression(name).replaceAll("import.meta.url", JSON.stringify(moduleUrl))});`).join("\n")} return {readDocumentation:wf,apiManifest:oD,documentManifest:iD,root:JX};`,
  )(bundle);
}
async function scenario(source: boolean, mode: string) {
  const trace: string[] = [];
  const packaged = {
    documentation: { browserAuthSafetyPrecheck: "packaged instructions" },
    apiManifest: { api: true },
    documentManifest: { docs: true },
  };
  const bundle = mode.startsWith("bundle")
    ? {
        default: packaged,
        ...(mode === "bundle-env" || mode === "bundle-missing"
          ? {
              environments: {
                test: {
                  ...packaged,
                  documentation: {
                    browserAuthSafetyPrecheck: "environment instructions",
                  },
                },
              },
            }
          : {}),
      }
    : undefined;
  const loader = source
    ? original(bundle)
    : createBrowserDocumentation(moduleUrl, bundle);
  const options: any =
    mode === "bundle-env"
      ? { environment: "test" }
      : mode === "bundle-missing"
        ? { environment: "missing" }
        : mode === "explicit"
          ? { root: new URL("file:///explicit/") }
          : mode === "bundle-explicit"
            ? {
                root: Promise.resolve(new URL("file:///explicit/")),
                environment: "missing",
              }
            : {};
  const filesystem = {
    async readFile(url: URL) {
      trace.push(url.href);
      if (mode === "permission")
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      if (
        mode === "missing" ||
        (mode === "fallback" && url.pathname.includes("/docs/")) ||
        (mode === "safety-probe" && url.pathname.endsWith("api.json"))
      )
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      if (url.pathname.endsWith(".json"))
        return mode === "invalid-json"
          ? "invalid"
          : JSON.stringify({ file: url.pathname });
      return "disk instructions";
    },
  };
  const result = [];
  for (const operation of [
    () =>
      loader.readDocumentation(
        mode === "invalid-name"
          ? "../secret"
          : mode === "missing-name"
            ? "missing"
            : "browserAuthSafetyPrecheck",
        filesystem,
        options,
      ),
    () => loader.apiManifest(filesystem, options),
    () => loader.documentManifest(filesystem, options),
  ]) {
    try {
      result.push(await operation());
    } catch (error) {
      result.push({ error: (error as Error).message });
    }
  }
  return { result, trace };
}
test("documentation lookup matches original packaged environment and filesystem error precedence", async () => {
  for (const mode of [
    "normal",
    "bundle",
    "bundle-env",
    "bundle-missing",
    "bundle-explicit",
    "explicit",
    "fallback",
    "safety-probe",
    "permission",
    "missing",
    "invalid-json",
    "invalid-name",
    "missing-name",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
  const missing = await scenario(false, "missing");
  assert.equal(missing.trace.length, 6);
  assert.equal((await scenario(false, "bundle-env")).trace.length, 0);
  assert.equal(
    (await scenario(false, "bundle-env")).result[0],
    "environment instructions",
  );
});
test("documentation loader shares failed discovery and returns packaged manifest identity", async () => {
  const manifest = { shared: true };
  const loader = createBrowserDocumentation(moduleUrl, {
    default: {
      documentation: {},
      apiManifest: manifest,
      documentManifest: manifest,
    },
  });
  assert.equal(
    await loader.apiManifest({
      async readFile() {
        throw new Error("unexpected");
      },
    }),
    manifest,
  );
  const disk = createBrowserDocumentation(moduleUrl);
  let calls = 0;
  const fs = {
    async readFile() {
      calls++;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  };
  const first = disk.root(fs),
    second = disk.root(fs);
  assert.equal(first, second);
  await assert.rejects(first);
  await assert.rejects(disk.root(fs));
  assert.equal(calls, 6);
});
test("documentation discovery reads a real reference directory and rejects path traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-docs-"));
  try {
    await mkdir(join(root, "references"));
    await mkdir(join(root, "scripts"));
    await writeFile(
      join(root, "references", "browserAuthSafetyPrecheck.md"),
      "synthetic safety instructions",
    );
    await writeFile(
      join(root, "references", "documents.json"),
      '{"documents":[]}',
    );
    const loader = createBrowserDocumentation(
      pathToFileURL(join(root, "scripts", "service.mjs")).href,
    );
    const filesystem = { readFile: (url: URL) => readFile(url, "utf8") };
    assert.equal(
      await loader.readDocumentation("browserAuthSafetyPrecheck", filesystem),
      "synthetic safety instructions",
    );
    assert.deepEqual(await loader.documentManifest(filesystem), {
      documents: [],
    });
    await assert.rejects(
      loader.readDocumentation("../secret", filesystem),
      /relative path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
