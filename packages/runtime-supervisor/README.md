# @core/runtime-supervisor

Independently authored replacement work under approved route A. This package currently implements a worker-session core, not a production MCP server or a restored Rust implementation. The demo still uses the installed supervisor; no automatic fallback or change to existing policy occurs.

WorkerSession owns serialized execution, persistent worker-pair reuse, execution/RPC correlation, explicit service allowlisting, host-provided request metadata, form-elicitation forwarding, reset, timeout and cancellation retirement. Reset retires both workers before another generation can launch. Kernel messages cannot directly invoke privileged host operations. Host requests require an injected callback and are rejected when absent; stale replies after reset are discarded. A host AbortSignal is cancelled on execution end/retirement. There is no fabricated authentication, site-status response or approval decision.

WorkerPort and launch are mandatory host boundaries: the deployer must provide OS isolation, separate trusted/untrusted environments, complete descendant-process termination and error propagation. The session core does not grant these guarantees by itself.

Still required: production process launcher/sandbox, production MCP launch integration, native pipes with asynchronous data/closure events, authenticated fetch, configuration and launch-services policy, image/audio result handling, response metadata/telemetry, late background-operation lifecycle. Do not wire this incomplete module into the default demo until these boundaries are implemented and verified.

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

The adapter advertises all four observed js/js_reset/js_add_node_module_dir/turn_ended schemas, strictly validates arguments, forwards protocol _meta rather than model arguments, maps cancellation to worker retirement, and routes form elicitation through the actual MCP client with its advertised capabilities. No implicit approval is generated. Standard MCP content is validated; unknown opaque worker content errors rather than disappearing. Host operations other than elicitation require the injected hostRequest callback, so this is not yet a media/native-pipe/authenticated-fetch host implementation.

js_add_node_module_dir requires an injected authorizeModuleDirectory policy and otherwise explicitly fails. No standalone production launch command or default demo switch is added. The host still must provide production OS isolation, exact environments, complete descendant cleanup and policy.

Nineteen runtime tests pass after reconstruction build. A real SDK Client over the SDK InMemoryTransport drives actual restored sandbox-exec workers (test-only network-deny profile), testing persisted variables, protocol metadata, accept/decline elicitation, cancellation followed by fresh generation, reset and close. This verifies protocol handlers but is not stdio transport, production sandbox, DeepSeek or browser acceptance. Compiled package import and close also pass under Node ESM. Tests must run after, not concurrently with, reconstruction build because that build replaces worker artifacts.


## Additional package directories

WorkerSession.addNodeModuleDirectory serializes with execution, requires an absolute existing canonical node_modules directory and a host authorizeModuleDirectory callback. It sends the recovered kernel's add_node_module_dir notification for live workers and retains/replays approved directories before the first cell of later generations (including reset/timeout recovery). Duplicate canonical paths do not send duplicate notifications. Policy completion after reset/close or cancellation cannot mutate the current registration set.

The recovered kernel sends no acknowledgement for this notification. Tool success means host validation/policy and ordered delivery or recording completed; it is not proof that every package imports successfully. Actual import is verified separately. Canonicalization is not an OS access boundary or immutable inode pin: the launcher must enforce filesystem/package access, symlink replacement and code trust. Registration does not expand the trusted-worker service allowlist or implicitly alter OS sandbox permissions.

Twenty-one runtime tests and reconstruction build pass. Actual MCP/client/restored-kernel integration first fails to import a fixture package outside cwd search roots, registers its directory, successfully imports value 137, resets, then imports it again. Other tests cover missing/denying host policy, invalid relative path, deduplication before first launch and policy completion after reset. This is independent supervisor glue around recovered resolver behavior; production sandbox and UI acceptance remain outstanding.
