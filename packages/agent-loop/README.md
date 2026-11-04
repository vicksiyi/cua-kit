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

This entry exposes the native NodeREPL tools with restored workers. CUA browser/app globals additionally require the cua-repl banner, configured trusted services, installed package roots and actual browser/native backend resources. `demo:restored` now stages installed runtime packages into a temporary node_modules tree and supplies its search root. It retains distinct dependency versions and copies actual package files; internal links stay within that deployment. The staging helper runs no install scripts or network requests and cleans up after the MCP client closes. When CUA_REPL_ENABLED_SURFACES is explicitly present in CUA_MCP_ENV, the demo now uses @core/cua-repl to assemble the banner, service defaults, tool descriptions and environment allowlist. Actual backend resources still require explicit host configuration. The current real MCP test uses a temporary configured service; it does not claim a live DeepSeek or desktop/browser task has run.

Validation now includes `reconstruction/agent-loop-native-adapter.test.ts` and the opt-in macOS `reconstruction/native-supervisor.integration.ts`. The latter tests the generic McpToolClient against this adapter, actual native MCP, both restored workers, trusted RPC and reset; fake model-key environment values are confirmed absent in the worker.

Package staging is independently authored demo deployment code, not recovered supervisor logic. It follows runtime dependencies, installed optional dependencies and required peers, handles cycles, and deliberately excludes development dependencies. The original build must exist before staging. Runtime package files include third-party native/WASM assets already installed locally; staging does not rebuild native addons for another Node ABI or platform.

## CUA initialization in the demo

Set `CUA_REPL_ENABLED_SURFACES` inside `CUA_MCP_ENV` to opt into the restored launcher configuration. An absent setting keeps generic JavaScript mode. An empty string initializes CUA documentation and common APIs with no browser/computer surfaces; it is useful to verify bootstrap without contacting a desktop backend:

```sh
export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":""}'
npm run demo:restored -w @core/agent-loop -- "Report typeof cua.getState using js"
```

For a configured real host, use `"browser"`, `"computer"`, or `"browser,computer"`. The same restored configuration used by the original launcher supplies `@core/browser-desktop/service` and/or `@core/sky/service`, the import banner, platform/environment-specific tool descriptions and the untrusted-environment allowlist. Explicit `NODE_REPL_TRUSTED_SERVICES` and `NODE_REPL_JS_BANNER` overrides retain the original nullish-default behavior, including empty-string overrides. Enabling surfaces does not install or configure the underlying browser bridge/native backend. Model credentials remain outside CUA_MCP_ENV.

The opt-in native integration test verifies actual MCP descriptions, automatic first-call banner, no duplicate banner on the next call, and initialization again after js_reset. It uses empty surfaces and no real model credential; it does not establish browser/app task completion.

## Host context for browser services

The deployed runtime root is added to **both** `NODE_REPL_NODE_MODULE_DIRS` and `NODE_REPL_TRUSTED_CODE_PATHS`. Module lookup alone is insufficient: the trusted worker also checks canonical service/dependency paths. Only the staged package tree is added automatically; existing explicit roots remain intact.

`McpToolClient.connect(parameters, { requestMeta: () => metadata })` supplies standard MCP `tools/call` `_meta` from the host on each call. The callback allows a long-lived client to follow changing turns without putting protocol metadata into model-generated tool arguments. This connector is generic; it does not hardcode Codex fields. Other agents can supply their own context through the same option.

The restored browser service requires `x-codex-turn-metadata` with `session_id` and `turn_id`. For its one-question CUA run, `demo:restored` generates fresh UUIDs unless `CUA_MCP_REQUEST_META` is explicitly supplied. A persistent agent should provide its own stable session ID and current turn ID. `demo.ts` validates CUA_MCP_REQUEST_META as a JSON object and passes it on the caller side, not as a server environment setting. This is context propagation, not an access grant; original access checks remain in place. Native `turn_ended` lifecycle dispatch is now integrated through the host turn adapter described below.

A third opt-in native integration test now enables the actual default browser trusted service. With backend discovery explicitly set to an empty list, `cua.getState()` returns empty apps/browsers **without errors**. This covers real service startup and metadata propagation, but not a connected browser, click, screenshot or a real model call.

## Host-owned elicitation

`McpToolClient.connect(parameters, { elicit: async params => result })` optionally delegates MCP form elicitation to the calling application's UI. When supplied, the client advertises form elicitation and forwards the request to that callback; without it, no elicitation capability or automatic approval is installed. The callback returns the standard SDK ElicitResult. The AgentLoop/model contracts remain independent of this transport-specific host feature. The command-line demo now provides the terminal UI described below; embedding agents can connect their own handler.

The native integration suite also runs two fresh isolated Chromium scenarios through a fixture Unix-socket backend. Both use the actual native supervisor, restored workers, staged default browser service and privileged native-pipe bridge. Declining the fixture origin prevents AX content reads. In a separate temporary home, accepting the fixture origin permits getTab, indexed AX click and screenshot; the test checks the button's actual DOM change and image bytes received through MCP. Distinct homes matter because a declined permission can persist. No permission files are cleared to force a retry.

The socket backend is a test adapter forwarding CDP to isolated Chromium, not a recovered Chrome extension. Native MCP denies IP networking while allowing Unix sockets; Chromium fulfills only the fixture URL locally and aborts other routed requests. The AX WASM remains an explicit installed application resource. This proves the tested integration chain, not production browser installation, all permission paths or live DeepSeek behavior.

## Turn completion

The generic ToolClient contract has optional `endTurn()`. AgentLoop invokes it after success, execution failure, cancellation or budget exhaustion, before returning an answer or rethrowing the failure. Cleanup does not inherit an already-aborted action signal. If execution and cleanup both fail, an AggregateError preserves both errors; cleanup failure alone also remains visible.

`NodeReplTurnClient` is an independently authored adapter for the observed native lifecycle protocol. It hides `turn_ended` from model tool discovery, rejects direct model invocation, and sends one host request containing `hook_event_name`, `session_id` and `turn_id`. Repeated endTurn calls share the same promise, including failures. Create a new wrapper for each turn; the underlying McpToolClient can remain connected. Closing the wrapper closes that underlying client, so a persistent agent should close it only when its session ends.

CUA `demo:restored` derives CUA_MCP_TURN_EVENT from the same request metadata used by browser operations, using `turn_ended` as this demo's hook-event label. That label has been accepted in actual native MCP testing; it is not asserted to be the exact label used by Codex's internal caller. Generic `demo` accepts an optional explicitly configured CUA_MCP_TURN_EVENT object. The loop dispatches completion before the demo closes MCP and removes staged packages. The adapter does not fabricate hooks or reimplement the native lifecycle engine.

Validation covers successful/failed/cancelled execution, suppressed model access to the lifecycle tool, idempotent host dispatch and combined execution/cleanup errors. Actual native MCP tests verify that the browser socket backend receives exactly one matching session/turn completion after both accepted and declined origin scenarios.

## Terminal confirmation UI

When both stdin and stderr are terminals, `demo` (including `demo:restored`) advertises form elicitation and displays requests on stderr. Choose accept, decline or cancel explicitly. Empty/unknown choices do not accept. For forms with fields, enter a JSON object matching the displayed schema; invalid JSON or values prompt again. The UI uses the MCP SDK's existing AjvJsonSchemaValidator, including required/type/enum/range checks, instead of implementing a schema validator. It does not apply form defaults automatically.

EOF, prompt interrupt or cancellation of the caller's signal cancels the request. Requests are serialized so concurrent forms cannot share an input prompt. Terminal control sequences are removed from displayed server messages/schema text. URL-mode elicitation is unsupported and returns cancel without opening a URL. A non-interactive stdin or stderr provides no terminal callback or elicitation capability; embedding agents should supply their own UI through McpClientOptions.elicit.

`promptElicitation(params, io)` exposes the same decision/validation flow with an injectable IO interface for other frontends and tests; `createTerminalElicitation` supplies Node readline and TTY detection. Both are independently authored demo code, not recovered application UI. Native Chromium acceptance/decline tests now use this form handler with scripted test-only IO. A real PTY probe also verified invalid integer retry, accepted values and EOF cancellation. This does not imply a real model call or production desktop backend installation.
