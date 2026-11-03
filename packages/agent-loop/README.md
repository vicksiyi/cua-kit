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
