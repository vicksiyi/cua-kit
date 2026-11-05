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
