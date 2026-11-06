import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

test(
  "JS-only CLI removes stale CUA deployment and executes through real Rust MCP",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_NATIVE_SKY_IPC !== "1",
    timeout: 90000,
  },
  async (t) => {
    let requests = 0;
    let serverError: unknown;
    const server = createServer(async (req, res) => {
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        requests++;
        const context = JSON.stringify(input.messages);
        assert.match(context, /browser=false, computer=false/);
        assert.doesNotMatch(
          context,
          /host-unified-preflight|host-browser-preflight|host-computer-preflight/,
        );
        const message =
          requests === 1
            ? {
                tool_calls: [
                  {
                    id: "js-only-check",
                    type: "function",
                    function: {
                      name: "js",
                      arguments: JSON.stringify({
                        code: "console.log(JSON.stringify({answer:6*7,cua:typeof cua,agent:typeof agent}));",
                        title: "Verify JS-only globals",
                      }),
                    },
                  },
                ],
              }
            : { content: "JS-only runtime returned 42 with no CUA globals." };
        if (requests === 2) {
          const observed = JSON.parse(
            input.messages.find((m: any) => m.role === "tool").content,
          );
          assert.equal(observed.isError, false);
          const value = observed.content
            .filter((item: any) => item.type === "text")
            .flatMap((item: any) => {
              try {
                return [JSON.parse(item.text)];
              } catch {
                return [];
              }
            })
            .find((item: any) => typeof item.answer === "number");
          assert.deepEqual(value, {
            answer: 42,
            cua: "undefined",
            agent: "undefined",
          });
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message }] }));
      } catch (error) {
        serverError = error;
        res.statusCode = 500;
        res.end("Fixture assertion failed");
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const address = server.address();
    assert(address && typeof address !== "string");
    const child = spawn(
      "bash",
      ["scripts/run-deepseek.sh", "--js", "Calculate 6 * 7 using js."],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          CUA_DEBUG: "0",
          CUA_MODEL_PROVIDER: "openai-compatible",
          CUA_MODEL_API_KEY: "fixture",
          CUA_MODEL: "fixture",
          CUA_MODEL_ENDPOINT: `http://127.0.0.1:${address.port}/model`,
          CORE_CUA_NATIVE_BACKEND: "swift",
          CORE_CUA_NATIVE_HELPER_PATH: "/nonexistent/helper",
          CORE_CUA_HOST_DIRECTORY: "/nonexistent/browser-host",
          CUA_MCP_ENV: JSON.stringify({
            CUA_REPL_ENABLED_SURFACES: "browser,computer",
            CORE_CUA_NATIVE_BACKEND: "swift",
            CORE_CUA_NATIVE_HELPER_PATH: "/nonexistent/helper",
            CORE_CUA_HOST_DIRECTORY: "/nonexistent/browser-host",
            NODE_REPL_JS_BANNER: "throw Error('stale CUA banner');",
            NODE_REPL_TRUSTED_SERVICES:
              '{"sky":"missing-service","browser":"missing-service"}',
          }),
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 80000,
      },
    );
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    });
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    assert.ifError(serverError);
    assert.equal(code, 0, output);
    assert.equal(requests, 2);
    assert.match(output, /JavaScript-only surface/);
    assert.match(output, /JS-only runtime returned 42/);
    assert.doesNotMatch(
      output,
      /build:native|Native UI permissions|Chrome startup profile/,
    );
  },
);
