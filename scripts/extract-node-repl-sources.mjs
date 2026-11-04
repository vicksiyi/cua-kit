import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
export const defaultNodeReplBinary =
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl";
const boundaries = [
  ["kernel.js", "// Node-based kernel for node_repl."],
  ["diagnostics.js", "diagnostics.jsconst redactedDiagnosticSourceMaxLength"],
  [
    "privileged-node-repl.js",
    "privileged-node-repl.js// Trusted-only Node REPL host bridge",
  ],
  [
    "privileged-node-repl-config.js",
    "privileged-node-repl-config.jsfunction createPrivilegedNodeReplConfig",
  ],
  ["realmChecks.js", "realmChecks.js/**"],
  ["meriyah.umd.min.js", "meriyah.umd.min.js/*!"],
  ["tracing.js", "tracing.jsconst { AsyncLocalStorage }"],
  [
    "trusted-worker.js",
    "// Trusted service host. JSONL on stdout is reserved for the Rust supervisor.",
  ],
  ["worker-runtime.js", "worker-runtime.jsconst { AsyncLocalStorage }"],
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function extractNodeReplSources(binary = defaultNodeReplBinary) {
  const bytes = await readFile(binary),
    all = boundaries.map(([name, marker]) => {
      const token = Buffer.from(marker),
        matches = [];
      let offset = bytes.indexOf(token);
      while (offset >= 0) {
        matches.push({
          name,
          offset,
          start:
            offset + (marker.startsWith(name) ? Buffer.byteLength(name) : 0),
        });
        offset = bytes.indexOf(token, offset + 1);
      }
      if (matches.length === 0)
        throw new Error(`Missing embedded source boundary: ${name}`);
      return matches;
    });
  const copies = all[0].length;
  if (all.some((matches) => matches.length !== copies))
    throw new Error("Inconsistent embedded resource copy counts");
  const tail = Buffer.from(
    "module.exports = {\n  createWorkerRuntime,\n  isPlainObject,\n  makeRejectedThenable,\n  toByteArray,\n  trackExecBackgroundOperation,\n};\n",
  );
  const files = {},
    resources = [];
  for (let copy = 0; copy < copies; copy++)
    for (let i = 0; i < all.length; i++) {
      const { name, start } = all[i][copy],
        finish =
          all[i + 1]?.[copy].offset ??
          (bytes.indexOf(tail, start) < 0
            ? -1
            : bytes.indexOf(tail, start) + tail.length);
      if (finish <= start)
        throw new Error(`Invalid embedded source order: ${name}`);
      const raw = bytes.subarray(start, finish),
        source = raw.toString("utf8");
      if (!Buffer.from(source).equals(raw))
        throw new Error(`Invalid UTF-8 source: ${name}`);
      parse(source, {
        ecmaVersion: "latest",
        sourceType: "script",
        allowAwaitOutsideFunction: true,
      });
      if (copy === 0) {
        files[name] = source;
        resources.push({
          name,
          offset: start,
          occurrences: [start],
          bytes: raw.length,
          sha256: digest(raw),
          ...(name === "meriyah.umd.min.js"
            ? { upstream: "meriyah", version: "7.0.0" }
            : {}),
        });
      } else {
        if (source !== files[name])
          throw new Error(`Embedded copies differ: ${name}`);
        resources[i].occurrences.push(start);
      }
    }

  return {
    files,
    manifest: {
      binaryBytes: bytes.length,
      binarySha256: digest(bytes),
      resources,
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2];
  if (!output)
    throw new Error(
      "Usage: node scripts/extract-node-repl-sources.mjs OUTPUT_DIRECTORY [BINARY]",
    );
  const { files, manifest } = await extractNodeReplSources(process.argv[3]);
  await mkdir(output, { recursive: true });
  for (const [name, source] of Object.entries(files))
    await writeFile(resolve(output, name), source);
  await writeFile(
    resolve(output, "source-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Extracted and syntax-checked ${Object.keys(files).length} embedded JavaScript resources to ${resolve(output)}`,
  );
}
