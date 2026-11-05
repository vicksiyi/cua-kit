import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";

const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test(
  "restored trusted private-key bootstrap matches installed worker, including closed initialization and secret-safe failures",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "core-private-keys-"));
    const original = path.join(root, "original"),
      services = path.join(root, "services");
    await mkdir(original);
    await mkdir(services);
    await writeFile(path.join(original, "package.json"), '{"type":"commonjs"}');
    for (const [name, source] of Object.entries(files))
      await writeFile(path.join(original, name), source as string);
    const service = path.join(services, "keys.mjs");
    await writeFile(
      service,
      `import {sign,verify,createPublicKey} from 'node:crypto';
export function handleRpc(){ const key=nodeRepl.privateKeys.get('fixture'); const missing=nodeRepl.privateKeys.get('missing'); const input=Buffer.from('fixture'); return {frozen:Object.isFrozen(nodeRepl.privateKeys), missing:missing===undefined, type:key?.type, verified:key?verify(null,input,createPublicKey(key),sign(null,input,key)):false, mutable:typeof nodeRepl.privateKeys.set}; }`,
    );
    const serviceRequest = {
      type: "service",
      id: "one",
      service: "fixture",
      request: {},
    };
    const init = { type: "private_keys", keys: { fixture: pem } };
    const cases = [
      [init, serviceRequest],
      [serviceRequest],
      [init, init],
      [serviceRequest, init],
      [
        {
          type: "private_keys",
          keys: { fixture: "secret-invalid-key-fixture" },
        },
      ],
    ];
    try {
      for (const messages of cases) {
        const results = [];
        for (const entry of [
          path.join(original, "trusted-worker.js"),
          path.resolve("packages/node-repl/dist/trusted_worker.js"),
        ]) {
          const child = spawn(process.execPath, [entry, root], {
            env: {
              NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ fixture: service }),
              NODE_REPL_TRUSTED_CODE_PATHS: services,
            },
            stdio: ["pipe", "pipe", "pipe"],
          });
          let stdout = "",
            stderr = "";
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
            if (stdout.includes("\n")) child.stdin.end();
          });
          child.stderr.on("data", (chunk) => (stderr += chunk));
          const timer = setTimeout(() => child.kill(), 5000);
          const ended = new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
          });
          child.stdin.on("error", () => {});
          child.stdin.write(
            messages.map((message) => JSON.stringify(message)).join("\n") +
              "\n",
          );
          const code = await ended;
          clearTimeout(timer);
          assert.ok(!stdout.includes(pem) && !stderr.includes(pem));
          assert.ok(
            !stdout.includes("secret-invalid-key-fixture") &&
              !stderr.includes("secret-invalid-key-fixture"),
          );
          results.push({ code, stdout, stderr });
        }
        assert.deepEqual(results[1], results[0]);
        if (
          messages.length === 2 &&
          messages[0] === init &&
          messages[1] === serviceRequest
        ) {
          assert.equal(results[1].code, 0);
          const record = JSON.parse(results[1].stdout.trim());
          assert.equal(record.value.verified, true);
          assert.equal(record.value.frozen, true);
          assert.equal(record.value.mutable, "undefined");
        } else if (messages.length === 1 && messages[0] === serviceRequest) {
          assert.equal(
            JSON.parse(results[1].stdout.trim()).value.missing,
            true,
          );
        } else {
          assert.equal(results[1].code, 1);
          assert.equal(
            results[1].stderr.trim(),
            "Private key initialization failed",
          );
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
