# Native runtime supervisor migration

The installed `node_repl` contains Rust compiler paths and module literals such as
`src/native_pipe.rs`, `src/repl_manager.rs`, `src/mcp_server.rs` and
`src/trusted_process.rs`. Reproduce the inventory with
`python3 scripts/audit-native-language.py`; the checked-in evidence records the
exact binary hash. It establishes native language/boundaries, not source bodies.

Original JavaScript still becomes readable TypeScript. This Rust crate migrates
responsibilities previously implemented in `packages/runtime-supervisor`, not
NodeREPL's original JavaScript workers. It is independently implemented Rust,
not decompiled Rust source. The TypeScript supervisor is a temporary acceptance
baseline, and has not yet been removed or replaced in the demo.

First implemented module: `native_pipe.rs`, implementing the recovered worker's
connect/write/close fields and base64 data/close event shapes. Tokio, base64,
serde_json and uuid are reused; these direct dependency versions are visible in
the installed binary's registry paths. Cargo.lock pins the resolved graph;
transitive versions/features are not claimed to match the unavailable original
Cargo.lock. Native host authorization remains explicit endpoint allowlisting.

Run `cargo test --manifest-path native/runtime-supervisor/Cargo.toml`.
Tests use actual Unix sockets, payloads larger than 256 KiB, ordered data followed
by close, invalid base64, oversized writes, and disallowed paths. They do not yet
prove trusted JS-worker integration, request cancellation, or full supervisor
parity. The bounded event receiver must be drained concurrently with requests.

Remaining migration: worker transport/launch/sandbox, session routing and reset,
active execution/timeouts/cancellation, native pipe request dispatch, config and
host callbacks, MCP/elicitation/media, then differential and full-browser tests.
Do not switch the default or remove the TS baseline until these gates pass.

## Worker process migration

`process_port.rs` now owns POSIX process-group launch/retirement, an exact child
environment, bounded UTF-8 JSONL frames and startup output, and normal final-frame
delivery. It reaps exited leaders during Darwin's transient zombie-group EPERM
window; persistent signal errors remain errors. This transport is not an OS
sandbox and must be combined with the native sandbox launcher before deployment.

After building the reconstructed JS workers, run:

```sh
CUA_TEST_NODE="$(command -v node)" cargo test --locked --manifest-path native/runtime-supervisor/Cargo.toml
```

Five process integration tests exercise actual Node child processes, ordinary
owned descendants, invalid/truncated/oversized frames and startup overflow,
spawn failure, environment isolation, and the actual reconstructed kernel's
persistent bindings (42 then 43). Three pipe tests also pass. The process suite
was repeated to check an observed exit/reap race. The native crate still lacks
full session routing, MCP and sandbox composition; it has not replaced the TS
supervisor in the demo. A cancelled write/session must retire its worker before
reuse; that orchestration remains part of the pending session migration.

## Dual-worker session migration

`repl_manager.rs` now launches both real reconstructed workers and routes
execution, configured service RPC/hooks, host-supplied request metadata and
nested timeout suspension. Reset, execution timeout, explicit cancellation and
a dropped caller future retire worker state before reuse. Native-pipe requests
and byte/close events now traverse Rust through the recovered trusted worker;
an integration test verifies a 315,000-byte socket roundtrip and endpoint denial.

Four dual-worker integration tests pass in addition to the eight transport tests.
They are controlled local fixtures, not browser/MCP or OS sandbox acceptance.
Unsupported host operations fail explicitly and discard the session. Remaining:
media/elicitation/config/authenticated fetch, turn-ended lifecycle and metadata,
module-directory registration, continuous between-cell background event handling,
MCP, sandbox composition and broader source/differential acceptance. The demo
still uses the prior installed/TS paths; this Rust library is not a finished
replacement. Services/pipe endpoints remain caller-selected explicit allowlists.

## Turn-ended lifecycle migration

The Rust manager now implements the host-only `turn_ended` message. It validates
the three event fields, dispatches to the trusted worker, checks result identity,
supports nested timeout suspension and merges bounded response metadata. Successful
(session_id, turn_id) pairs are deduplicated across reset, matching the current
supervisor contract; failed attempts are not cached. Kernel traffic during this
lifecycle operation is rejected rather than treated as a new user execution.

Two additional real-worker tests cover callback event/request metadata, response
metadata merging, repeated delivery, reset scope, malformed events and timeout
followed by a successful retry. All fourteen Rust tests pass. This closes the
basic turn-ended/metadata gap, not the outstanding approval/media/config, module
registration, continuous background routing, MCP or sandbox-composition gaps.

## Explicit host callback routing

`host.rs` defines execution-scoped host requests/replies. The manager accepts an
explicit handler and independent form-elicitation capability flag; neither is
implicitly enabled. Kernel media and trusted media/elicitation/config/launch
requests are correlated by execution, side and request identity. Concurrent host
futures allow timeout-suspension/control messages to continue flowing. Retirement
aborts callback futures; adapter implementations must propagate cancellation and
must not detach their own side-effect work.

Host content is bounded to 64 items / 16 MiB and appended only after the associated
callback completes. Correlation IDs are host-controlled on return. Host errors
become failed worker replies; absent handlers/capabilities do not auto-approve.
Actual TOML policy, media validation/encoding and MCP elicitation adapters are
still separate pending implementations, not supplied by this generic interface.

Three real-worker tests cover delayed refusal under suspended timeout, config
reply transport, unawaited media completion with host-added fixture content,
missing capabilities/handler rejection, host metadata identity and cancellation
that drops a pending callback and discards cell state. All seventeen Rust tests
pass. The media case is a fixture callback receipt, not image decoder or screenshot
acceptance. Authenticated fetch and between-cell background routing remain open.

## Actual Rust configuration storage

`config_manager.rs` implements explicit-source `read_config`, requirements,
logical `read_toml` and opt-in `write_toml`. It reuses `toml` 0.9.11 (the version
visible in original binary dependency paths). Configuration/requirements are
protected; preference targets require explicit mapping and private owned parent
directories. Same canonical target aliases share a serialization lock. Reads are
bounded and parser errors omit source text. Nonfinite values and TOML datetimes
are rejected by the current JSON-only deployment adapter rather than silently
coerced to null or reinterpreted.

Writes validate existing data, use a private same-directory temporary file and
rename relative to an open directory descriptor. A precommit cancellation point
cleans the temp file. Cancellation after atomic commit cannot promise rollback.
This is the independent deployment adapter migrated from TS; original Codex
layered/user configuration resolution is still not reconstructed. Callers must
provide explicit canonical working-directory scopes, including on macOS /tmp.

Three storage tests validate disk contents, protected paths, invalid/private
source handling, link rejection and precommit cancellation. A fourth real-worker
test invokes restored config APIs through Rust and verifies the resulting TOML
on disk. All twenty-one Rust tests pass. Filesystem access itself is bounded
synchronous host I/O under an async per-target lock; deployment must keep these
host operations out of untrusted workers. The demo composition is still pending.

## Real media envelope processing and host composition

`media.rs` decodes bounded image/audio data URLs to base64 MCP content. It uses
observed `url` 2.5.8, `percent-encoding` 2.3.2 and `base64` 0.22.1 crates. It never
fetches HTTP/file URLs. Type/MIME matching and size limits are enforced; this is
an envelope decoder, not image/audio codec validation, transcoding or capture.

`deployment_host.rs` composes actual configuration storage and media processing.
Other operations remain explicit errors until their adapters are supplied; it
provides no automatic approval or authenticated HTTP authority.

Twenty-four data-URL cases are compared against the existing TS adapter/Node
implementation, including forgiving base64 padding, percent bytes, query versus
fragment handling and the space before `base64` flag. That comparison found two
initial parser mismatches, now fixed. It establishes migration compatibility for
that corpus, not complete equivalence with unavailable native source. Additional
limits/type tests and actual kernel image/audio emission return encoded content
through the deployment handler. Those payloads are protocol fixtures, not real
screenshots/recordings. All twenty-three Rust tests pass. The host composition
is still a library; MCP/sandbox integration and background routing remain open.

## Rust MCP integration

`mcp_server.rs` uses rmcp 1.5.0, the SDK/version evidenced in the original binary.
The four tool definitions come from the versioned observed protocol snapshot.
Arguments are validated; output preserves named text, media and response metadata.
Elicitation is sent to an MCP client only when it advertises form support, and
its decision is returned unchanged. Cancellation retires cell state. Explicitly
allowed module directories can be registered and are replayed after reset.

Build/run the integration harness (not the production demo default):

```sh
cargo build --locked --manifest-path native/runtime-supervisor/Cargo.toml --example mcp_stdio
node --import tsx --test reconstruction/rust-supervisor-mcp.test.ts
```

The external TypeScript MCP client exercises persistent cells, named outputs,
module registration/reset replay, invalid args and unapproved module rejection,
request/response metadata, actual elicitation refusal, image output, turn-ended
deduplication, execution timeout and cancellation after a worker start marker.
Two cases verify EOF and SIGTERM teardown; SIGTERM is sent while a trusted RPC
is pending and both recorded worker PIDs must be gone when the client closes.
The test launches workers inside an explicit network-deny sandbox-exec fixture.
This is not the full native sandbox policy or browser/App acceptance.

The harness takes a private caller-provided JSON worker specification and does
not construct production sandbox grants. SIGTERM first cancels active execution
and cleans workers, then closes MCP. After awaited cleanup it shuts down Tokio
without waiting indefinitely for rmcp's blocking stdin reader. The default demo
is still unchanged. Native sandbox composition and continuous between-cell
routing remain required. Current validation: 23 Rust tests plus 2 external MCP
integration cases, with no installed supervisor used on this harness path.

## Rust supervisor: between-call native pipe routing

The Rust MCP owner now drains worker/native-pipe events between tool calls.
Incoming calls wake the observation wait; an in-progress transport write finishes
before the next caller takes the session lock. Shutdown cancels and retires the
pair. An idle routing error resets the pair rather than reusing partial state.
The 30-second background dispatch bound and one-second idle observation bound
are independent adapter policies, not recovered vendor constants.

The external MCP fixture now connects a real Unix socket through the restored
trusted worker, returns from the initiating tool call, sends a peer message and
receives the worker's reply without issuing another MCP call. Reset closes the
old socket. Both EOF and SIGTERM cases pass, retaining cancellation and owned
worker cleanup checks. The workers remain network-denied; Rust owns the allowed
socket transport. This proves idle pipe delivery, not full browser acceptance or
authenticated-fetch background routing. Production sandbox composition and
replacement of the transitional TS supervisor remain open.

## Rust authenticated-fetch routing (2026-11-06)

Re-extracted the current installed supervisor's embedded JS into a local temporary
directory and confirmed `privileged-node-repl.js` emits authenticated_fetch with
id, exec_id and request (method/url/header pairs/optional base64 body), then waits
for the correlated response. This verifies the JS boundary, not native source.

`background_host.rs` now retains originating host metadata and callback per
execution, authorizes a context only after trusted dispatch (or host lifecycle),
rejects duplicate request identities, routes callback completion during active
execution or between cells, and cancels/awaits callbacks on pair reset. Background
callbacks cannot append MCP content. Context/task/request limits reproduce the
independent TS adapter's bounds, not proven original Rust constants. No HTTP
client, ambient credential lookup or approval bypass is introduced: the explicit
host callback still owns authentication, endpoint and redirect policy.

27 Rust tests and the 2 external MCP tests pass. New real restored-worker cases
cover allowed/denied fetch and a timer-triggered fetch after the initiating cell
returns and a later cell runs; idle routing writes the expected response while
retaining the original metadata. Unit cases cover replay rejection and cancellation
of an in-flight callback. These fixture responses are not live authenticated HTTP
acceptance. Production host authentication composition and Rust sandbox/launcher
integration are still outstanding; the default demo entry point is unchanged.
