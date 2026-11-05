import test from "node:test";
import assert from "node:assert/strict";
import { parseMacSystemProxy, withHostProxy } from "../packages/agent-loop/src/system-proxy";
test("macOS enabled HTTP proxy becomes child proxy config without approximating PAC", () => {
  const value = "  HTTPEnable : 1\n HTTPProxy : 127.0.0.1\n HTTPPort : 7890\n HTTPSEnable : 1\n HTTPSProxy : 127.0.0.1\n HTTPSPort : 7890\n";
  assert.deepEqual(parseMacSystemProxy(value), {HTTP_PROXY:"http://127.0.0.1:7890",HTTPS_PROXY:"http://127.0.0.1:7890"});
  assert.deepEqual(parseMacSystemProxy(value+"ProxyAutoConfigEnable : 1"), {});
  assert.deepEqual(parseMacSystemProxy("HTTPEnable : 0\nHTTPProxy : invalid/user\nHTTPPort : 1"), {});
});
test("explicit proxy wins and unrelated secrets do not enter child configuration", async () => {
  const value = await withHostProxy({HTTPS_PROXY:"http://configured:8000"}, {HTTPS_PROXY:"http://parent:9000",NO_PROXY:"localhost",DEEPSEEK_API_KEY:"private"});
  assert.deepEqual(value, {HTTPS_PROXY:"http://configured:8000",NO_PROXY:"localhost"});
});
