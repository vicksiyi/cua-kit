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
