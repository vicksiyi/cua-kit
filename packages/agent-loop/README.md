# @core/agent-loop — caller-side demo

This package is independently authored demo code, not reconstructed `@oai` source. It reuses the earlier agent-neutral contract/loop design and connects to an explicitly selected MCP server. It does not assert completion of the reconstructed CUA backend.

`ModelAdapter` and `ToolClient` isolate model and tool transports. DeepSeek is the default demo provider, using the official OpenAI-compatible Chat Completions API, `deepseek-flash`, and non-thinking mode. Non-thinking mode avoids requiring reasoning-content replay in this initial adapter. Model calls remain outside MCP, and model credentials are not forwarded to its child server.

After `npm ci` at the repository root:

```sh
# Load DEEPSEEK_API_KEY securely in your local environment first.
export CUA_MCP_COMMAND=node
export CUA_MCP_ARGS='["/absolute/path/to/your/mcp-server.js"]'
export CUA_MCP_ENV='{}'
npm run demo -w @core/agent-loop -- "Analyze the webpage using the available tools"
```

`CUA_MCP_ENV` is an explicit JSON string map for tool-server settings. Its model-related keys are rejected. For a different model provider set `CUA_MODEL_PROVIDER=openai-compatible`, `CUA_MODEL_API_KEY`, `CUA_MODEL`, and `CUA_MODEL_ENDPOINT`. DeepSeek accepts optional `CUA_MODEL` / `CUA_MODEL_ENDPOINT` overrides; use endpoint overrides only for an intentionally selected trusted provider/test endpoint.

Validation:

```sh
npm run check -w @core/agent-loop
npx tsx --test reconstruction/agent-loop-deepseek.test.ts
```

The integration test starts a real MCP stdio server and a local mock model HTTP endpoint, verifies the tool-call/result round trip, and uses no real model key. A live DeepSeek call is still pending a located credential. The package currently runs from TypeScript with tsx; published JS packaging is not claimed.

Official API references (checked 2026-11-04):
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/guides/tool_calls/

## Restored-worker runtime entry

The independently authored `native-supervisor.ts` adapter uses the installed, hash-verified native supervisor and substitutes **both** reconstructed worker entries through its existing wrapper hook. It preserves native bootstrap arguments and signal/exit handling, rejects a conflicting wrapper or unknown binary build, and removes `DEEPSEEK`/`CUA_MODEL` environment keys from the native child. It is integration glue, not a reconstruction of the Rust supervisor.

```sh
npm run build:reconstruction
export CUA_NATIVE_SUPERVISOR_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl
export NODE_REPL_NODE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1"}'
# DEEPSEEK_API_KEY must already be available to the caller, not CUA_MCP_ENV.
npm run demo:restored -w @core/agent-loop -- "Use js to compute 6 * 7"
```

For a generic MCP caller, the executable is Node with `--import <absolute tsx loader URL>` and `packages/agent-loop/src/native-supervisor.ts` as arguments; `demo:restored` constructs these paths. A shell-level stdio entry is `npm run --silent mcp:restored -w @core/agent-loop`; `--silent` avoids npm banners on the protocol stream. Supply the native path and tool-server configuration explicitly.

This entry exposes the native NodeREPL tools with restored workers. CUA browser/app globals additionally require the cua-repl banner, configured trusted services, installed package roots and actual browser/native backend resources. Those are not automatically provisioned by this adapter. The current real MCP test uses a temporary configured service; it does not claim a live DeepSeek or desktop/browser task has run.

Validation now includes `reconstruction/agent-loop-native-adapter.test.ts` and the opt-in macOS `reconstruction/native-supervisor.integration.ts`. The latter tests the generic McpToolClient against this adapter, actual native MCP, both restored workers, trusted RPC and reset; fake model-key environment values are confirmed absent in the worker.
