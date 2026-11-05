# @core/runtime-supervisor

Current acceptance (2026-11-06): the independent MCP supervisor with OS-sandboxed
restored workers now performs real local-page navigation, form input, button
activation, DOM observation and image capture through the authenticated CDP host.
The installed ChatGPT supervisor is not used by that test. The default demo
still uses it: automatic deployment/configuration, authenticated external
services and native App acceptance remain incomplete. Sections below retain the
implementation history; see the latest acceptance section at the end.

Independently authored replacement work under approved route A. This package currently implements a worker-session core, not a production MCP server or a restored Rust implementation. The demo still uses the installed supervisor; no automatic fallback or change to existing policy occurs.

WorkerSession owns serialized execution, persistent worker-pair reuse, execution/RPC correlation, explicit service allowlisting, host-provided request metadata, form-elicitation forwarding, reset, timeout and cancellation retirement. Reset retires both workers before another generation can launch. Kernel messages cannot directly invoke privileged host operations. Host requests require an injected callback and are rejected when absent; stale replies after reset are discarded. Execution-scoped host signals are cancelled on execution end/retirement; trusted background fetch uses a generation-scoped signal. There is no fabricated authentication, site-status response or approval decision.

WorkerPort and launch are mandatory host boundaries: the deployer must provide OS isolation, separate trusted/untrusted environments, complete descendant-process termination and error propagation. The session core does not grant these guarantees by itself.

Still required: production process launcher/sandbox, production MCP launch integration, native pipe production endpoint policy/authentication, authenticated fetch, configuration and launch-services policy, media rendering/format policy, response trace/telemetry, late background-operation lifecycle. Do not wire this incomplete module into the default demo until these boundaries are implemented and verified.

Validation: `npx tsx --test reconstruction/runtime-supervisor.test.ts` runs actual restored kernel and trusted-worker subprocesses on macOS under a test-only network-deny profile. It checks persistent values, configured service RPC/host metadata, real elicitation accept/decline forwarding, reset, timeout and cancellation recovery (cancel only after a trusted request proves the cell started). Three additional protocol tests reject kernel-origin privilege escalation, discard late host replies after reset, and ensure close waits for in-flight launch cleanup. The test-only launcher is not a production isolation profile; fixture services are synthetic and no native UI/browser operation is accepted by these tests.

## POSIX process transport

`@core/runtime-supervisor/process-port` provides ProcessWorkerPort: explicit absolute executable/cwd, exact environment (no ambient inheritance), detached owned process group, UTF-8 JSONL object framing, default 8 MiB frame and 16 MiB queued-byte limits, a 256-message startup queue, input backpressure bounds, malformed/truncated frame retirement, bounded final-output draining and idempotent group TERM/KILL cleanup. Brief Darwin zombie-group EPERM races are retried; persistent permission errors propagate. It supports macOS/Linux POSIX process groups, not Windows.

The transport is not a sandbox. Its caller must still supply the production OS profile and trusted/untrusted environment policy. Group cleanup covers descendants that remain in the owned group; processes that create another session/group are not guaranteed terminated. Inherited stdout/stderr cannot hold close open indefinitely because the transport destroys its pipe handles after group retirement. Preventing process-group escape remains a launcher/isolation requirement.

Eleven session/transport tests pass. The actual restored-worker session test now uses ProcessWorkerPort rather than its old ad hoc relay. Additional subprocess tests verify split UTF-8 bytes, no inherited sentinel secret, malformed/oversized/truncated messages, startup and write-queue bounds, spawn failures, final-frame delivery and ordinary descendant termination. No installed Rust supervisor is used by those tests; no production MCP replacement or UI acceptance is implied.

ExecutionDeadline now implements the explicit trusted-worker suspend_timeout/resume_timeout messages with a monotonic active-time budget and nested suspension depth. Only the current trusted RPC can control it; direct kernel messages, stale execution IDs, unmatched resumes and RPC completion with leaked suspension fail the session. Resume uses remaining time rather than restarting the full timeout. Reset/close dispose the timer even while suspended. This implements the observed wire protocol; automatic suspension for every host endpoint and original Rust timeout policy equivalence are not established.

Fourteen runtime tests pass, including a real worker's nested 300 ms suspended wait under a 150 ms execution budget and subsequent resumed timeout, plus deterministic remaining-time and protocol rejection tests. The default demo still uses the installed supervisor.


## Host turn lifecycle

WorkerSession.turnEnded(event, options) validates the observed three-field event schema and serializes it with JavaScript execution. It sends directly to the trusted worker, pins host metadata, allows correlated host operations and explicit timeout controls, and accepts only the matching trusted turn_ended_result. Kernel messages cannot acknowledge or run lifecycle work. Missing acknowledgement, cancellation and invalid correlation retire the pair; later execution can launch a new generation. Kernel bindings survive a normally acknowledged turn.

Repeated session_id/turn_id notifications share the pending or successfully completed promise for the lifetime of this WorkerSession (including reset); failed attempts are removed, allowing an explicit caller retry, without automatic replay. hook_event_name is not part of the deduplication key. The deduplication ledger is in-memory and grows with distinct turns; durable/restart deduplication and retention policy remain host concerns. This is independently authored supervisor policy around the observed contract, not recovered Rust internals.

Fifteen runtime tests pass. Actual restored workers demonstrate a registered turn handler making a host elicitation, receiving request metadata, completing before the next cell, and running once for duplicate notifications. Protocol tests reject forged/stale acknowledgements and retire on timeout. The recovered hook runner is best-effort: it swallows handler errors and races individual timeouts without cancelling the underlying handler. A turn_ended_result is an acknowledgement of the runner, not proof that every side effect succeeded or all late background work stopped. Background lifecycle remains incomplete. No default-demo replacement or Chrome/App acceptance is claimed.

### 2026-11-05: host request correlation and unfinished completion

WorkerSession now tracks active and previously seen host request IDs separately per worker side and execution. Reusing a request ID, even after its first response, retires the session without replaying host side effects. An exec_result or turn_ended_result received with unfinished host requests rejects with explicit unknown outcome, aborts host signals, retires workers and discards eventual late replies. This is an independent fail-closed policy; it cannot undo host effects or force cancellation of a callback ignoring AbortSignal, and it does not implement the full original background-operation lifecycle.

Seventeen runtime tests pass. Actual restored workers emit an unawaited tracked image and wait for the asynchronous host acknowledgement before completing. The test callback acknowledges a data URL only; it does not implement media decoding or MCP image delivery. Protocol tests cover duplicate pending/completed IDs and premature completion for both cell and turn lifecycle, with aborted signals and no late response delivery. Default demo, daily Chrome connection and original search acceptance are unchanged.


## MCP adapter

`@core/runtime-supervisor/mcp` exports createSupervisorMcpServer(SessionOptions), returning `{ server, session, close }`. Connect the SDK Server to a caller-owned MCP transport and await the returned close method for worker cleanup. It reuses @modelcontextprotocol/sdk 1.32.2 and zod 4.6.7; no custom JSON-RPC engine. Native ESM uses the SDK's extensionless /server export; its wildcard types.js subpath requires the published .js suffix. Local and @core imports remain extensionless.

The adapter advertises all four observed js/js_reset/js_add_node_module_dir/turn_ended schemas, strictly validates arguments, forwards protocol _meta rather than model arguments, maps cancellation to worker retirement, and routes form elicitation through the actual MCP client with its advertised capabilities. No implicit approval is generated. Standard MCP content is validated; unknown opaque worker content errors rather than disappearing. Host operations other than elicitation, media and native pipes require the injected hostRequest callback, so authenticated-fetch and other host integrations remain required. Native pipes use their separate generation-scoped factory.

js_add_node_module_dir requires an injected authorizeModuleDirectory policy and otherwise explicitly fails. No standalone production launch command or default demo switch is added. The host still must provide production OS isolation, exact environments, complete descendant cleanup and policy.

Nineteen runtime tests pass after reconstruction build. A real SDK Client over the SDK InMemoryTransport drives actual restored sandbox-exec workers (test-only network-deny profile), testing persisted variables, protocol metadata, accept/decline elicitation, cancellation followed by fresh generation, reset and close. This verifies protocol handlers but is not stdio transport, production sandbox, DeepSeek or browser acceptance. Compiled package import and close also pass under Node ESM. Tests must run after, not concurrently with, reconstruction build because that build replaces worker artifacts.


## Additional package directories

WorkerSession.addNodeModuleDirectory serializes with execution, requires an absolute existing canonical node_modules directory and a host authorizeModuleDirectory callback. It sends the recovered kernel's add_node_module_dir notification for live workers and retains/replays approved directories before the first cell of later generations (including reset/timeout recovery). Duplicate canonical paths do not send duplicate notifications. Policy completion after reset/close or cancellation cannot mutate the current registration set.

The recovered kernel sends no acknowledgement for this notification. Tool success means host validation/policy and ordered delivery or recording completed; it is not proof that every package imports successfully. Actual import is verified separately. Canonicalization is not an OS access boundary or immutable inode pin: the launcher must enforce filesystem/package access, symlink replacement and code trust. Registration does not expand the trusted-worker service allowlist or implicitly alter OS sandbox permissions.

Twenty-one runtime tests and reconstruction build pass. Actual MCP/client/restored-kernel integration first fails to import a fixture package outside cwd search roots, registers its directory, successfully imports value 137, resets, then imports it again. Other tests cover missing/denying host policy, invalid relative path, deduplication before first launch and policy completion after reset. This is independent supervisor glue around recovered resolver behavior; production sandbox and UI acceptance remain outstanding.


## Generation-scoped Unix native pipes

Inspection of recovered native_pipe_bridge.ts found that native_pipe_request has no exec_id and connections/events survive individual cells. WorkerSession now routes this protocol separately from execution-scoped host requests, only from the trusted worker. An optional nativePipeHost factory creates a transport per worker pair; asynchronous events are forwarded even between cells. Reset/timeout/close retires sockets with the workers, and callbacks or responses from retired generations are discarded. Repeated request IDs are rejected without replay. This does not automatically authorize any endpoint.

@core/runtime-supervisor/native-pipe-host provides UnixNativePipeHost using Node net (no custom socket library). It accepts an explicit host-supplied absolute-path allowlist, at most 64 connections, a 5-second connect timeout, 256 KiB decoded writes, 1 MiB socket write queue, 64 KiB inbound event chunks, and awaited socket destruction. Invalid/oversized individual payloads are rejected without touching the socket; write queue overflow terminates that connection. The allowlist does not authenticate peer identity or pin socket inode identity; production hosts must provide endpoint ownership/authentication policy. No attempt is made to connect to or bypass authentication of the installed vendor service.

Twenty-three runtime tests, reconstruction build and compiled package import pass. Actual MCP→restored trusted worker→host Unix socket tests connect to an owned echo fixture, write/read across cells, receive unsolicited data while idle and observe peer closure on cancellation retirement. Additional tests cover denied endpoints, malformed/oversized writes, close and generation-stale callbacks. An initial oversized-input test exposed that oversized payload rejection closed the socket, then its later write hit EPIPE; individual payload rejection was separated from queue-overflow termination and the full suite passed. This is raw transport acceptance, not native service protocol/authentication, production sandbox or browser/App acceptance.


## Media returned through MCP

The MCP adapter now accepts correlated emit_image/emit_audio requests, decodes only data: URLs through Node's built-in decoder (base64 and percent bytes), and returns standard MCP image/audio blocks. No network URL or supervisor-side file read is permitted by this handler; file image normalization remains the recovered worker's responsibility within its sandbox. MIME top-level category must match the operation. Limits are 8 MiB input URL, 6 MiB decoded payload, and 64 host content items / 16 MiB serialized host content per execution. These are independent host resource policies, not recovered Rust constants.

WorkerSession HostContext.appendContent snapshots validated host content into its current execution only. Late appends after reset/retirement fail. A normal worker result (including JS errors) carries accepted content to MCP; a supervisor timeout/retirement still rejects the execution and does not return partial media. Text aggregation and worker content precede host media in this adapter; original interleaved rendering order/metadata parity is not established. Header/MIME checks are envelope validation, not image/audio codec decoding or playback validation.

Twenty-five runtime tests and reconstruction build pass. Real MCP/restored-worker tests return exact PNG bytes, a small audio byte fixture, preserve trusted-service media when subsequent JS throws, reject wrong MIME and verify no content leaks to the next cell. Unit tests cover percent-encoded binary, non-data URLs, invalid base64, empty/oversized media and late host appends. No real browser screenshot, native App capture, audio playback or default-demo replacement is claimed.


## Response metadata

Trusted response_meta messages now require the current execution ID and an outstanding trusted RPC (or current turn-ended operation). Object payloads are shallow-merged with later top-level keys winning, JSON-snapshotted and bounded to 8 MiB. Kernel-origin, stale or malformed metadata retires the session. Normal results use the supervisor's accumulated metadata, overriding any result-supplied response_meta; MCP returns it in _meta, separately from content and request metadata. Each cell starts with no accumulated response metadata. Metadata is output, not an authorization decision.

Recovered privileged_runtime.setResponseMeta performs shallow merging in a worker execution context. Browser response_metadata supplies browser/toolSurface/screenshot fields, and Sky supplies app toolSurface data; preserving this channel matters beyond plain text. Cross-RPC shallow merging and the 8 MiB limit are independently authored supervisor policies, not established Rust parity. Trace messages/telemetry are still not integrated.

Twenty-six runtime tests and reconstruction build pass. Actual MCP/restored-worker integration verifies two metadata-emitting RPCs, retained top-level fields, replacement of a nested object and no leakage to the next cell. Protocol tests reject kernel forgery, stale IDs and array payloads. This proves metadata transport with fixtures, not real browser toolSurface capture or UI rendering.


## External stdio transport

@core/runtime-supervisor/stdio exports serveSupervisorStdio(SessionOptions, io?). It connects the existing SDK StdioServerTransport (16 MiB input buffer) to the independent MCP adapter and returns `{close, closed}`. The caller must provide its worker launcher/services/policies; this function does not invent a sandbox or inherit a credential-bearing environment. A host entry can await serveSupervisorStdio(options), then await its closed promise. stdout is reserved for MCP; optional onError diagnostics are caller-owned.

EOF/input close, input/output stream errors, and SIGINT/SIGTERM initiate idempotent cleanup. Signal handling can be disabled for an embedded host. Teardown waits for runtime/worker cleanup, removes installed listeners, and exposes failure through close/closed. Diagnostics throwing cannot interrupt cleanup. Forced SIGKILL/crash recovery is not guaranteed, and an unresponsive injected launcher/host can still prevent shutdown; production watchdog/process containment remains required.

Twenty-eight runtime tests and reconstruction build pass. An actual external SDK StdioClientTransport launches the compiled supervisor host in a child process, then launches recovered workers under a test-only network-deny profile. Persistent 40→42 execution succeeds. Separate EOF and SIGTERM cases verify a post-cleanup marker and ESRCH for both owned worker PIDs. This proves stdio transport and these graceful shutdown paths, not production isolation, active-operation signal coverage, DeepSeek/Chrome/App acceptance or default-demo replacement. The initial fixture omitted required NODE_REPL_TRUSTED_SERVICES; supplying the explicit empty map fixed worker startup, without changing recovered code.


## Background authenticated-fetch lifetime

Recovered privileged_host_operations.ts deliberately excludes nodeRepl.fetch from the execution drain set and uses the asynchronous execution context. The earlier generic unfinished-host check was therefore too strict for this operation. Trusted authenticated_fetch now has separate generation-scoped BackgroundHostRequests routing. Requests started during or after an eligible registered trusted execution retain that execution's request metadata, can settle between/later cells, and are not aborted merely because a cell ends. Reset/timeout/close aborts the generation signal and suppresses stale replies. Fetch cannot append content to a different/current cell.

The injected hostRequest still supplies endpoint policy, credentials and actual transport; there is no default network fetch or fabricated authenticated response. No kernel-origin privileged request is allowed. Independent resource limits retain 256 execution contexts for late starts, at most 64 concurrent background calls and 1024 unique request IDs per retained context. Already running calls may settle after their history entry expires; new late starts for expired contexts fail explicitly. Metadata is snapshotted and cloned for callbacks. Hosts must honor AbortSignal and apply their own network timeout/body/credential policy; ignoring cancellation cannot be forcibly undone by this router. Original Rust background retention and turn-close policy parity remains unproven.

Thirty runtime tests and reconstruction build pass. A real MCP/restored trusted worker starts a delayed HTTP request to an explicitly authorized local fixture through the injected host; the cell and a later cell finish before the HTTP response is released, then a subsequent RPC receives the body. Reset aborts another request and the server observes closure. Unit tests cover expired-context late starts, in-flight completion after history eviction, duplicate IDs and retired-generation response suppression. This validates routing/lifetime, not vendor authentication, site-status service replacement or production endpoint policy. Default demo and UI acceptance remain unchanged.


## Experimental macOS sandbox bootstrap

sandbox-bootstrap.ts loads the independently authored N-API bridge, applies an explicit host profile, removes bootstrap configuration from process.env and only then imports the configured worker. See native/macos-sandbox/README.md for build, OS test evidence and material limits. npm run test:sandbox passes two explicit integration tests, including actual recovered workers and denied outside-file/process/network probes. This is not yet a production launcher: policy construction/validation and startup environment scrubbing must be integrated before default use. The underlying Apple SDK API is deprecated/unsupported. No default demo switch is made.

### Validated launcher configuration

`@core/runtime-supervisor/sandbox-launcher` now provides `sandboxedWorkerSpec` and `launchSandboxedWorker`. The caller supplies existing absolute executable/bootstrap/addon/entry paths, dedicated writable directory and explicit read directories. Paths are canonicalized, filesystem-root grants and overlapping writable/code roots are rejected. Only enumerated restored worker/service, module-resolution and CUA surface configuration keys are accepted; the exact child environment contains these plus isolated HOME/TMPDIR and bootstrap settings, never ambient NODE_OPTIONS, DYLD_* or credentials. Flags before bootstrap are fixed by the launcher.

The actual restored-worker sandbox integration uses this entry and passes, including kernel denial of a trusted-worker scratch sentinel. Configuration tests reject NODE_OPTIONS, broad root and overlapping grants. Type checking passes. This closes the initial configuration construction gap, not the full production policy: caller-selected read roots can still be overly broad, trusted files/directories must not be concurrently replaced, environment values and trusted-service mappings remain caller-owned, and real browser/App service integration and cross-version sandbox reliability remain unverified. Default demo is unchanged.

### Real CUA/browser initialization under the launcher

The explicit OS integration now stages the restored @core/cua and @core/browser-desktop packages with their actual transitive dependencies. The sandboxed trusted worker completes browser setup with a real API manifest; the kernel imports @core/cua/tinyskyAlt and exposes getTab/createBrowserTab after the real initialization RPC and documentation emission. No mock browser service or permissive sandbox fallback is used for these assertions. The small fixture service remains a separate isolation/routing assertion.

Module search directories and CUA surface environment keys are now explicitly accepted by the launcher; ambient environment is still not inherited. This proves real module/dependency/service startup, not a connected browser, tab selection, screenshot, click or DeepSeek completion. Native-pipe endpoint wiring and real browser action acceptance remain required before replacing the default supervisor.

### Authenticated native-host discovery integration

The explicit OS test now runs the packaged @core/native-host/browserService inside the sandboxed trusted worker. Its private endpoint descriptor directory is readable only by that worker; kernel reads fail EPERM. NativePipe requests travel through WorkerSession and UnixNativePipeHost, restricted to the fixture's socket, and complete the real @core capability-token handshake. Browser discovery returns the fixture browser and bidirectional ping succeeds. The extension peer supplies controlled getInfo/empty-tab data; this is not an installed Chrome or a real page test.

Discovery also requires host configuration reads for the full-CDP preference. The fixture supplies explicit read-only test preferences with full CDP disabled; unsupported writes and other operations fail. This callback is test-only, not a production config implementation or permission bypass. Startup allowlisting now includes explicit independent endpoint/backend settings, supplied to the trusted worker only in this integration. Canonical endpoint paths are required: a /var alias failed metadata access under the canonical-only policy, and long macOS temp paths exceeded Unix-socket limits; the fixture uses a short canonical private directory without broadening sandbox grants. Real host configuration, Chrome connection and UI actions remain outstanding.

### Explicit read-only configuration host

`@core/runtime-supervisor/config-host` exports createReadonlyConfigHost. It reads caller-specified TOML files for the config snapshot, enterprise requirements and exact logical readToml paths, using existing third-party smol-toml 1.5.2. No home-directory discovery, implicit empty config or permissive policy fallback occurs. Config cwd must be explicitly listed; layered reads and all writes fail. Each call rereads its source (the recovered browser bridge retains its own cache). Files are bounded to 1 MiB, opened without following the final symlink and checked as regular files; invalid UTF-8/TOML and non-JSON values fail with redacted diagnostics. Parent directories must remain trusted: this does not pin ancestry or implement atomic multi-file snapshots.

The sandboxed browser discovery integration now uses this adapter against explicit fixture TOML files, including featureRequirements.browser_use_full_cdp_access=false, instead of canned host responses. Production deployments must supply appropriate scoped files; passing a general secret-bearing config would expose its parsed contents to trusted services. Session preference writes/persistent approval, workspace layering, schema/version parity with Rust and a full production launcher remain unfinished. No user config files were read or changed by these tests.

### Composed sandboxed MCP entry

`@core/runtime-supervisor/sandbox-runtime` exposes `createSandboxedSessionOptions(options)` and `serveSandboxedStdio(options, io?)`. Options explicitly provide kernel/trusted SandboxedWorkerOptions, service names, allowed Unix pipe paths and read-only config sources. The composition validates both worker policies before spawning either, rejects overlapping writable directories and read grants exposing the peer's scratch, keeps endpoint settings out of the kernel environment, and requires the supervisor service names to match the trusted service map. A failed second spawn closes the first worker. Both workers receive exact captured environments; the installed Rust supervisor is not involved.

```ts
import { serveSandboxedStdio } from '@core/runtime-supervisor/sandbox-runtime';
const server = await serveSandboxedStdio(runtimeOptions);
await server.closed;
```

The caller must stage immutable code/dependencies, create private scratch/config files, supply deliberate path policies and retain those resources until `closed`. This entry does not auto-select endpoints, inherit user config, supply network authentication, implement configuration writes, or grant extra module roots. Media and MCP form elicitation continue through the existing adapter. Read-path breadth/replacement races and deprecated macOS sandbox portability remain deployment responsibilities/gaps.

The explicit OS gate now also launches this compiled entry as a separate process with the standard MCP SDK StdioClientTransport. An MCP js call imports real CUA and discovers the authenticated controlled extension peer through the sandboxed workers, config host and native-pipe bridge. Invalid service maps and cross-worker directory grants are rejected. This validates the composed MCP path with a fixture peer, not daily Chrome/page actions or DeepSeek acceptance. Default demo remains on the installed supervisor.

### Opt-in preference persistence

`createPersistentConfigHost(sources, writablePaths)` in `./persistent-config-host` adds write_toml only for explicitly mapped, existing preference files. `serveSandboxedStdio` / `createSandboxedSessionOptions` opt in via writablePreferencePaths; omission preserves read-only behavior. Main config and enterprise requirements cannot be registered as writable targets, including hardlink aliases. Writes require a private current-user-owned parent directory, reject symlink/hardlink targets and invalid existing TOML, serialize per destination within the adapter, stage a 0600 exclusive temporary file, sync its content and atomically rename. JSON-compatible values are serialized with existing smol-toml. No write_config_value/batch_write_config support or implicit session-file creation is provided.

Cancellation is checked before queued work and before rename; already issued renames may commit despite later cancellation. This is not an inter-process transaction/compare-and-swap or power-loss durability guarantee (no parent-directory fsync). Caller must own stable private directory ancestry and coordinate external writers; whole-table writes intentionally replace previous contents and formatting/comments. The adapter persists what an authorized trusted service submits; it does not itself prompt, decide permission, or grant full CDP. Existing browser elicitation/policy remains responsible for that decision.

Unit tests cover restart reads, queued write order, mode, cancelled writes, protected targets, corrupt/symlink/hardlink rejection and temp cleanup. The full sandbox gate additionally executes recovered trusted-worker nodeRepl.config.writeToml over supervisor RPC and verifies the actual preference file; browser discovery remains functional with full CDP disabled. These are controlled fixtures, not real permission-prompt acceptance or default demo replacement.

## Real browser actions under the independent sandbox runtime

`npm run test:sandbox` now includes `runtime-cdp-sandbox.test.ts`. It launches the
independent MCP server with system Node, restored kernel/trusted workers in
separate OS sandboxes, and a real Chromium CDP provider. The fixture grants only
its exact localhost origin via MCP elicitation; no external-site approval or
site-status response is fabricated. It verifies an actual form submission at
the HTTP server, returned DOM content, and a screenshot image. Dedicated global
and session preference files are explicitly mapped; no implicit policy fallback
is introduced.

This acceptance found and fixed three integration defects:

- CDP host directories now use canonical paths before generating endpoint
  descriptors, avoiding macOS `/tmp` versus `/private/tmp` sandbox mismatches.
- Independent native-pipe writes now accommodate the browser protocol's full
  1 MiB payload plus four-byte frame header, rather than rejecting the roughly
  315 KB initialization script. Single writes and queued bytes remain bounded;
  oversize input is rejected. Base64 validation handles the larger bounded input.
- MCP conversion now forwards the restored kernel's `named_outputs` text. CUA
  emits documentation and page state through these named outputs; dropping them
  silently made successful observations appear empty. Malformed output fails.

Eight relevant integration/regression cases pass, plus supervisor/CDP typechecks
and reconstruction build. This verifies localhost browser operations, not full
external-site authentication, default demo replacement, or desktop/App control.
The original deprecated macOS sandbox API and deployment constraints remain.
