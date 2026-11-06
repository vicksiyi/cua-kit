# @core/agent-loop — caller-side demo

## Local interactive entry

From the repository root, run `npm run demo:deepseek`. Enter your prompt. The project root `.env` is loaded automatically; existing environment variables take precedence. Set `DEEPSEEK_API_KEY` there (see `.env.example`); the key is requested at a hidden terminal prompt only when absent. `.env` is Git-ignored and must stay local. The
script builds reconstructed packages and sets the installed macOS supervisor/Node
paths, while respecting explicit path overrides. Requires dependencies already
installed (`npm ci` on a fresh checkout) and the matching ChatGPT.app installation.

```sh
npm run demo:deepseek -- --js "请调用 js 计算 6 * 7，并告诉我结果"
# Browser tools; requires a usable connected host backend:
npm run demo:deepseek -- --browser "列出当前可用浏览器；没有浏览器就明确说明"
```

On macOS, default mode is `--unified`: browser and native app APIs are both available to the
model for target selection. Other platforms default to browser-only. Use `--browser` or `--computer`
to restrict the run, and `--js` for JavaScript-only tools. Explicit browser deployment options
(`--cdp-browser`, `--managed-browser`, `--cdp-endpoint`) select browser-only mode. CLI surface
selection overrides stale surface fields in CUA_MCP_ENV. Browser-only mode removes native backend
settings; JS-only mode removes CUA/browser deployment fields and CUA bootstrap/trusted-service
configuration. Other configuration remains in effect. On macOS JS-only uses the independent Rust
runtime without browser/Sky services or the Swift helper, rather than the installed supervisor.

Unified mode discovers configured existing browser connections and offers the host prepare_browser
tool when a valid private host directory is available; it does not eagerly launch Chrome for an
app task. Explicit browser-only mode checks its selected backend before the model request and can
launch the selected Chrome profile. CDP launch mode uses an isolated browser. Native App actions
still require local policy, interactive approval and macOS permissions; full native UI acceptance
remains incomplete. Missing browser configuration is not automatically repaired.

The terminal shows timestamped TOOL REQUEST entries with arguments and TOOL RESULT
entries with status and output, followed by the final model answer. Returned images
are saved with private permissions in a temporary cua-demo-images directory and their
paths printed. Screenshots come from actual tool results.
Set CUA_DEMO_VERBOSE=1 for full tool text (default truncates long text to 2000 chars).
Known API-key/token/secret/password environment values are redacted from tool logs;
review any other private page/tool content before sharing output. Ctrl-C requests
cancellation. No model key is saved by this entry.


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

The integration test starts a real MCP stdio server and a local mock model HTTP endpoint, verifies the tool-call/result round trip, and uses no real model key. A live DeepSeek call and a real MCP JavaScript task have now passed; see the live validation note below. The package currently runs from TypeScript with tsx; published JS packaging is not claimed.

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

This entry exposes the native NodeREPL tools with restored workers. CUA browser/app globals additionally require the cua-repl banner, configured trusted services, installed package roots and actual browser/native backend resources. `demo:restored` now stages installed runtime packages into a temporary node_modules tree and supplies its search root. It retains distinct dependency versions and copies actual package files; internal links stay within that deployment. The staging helper runs no install scripts or network requests and cleans up after the MCP client closes. When CUA_REPL_ENABLED_SURFACES is explicitly present in CUA_MCP_ENV, the demo now uses @core/cua-repl to assemble the banner, service defaults, tool descriptions and environment allowlist. Actual backend resources still require explicit host configuration. The browser integration test uses a temporary configured service. A live DeepSeek JavaScript task has passed separately; no desktop/browser task completion is claimed.

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

## Live model validation (2026-11-05)

Using a user-supplied credential held only in the launching process environment,
the official DeepSeek endpoint returned HTTP 200 for deepseek-flash. Then the
existing `demo:restored` entry completed a real AgentLoop: DeepSeek requested `js`,
the actual native MCP with restored workers executed the calculation, and DeepSeek
returned 42. The key was not persisted or passed in MCP tool arguments/server config.
This verifies model/tool integration for JavaScript, not browser or app operation.
Live browser discovery still returned zero usable backends in the separate probe.

## Current independent browser deployment

`npm run install:chrome` registers the host and writes `CORE_CUA_HOST_DIRECTORY`
to the ignored root `.env`. Load the built Core CUA extension from
`packages/browser-extension/dist/native-extension` using Chrome's Load unpacked UI.
Then run `npm run demo:deepseek -- "your prompt"`; the launcher discovers private
endpoint descriptors within that configured directory. An explicit
`CORE_CUA_ENDPOINT_FILES` JSON array takes precedence. API keys remain in the model
process. Browser permissions still appear through terminal elicitation.

The live DeepSeek test now completes a local webpage navigation/button-click/read
workflow through the full MCP chain; the model observes a result marker absent
from its prompt. Real Chrome search acceptance and native app acceptance remain
outstanding. This supersedes the JavaScript-only validation status above.

### Diagnosing external-page waits

The restored demo supplies `timeout_ms: 60000` for JS calls that omit a timeout. This is caller policy using the original supervisor protocol, not a change to CUA security checks or native fetch behavior. Explicit tool timeouts remain unchanged. The MCP transport deadline is 65 seconds. This avoids giving a default 30-second JS cell exactly the same deadline as an observed 30-second authenticated-fetch failure; it does not make unavailable network services succeed.

To see bounded local diagnostics for those requests:

```sh
CORE_CUA_RUNTIME_DIAGNOSTICS=1 npm run demo:deepseek -- "访问百度 搜索 deepseek 给我返回第一条搜索结果"
```

The worker wrapper observes JSONL while forwarding its bytes unchanged. It logs only request sequence, a fixed category (`site-status`, `identity`, `other-fetch`), elapsed time and HTTP/transport outcome to stderr. URLs, query strings, IDs, headers, bodies and raw errors are not emitted by this diagnostic observer. Normal tool logs still contain tool input and page output as before. Diagnostics are disabled by default, bounded to 64 KiB per observed line and 1024 pending requests, and best effort during abrupt process termination. They do not bypass approvals or captchas and do not establish that external search succeeded.


### Check the installed Chrome connection without DeepSeek

```sh
npm run demo:deepseek -- --check-browser
```

This mode does not require a model token or prompt and does not create a model client.
It uses the same restored runtime, host discovery and CUA inventory as the demo,
prints tool logs when connected, and exits nonzero if no browser is available.
A successful inventory check proves discovery only; it does not certify navigation,
clicks, screenshots or search results. It does not execute a page action.
For the independent Chrome installation, load
`packages/browser-extension/dist/native-extension` through Chrome's extensions
page after `npm run install:chrome`. Keep Chrome running during the check.


### Browser connection prerequisites

The restored demo reports missing host directories and absent browser endpoints
with actionable instructions (extension load path, native-host reinstall and
`npm run demo:deepseek -- --check-browser`). These known startup failures exit 1
before model/MCP startup without an unhandled stack trace. Private-directory
permission violations and unexpected errors remain errors; they are not
reclassified as a missing browser. This diagnostic does not establish browser
connectivity or make a failed operation succeed.


### Native App mode (not yet accepted on this machine)

`npm run demo:deepseek -- --check-computer` checks the restored native Sky service via MCP without constructing a model or requiring a DeepSeek token. It requests app inventory and reports only a verified connection/count, not a screenshot/click success. `npm run demo:deepseek -- --computer "your prompt"` selects computer-only tools and runs the same preflight before the AgentLoop. Default browser mode and `--check-browser` remain separate. In computer mode the browser endpoint environment defaults are not forwarded; the explicit computer CLI mode overrides stale surface/backend fields in CUA_MCP_ENV while preserving other fields.

Current real-machine check fails with `Sky Computer Use native pipe startup failed`, despite the default socket path existing. A subsequent correlated system-log probe records `Sender process is not authenticated`: the installed native service rejects sender authentication. The log does not identify the rejected executable or a supported standalone authorization path. The CLI exits with a diagnostic before any model request. Native operations remain unaccepted.


### Approved independent native route

`--computer` and `--check-computer` select Rust + restored `@core/sky/service` + Swift IPC, build both native components, and override stale backend/surface fields. `--swift-computer` is an alias. The direct restored-demo entry also retires the old TS service branch: native backend `independent` aliases `swift`, computer defaults to Rust, and an explicitly conflicting installed supervisor is rejected. Explicit vendor comparison requires backend `vendor` with the installed supervisor. No silent fallback occurs. The independent inventory preflight now passes on this machine; the earlier sender-authentication failure applies to the vendor route. Accessibility and screen-recording permissions still report false, and native UI operation acceptance is incomplete. See `packages/native-macos/README.md` for current adapter capabilities and remaining differences.

### Internal CDP deployment validation

`--cdp-browser` selects the extension-free owned Chromium deployment using the same demo/MCP stack. It can precede `--check-browser` or the natural-language prompt. Project `.env` is still loaded automatically; browser/MCP children do not inherit model credentials. The terminal shows tool logs, origin confirmations, screenshot file paths and final text. This launches a temporary visible browser and closes it at process exit; it does not attach the daily Chrome profile. The project-wide experience handoff remains pending desktop acceptance.

### Local demo debug logs

`npm run demo:deepseek -- "your prompt"` now enables local diagnostics by default.
The CLI prints `Local debug log: <absolute path>`; each run has a unique JSONL
file under the repository's `artifacts/debug/` directory. Set `CUA_DEBUG=0` to
turn this off (or put that setting in local `.env`). Core `AgentLoop` remains
independent of disk logging; this is wired only into the demo via model/tool
wrappers.

Events include run input and model name, model requests/responses with step
numbers, full tool arguments and text results, per-call duration, tool errors,
elicitation requests and chosen action, final answer, end-turn and close.
Terminal truncation does not truncate JSONL text. Image base64 is omitted; the
terminal trace continues to print screenshot paths. Logs describe decisions and
tool calls returned by the model, not hidden model reasoning.

Logs can contain page/app text and your prompt. They stay local: there is no
upload/export transport, and `artifacts/` is excluded by `.gitignore`. Files are
created with mode 0600, new directories with 0700. Known credential environment
values, credential fields and common API-key/Bearer strings are redacted; this
is not a guarantee of removing arbitrary sensitive prose from visited pages.
Do not commit or attach raw logs publicly. Delete old runs manually as needed;
there is no automatic retention limit yet.

When reporting a failure, give the printed file path (or say "read the latest
local debug log"). For example, a 12-step budget failure now reports the log
path and exits nonzero without the raw budget-exception stack. There is no default round limit; enabling diagnostics does not fabricate a final
answer. Explicit SDK caller budgets remain supported. Logs start before MCP connection; earlier shell/build/configuration
failures can still precede creation of a run log.

### Budget exhaustion progress summary

The demo enables `summarizeOnExhaustion`. When an SDK caller explicitly sets `maxSteps` and exhausts that budget,
it makes at most one extra model request with no tool definitions and
`tool_choice: none`. The last tool result is included. No actions are executed
from this request, even if an adapter returns tool calls anyway. The loop still
throws `AgentStepBudgetError`; its optional `partialSummary` is model-generated
progress text, not a success verdict. The demo prints it under an explicit
incomplete label, logs it locally, and exits nonzero. A failed or empty summary
preserves the budget error and records the summary failure. Cancellation skips
or interrupts summarization and cleanup still runs.

Generic AgentLoop users must opt in to both a finite `maxSteps` budget and its
summary. The default loop and DeepSeek demo have no fixed round limit; they stop
on a final response, cancellation, a host authorization stop, or an error. This adds at most one model request (with the adapter's normal
timeout/cost), not more browser action rounds. Every ordinary decision receives its round number; a finite caller budget is
reported only when configured. Summaries can be mistaken; the host's
incomplete status is independent of their wording. This does not establish that
the original twelve-step search failure or all navigation inefficiencies are
resolved.

### CDP input guidance and live form acceptance

For the explicitly selected CDP backend, the demo supplies host guidance separate
from the restored API documentation: omit unsupported tab visibility options,
use Playwright controls for DOM-only tabs rather than numeric AX inputs, and
prefer observed accessible roles/names over hidden legacy CSS fields. This is
model guidance, not a new backend capability or a guarantee against mistakes.

An opt-in real DeepSeek/MCP/CDP acceptance test presents a hidden legacy input
and a visible textarea, submits a fresh random query, independently checks the
server received that query, and verifies the final answer includes a random
marker revealed only after submission:

```sh
CUA_LIVE_DEEPSEEK_TEST=1 node --import tsx --test reconstruction/cdp-deepseek-visible-form.test.ts
```

It uses the local `.env` and live model billing, and otherwise skips by default.
The current run completed in five decisions with zero tool errors. The external
Baidu reproduction also improved from the preceding run's twelve decisions and
three errors to four decisions with zero errors, but still encountered Baidu's
CAPTCHA and returned no result URL. These are observed individual runs, not a
statistical reliability claim or a CAPTCHA workaround.

## Demo browser-origin approval configuration

`CUA_AUTO_APPROVE_BROWSER_ORIGINS` is an optional caller-side policy. Leave it unset
for terminal confirmation. Set comma-separated HTTP(S) origins (scheme and port
must match), or `*` to accept all browser-origin access requests:

```bash
CUA_AUTO_APPROVE_BROWSER_ORIGINS=https://www.google.com npm run demo:deepseek -- '搜索公司信息'
CUA_AUTO_APPROVE_BROWSER_ORIGINS='*' npm run demo:deepseek -- '搜索公司信息'
```

The same variable can be stored in the ignored project `.env`. It accepts only
structured `browser-use` / `access_browser_origin` requests with matching origin
metadata and an empty, valid confirmation form. Other requests still use terminal
confirmation, or cancel in non-interactive mode. It does not override server
policy denials or automatically complete URL-mode or data-entry forms. Each
automatic approval is printed and recorded in the local debug log. This policy
is demo configuration; embedding agents retain their own `elicit` callback.

## Read-only browser preflight retry

Before the model turn, `browserPreflight` obtains CUA documentation/state and a
machine-readable browser inventory. If those tool results report failure or no
browser, it waits two seconds and retries this read-only sequence once. Both
attempts retain their tool responses and unique call IDs so initial API
documentation is not lost when CUA emits it only once. Cancellation stops the
wait; a thrown transport exception is propagated instead of retrying a closed
MCP client. Navigation, clicks and typing are never replayed by this mechanism.
The demo records `browser.preflight.retry` in its local debug log. A second
failure still stops before model execution. This does not implement reconnection
of a dead MCP process or recovery in the middle of a browser action.

Browser deployment flags (`--cdp-browser`, `--cdp-endpoint`, `--managed-browser`)
and surface/check flags can appear in either order before the prompt. Conflicting
backends, incompatible surfaces and unknown leading flags fail before build or
browser startup. For example, `--browser --cdp-browser 'prompt'` and
`--cdp-browser --browser 'prompt'` both select only the CDP demo. The runner clears
inherited `CUA_DEMO_START_CHROME` before selecting a deployment; only the default
extension prompt path enables it. Use `--` to start a prompt beginning with `--`.
This routing fix does not establish that a previously observed second browser
window came from one process; overlapping independent runs remain possible.

## Independent sandbox runtime (opt-in macOS browser demo)

The demo can use the Rust executable in `native/runtime-supervisor` instead of
the installed ChatGPT supervisor. `independent` is an alias for `rust`; neither
selects the legacy TypeScript supervisor. Build the native runtime and sandbox
addon, then select it explicitly:

```bash
npm run build:sandbox
npm run build:rust-runtime
CUA_RUNTIME_SUPERVISOR=independent npm run demo:deepseek -- --cdp-browser --check-browser
CUA_RUNTIME_SUPERVISOR=independent npm run demo:deepseek -- --cdp-browser '打开网页并读取内容'
```

The default remains `installed`; invalid selector values fail. The independent
path uses the current system Node executable, stages reconstructed packages,
creates disjoint sandbox worker directories, passes endpoint access only to the
trusted worker, and initializes CUA through an explicit MCP import. Bootstrap
responses are retained in the model conversation. Model keys stay in the caller.
Scratch/configuration files are removed after the MCP client closes.

This is an independently authored native-runtime replacement, not recovered Rust
source. It currently accepts only the browser surface and uses separate ephemeral
configuration with history/full raw CDP disabled. It does not load Codex user
preferences, configure authenticated backend-service fetch, or support desktop
Sky in this demo composition. Default runtime migration and full source parity
remain unfinished. Accepted paths include isolated CDP and both packaged native/full
extensions in isolated Chromium profiles. This does not establish cold startup or
recovery against the user’s daily Chrome profile.

Verification deliberately sets installed supervisor and bundled Node paths to
nonexistent files. A real MCP demo with a local model-protocol fixture submits a
local form and reads a random resulting marker; optional real DeepSeek runs the
same user task. Neither test operates the daily browser:

```bash
CUA_TEST_MACOS_SANDBOX=1 node --import tsx --test reconstruction/independent-demo-runtime.test.ts
CUA_TEST_MACOS_SANDBOX=1 CUA_LIVE_DEEPSEEK_TEST=1 node --import tsx --test reconstruction/independent-demo-runtime.test.ts
```


Independent extension acceptance (macOS, after reconstruction and sandbox builds):

```bash
CUA_RUNTIME_SUPERVISOR=independent node --import tsx --test --test-concurrency=1 reconstruction/extension-native-controller.test.ts
```

This exercises extension/native messaging, sandbox workers, MCP, CUA inventory,
page capture/navigation/click and screenshot, with installed runtime executable
paths deliberately invalid. It uses local pages and deterministic tool calls,
not a live model or the user's existing Chrome. Omit the environment selector to
run the same acceptance with the installed supervisor.

### Serialized tool-call text from a provider

The compatible Chat Completions adapter rejects a response that has no structured
`tool_calls` and begins with the observed DeepSeek `<｜｜DSML｜｜ calls>` or
`<｜｜DSML｜｜ invoke ...>` envelope. It does not execute or reinterpret that text.
Previously it could appear as a completed answer or an incomplete-progress
summary. Now an ordinary turn reports a protocol error; a budget summary keeps
its original budget error and records the summary failure, and an authorization
stop retains its host message without appending the malformed text. Cleanup is
still performed. The diagnostic does not include the raw provider body.

This is a demo provider-adapter validation, not an original CUA API change or a
claim that every possible malformed model response can be detected. It does not
retry the model or guarantee a valid answer on the next run. Only the observed
leading protocol envelope is rejected; ordinary prose mentioning DSML is text.
