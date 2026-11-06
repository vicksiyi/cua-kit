# Native runtime supervisor migration

The installed `node_repl` contains Rust compiler paths and module literals such as
`src/native_pipe.rs`, `src/repl_manager.rs`, `src/mcp_server.rs` and
`src/trusted_process.rs`. Reproduce the inventory with
`python3 scripts/audit-native-language.py`; the checked-in evidence records the
exact binary hash. It establishes native language/boundaries, not source bodies.

Original JavaScript still becomes readable TypeScript. This Rust crate migrates
responsibilities previously implemented in `packages/runtime-supervisor`, not
NodeREPL's original JavaScript workers. It is independently implemented Rust,
not decompiled Rust source. The Rust supervisor is selected by the independent demo deployment. Legacy TS
comparison sources remain, but their package exports now require explicit /legacy
paths. The CDP sandbox acceptance test also always launches Rust. Remaining source
retirement and native behavior parity are incomplete.

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

## Rust-owned sandbox policy and MCP launch (2026-11-06)

`sandbox_launcher.rs` now constructs the exact child environment and explicit
Seatbelt read/scratch grants, validates absolute canonical paths and disjoint
writable/code roots, rejects loader environment overrides, and returns the Rust
ProcessSpec. The MCP harness accepts `{ "sandbox": { ... } }` worker specs so
this policy construction no longer depends on the TS launcher. Explicit raw
worker specs remain available to integration callers and are not sandbox claims.

29 Rust tests pass, including actual macOS scratch read/write success and EPERM
for outside-file reads, subprocess launch and loopback networking (zero accepted
connections). The two existing external MCP EOF/SIGTERM cases now use this
Rust-generated deny-default policy with separate kernel/trusted scratch roots,
not the earlier allow-default/network-deny fixture. They exercise actual restored
workers, modules, service RPC, elicitation, media, pipe events, reset/cancellation
and process retirement under the generated policy.

The post-initialization C/N-API bridge and TS bootstrap are still explicit
transitional dependencies. They have not been restored from original native
source or migrated by this change. Applying deny-default before Node's native
loader previously failed locally; this change preserves the verified ordering:
trusted Node initialization, apply policy, then import worker code. Original
embedded sandbox_state.rs paths establish Rust ownership but do not prove this
specific policy or ordering. Immutable code/scratch parents remain caller-owned;
path grants are canonicalized, not inode-pinned against concurrent replacement.

Remaining: native bridge/bootstrap ownership, production browser runtime assembly
and authenticated host composition, full browser/App acceptance, and removal of
the transitional TS path after entry-point migration. The default demo is unchanged.

## Rust sandbox bridge replaces C (2026-11-06)

The native Seatbelt bridge is now Rust (`native/macos-sandbox/src/lib.rs`), with
stable N-API exports and direct bindings to the existing macOS sandbox API. The
old C file is removed; `npm run build:sandbox` now builds the locked Rust crate
and stages the same sandbox.node path. This needs Cargo, not matching Node
headers. No new third-party implementation of Node or Seatbelt is introduced.

29 Rust supervisor tests, two sandboxed external MCP tests and two direct bridge
integration cases pass. Invalid policy/argument rejection and actual outside-file,
spawn and network denial were exercised with the Rust-produced binary. These are
local controlled fixtures. The loader bootstrap remains TS; production browser
composition and original policy/initialization-order fidelity remain outstanding.

## Rust supervisor browser entry (2026-11-06)

Build the native runtime with `npm run build:rust-runtime`, then select it with
`CUA_RUNTIME_SUPERVISOR=rust`. The existing default remains installed; the
`independent` option still selects the transitional TypeScript supervisor for
comparison. Rust mode writes a private explicit runtime spec and launches the
built native executable, preserving the same restored JS workers/package staging,
configured endpoints, host callbacks and Rust-owned sandbox policy. Runtime
assembly is still caller-side TS; this is not a claim of recovered native source.

The isolated real Chromium fixture now supports `CUA_TEST_RUST_RUNTIME=1`.
The Rust path passes fill/click/AX-read/screenshot with independently checked
server submission. With `CUA_LIVE_DEEPSEEK_TEST=1`, actual DeepSeek also passes the
same randomized task in five model decisions with zero tool errors and an image
result. The actual CLI `--cdp-browser --check-browser` succeeds with Rust selected
and an intentionally nonexistent installed-supervisor path. Agent-loop typecheck
passes. No daily Chrome, login profile or real desktop app was manipulated.

This verifies the controlled CDP deployment, not original Codex fallback policy.
Original-style extension and native App acceptance, source parity, production
credential composition, complete language audit and retirement of old TS native
implementations remain outstanding. Default selection is not switched yet.

## Rust extension-chain acceptance (2026-11-06)

The independent MCP browser fixture now explicitly selects installed, transitional
TS, or Rust supervisors; unknown selections fail rather than silently testing a
different runtime. Both native-messaging and full packaged extensions pass the
Rust path in temporary Chromium profiles. This exercises extension-started host
registration, endpoint discovery/authentication, actual browser tab notifications,
CUA navigation/click/read/screenshot and MCP lifecycle. It does not manipulate the
user's daily Chrome or establish missing-extension/cold-start UI acceptance.

The controlled page now generates a random action marker and its button reports
that marker to the local HTTP server. Live-model answers must contain the exact
random marker, and the server must independently observe the click. This avoids
relying on a fixed model answer or external Playwright page enumeration: newly
created session pages were not visible to that enumeration. The HTTP evidence remains available after AgentLoop performs endTurn cleanup. Two deterministic and two actual DeepSeek extension
cases pass. The latest live run recovered from two unsupported accessibility-input
calls by using the exposed Playwright API; it is not a zero-tool-error result.

`npm run test:rust-browser` builds the prerequisites and runs isolated CDP plus
both extension fixtures. Set CUA_LIVE_DEEPSEEK_TEST=1 for model-driven cases (uses
local .env and API quota). Native App, daily Chrome startup, production host
language provenance and full source-behavior parity remain separate open gates.

## Browser input capability guidance (2026-11-06)

Direct comparison with the installed `cua/.../tinysky_alt/bind_tab.js` confirms
that original top-level click/type wrappers remain present even when tab.ax is
absent; they reject accessibility input, while getAXState falls back to a DOM
snapshot. The restored implementation matches this behavior. Do not manufacture
numeric indices or add a fallback input implementation to hide the distinction.

Added caller-only BROWSER_INPUT_CONTEXT to the demo and browser model fixtures:
wrappers do not prove capability, DOM snapshot line order is not an AX index,
and absent AX requires documented Playwright input. Restored CUA APIs/docs and
native App input semantics are unchanged. Two original-source differential
browser binding tests and agent-loop typecheck pass. Both real DeepSeek extension
fixtures still pass randomized answer plus server-click verification; one tool
capability mistake still occurred and was recovered. Guidance is a mitigation,
not proof that the model will never choose the wrong API.

Also corrected the acceptance callback name to verifyEvidence. AgentLoop.run
itself calls endTurn before returning, so a callback after it cannot be called
before-turn-end verification. Persistent local HTTP click evidence remains valid
across that lifecycle; live browser-tab enumeration after run is not equivalent.

## Swift service using the original Sky wire contract (2026-11-06)

`SkyIPC.swift` adds an explicitly selected `--sky-socket <absolute path>` mode to
the independent Swift helper. It implements the observed four-byte little-endian
8 MiB-bounded JSON-RPC frames, CodexComputerUseIPC-5 ping/version exchange and
request envelope. It validates negotiation/deadline, rejects unknown operations,
and serves ComputerUseIPCListAppsRequest through NSWorkspace. No vendor service
is launched or impersonated. A private user-owned socket parent and same-user
peer are required. This is not the vendor's sender authentication/session policy.

Four live protocol cases pass: both the installed JS MacComputerUseClient and
restored TS client can ping/list apps; malformed ordering/version/deadline and
oversized frames fail; and actual restored CUA inventory traverses MCP, Rust's
sandboxed workers, the unchanged @core/sky/service, Rust native-pipe routing and
the Swift endpoint. Closing the Rust workers closes the connection, the owned
one-connection Swift process exits normally, and its socket is removed. App names
and machine inventory are not published in the acceptance report. 29 Rust tests,
28 adapter tests and the Swift text self-test also pass.

Run `npm run test:native-ipc` on this Mac to build prerequisites and enable these
otherwise skipped integration cases. The original-JS comparison requires the
installed ChatGPT app artifact. No model request, app launch, input, screenshot
or permission prompt is performed by this gate.

This is a protocol/ownership migration checkpoint, not full native App support.
Policy requests, app startup/state/action/audio dispatch and original formatting
still need native implementation; unsupported requests explicitly fail. The test
harness currently owns service launch. Production Rust service supervision,
launch-services integration, native sender/approval policy and replacing the old
TS helper-spawn adapter remain open. The default demo route is unchanged.


## Rust-owned Swift service lifecycle (2026-11-06)

The standalone Rust MCP configuration now accepts `native_service: {helper,
directory}`. Rust creates a private socket directory, starts the Swift helper,
awaits its readiness frame, injects the socket path into only the trusted worker
and adds that path to the native-pipe allowlist. `js_reset` and MCP shutdown retire
the workers and service and remove the owned directory; the next call starts a
fresh service. No test-side prelaunch is required. Foundation can normalize
/private/tmp to /tmp, so readiness compares canonical socket paths.

The four native IPC cases pass, including the installed original JS client. The
Rust-path case verifies three owned child PIDs, reset retirement, fresh replacement
PIDs and final cleanup. All 29 Rust regression tests also pass. This verifies app
inventory and lifecycle only: app policy/start/state/action dispatch, vendor sender
authentication and production launch-services integration remain open. The default
demo selection is unchanged. This is independent native reconstruction using
observed contracts, not recovery of unavailable original native function bodies.


## Native App policy dispatch (2026-11-06)

`ComputerUseIPCAppPolicyRequest` now dispatches to Swift `SkyAppPolicy`, resolving
an installed app name, bundle ID or path through the native LaunchServices adapter.
It returns the observed `decision`, `allowPersistentApproval` and target
`appPath/bundleIdentifier/displayName/risk/warningSubtitle` schema. Invalid app
references produce -10010; malformed request arguments produce -32602.

The source-derived policy boundary is preserved: native policy is evaluated first;
the restored Sky JS/TS `computer-use-policy` then performs MCP elicitation, rejects
decline/cancel, and substitutes the resolved app path before an operation. An
`allowed` policy is **not** approval. Denied/forbidden policies never elicit.

The original native policy database/default rules are unavailable. Standalone
rules are therefore explicit Rust-owned configuration, serialized to the Swift
service in CORE_CUA_APP_POLICY, not injected into the kernel or inferred from
model output. Example field inside `native_service`:

```json
{"app_policy":{"com.example.Target":{"decision":"allowed","risk":"high","allowPersistentApproval":false}}}
```

Supported decisions are allowed/denied/forbidden; risk is high/low; optional
warningSubtitle is preserved. Missing bundle IDs default to denied. This default
and storage mechanism are independent deployment choices, not claims about Codex
policy defaults. No vendor safety catalog, enterprise policy inheritance or sender
authentication has been reconstructed by this change.

Both the installed original JS client and the restored TS client pass native
policy tests for allowed/forbidden/unconfigured apps and invalid app paths. The
actual MCP/Rust/sandboxed-worker/Sky/Swift chain checks policy response metadata,
asks approval for an allowed fixture app, and verifies decline stops execution.
Forbidden/unconfigured fixtures fail before elicitation. Fixtures are temporary
.app metadata bundles: no application is launched and no UI permission requested.
The four IPC tests and 29 Rust regression tests pass. App start/skyshot/action
requests remain explicitly unsupported on this original-protocol service route.


## Cooperative native termination cleanup (2026-11-06)

Swift Sky service launch now uses runNativeService: SIGTERM/SIGINT cancel the
service task instead of bypassing native defers. Signal dispatch does not itself
mutate the clipboard. Cancellation propagates through async paste/input and lets
withNativeClipboard restore its lease before exit. Socket accept/read/write waits
poll cancellation; accepted sockets are nonblocking so a partial frame or stalled
peer does not indefinitely prevent cooperative shutdown. Normal EOF also keeps
existing socket cleanup. Rust permits a 2-second service termination grace before
its existing process-group kill fallback (worker grace remains unchanged).

Nine IPC/lifecycle cases pass. Two actual subprocess cases send SIGTERM/SIGINT
while a transaction owns a **named** pasteboard, then require restored-content
evidence and exit code 0 (not signal death). Three other cases interrupt accept,
partial header and partial body waits and require normal exit/socket removal.
The original/restored client cases and actual Rust-worker reset/restart/close case
also pass. Swift and Rust release builds pass. No general clipboard was changed.

These prove cooperative signal cleanup for the tested transaction and I/O states,
not a real app paste under cancellation, forced SIGKILL recovery, crash recovery,
or completion of unresponsive native APIs. The 2-second fallback can still kill
an uncooperative service before cleanup; that limitation is not hidden by the
successful signal tests. Native App UI acceptance and production demo migration
remain open. The timeout and signal strategy are independently implemented rather
than recovered original supervisor/native function bodies.


## Opt-in Rust/Swift demo runtime and write-backpressure acceptance (2026-11-06)

The shared demo runtime factory now supports explicit computer surfaces through
Rust + the Swift native service, keeping the original @core/sky/service. Set
CORE_CUA_NATIVE_BACKEND=swift and CUA_RUNTIME_SUPERVISOR=rust. The factory owns
private runtime configuration, forwards explicit native policy only to the native
service, and keeps model credentials out of worker environments. Browser-only
callers retain the compatibility export. Mixed browser/computer assembly exists,
but the combined surface has not received full acceptance. The old TS native
adapter and installed default have not been retired.

A tested read-only entry (after build:reconstruction, build:native and
build:rust-runtime) is:

```bash
CUA_RUNTIME_SUPERVISOR=rust CORE_CUA_NATIVE_BACKEND=swift \
CUA_MCP_ENV='{"CUA_REPL_ENABLED_SURFACES":"computer"}' \
node --env-file=.env --import tsx packages/agent-loop/src/restored-demo.ts --check-computer
```

For a real model loop, add CUA_MODEL_PROVIDER=deepseek and replace --check-computer
with a prompt. One live DeepSeek run explicitly called js -> cua.listApps -> the
original Sky client -> Rust native pipe -> Swift, returned a fresh timestamp/count,
and produced a final answer. It used /nonexistent/vendor as the installed supervisor
path to verify that executable was unnecessary. No app names/window contents were
sent as tool output, and no application was started or operated. An earlier model
run answered from the host preflight count; that alone was not counted as proof of
a model-issued tool call. The model's extra prose on the second run inaccurately
suggested cua was absent, despite successful use; tool evidence is authoritative.

CORE_CUA_APP_POLICY is an explicit JSON bundle-ID rule map as documented above;
empty defaults deny app operations but permit inventory. App operations still
require original Sky elicitation and OS permissions. Computer-only mode ignores
unrelated browser endpoints inherited from .env, correcting a real CLI failure.
No .env or session logs are committed. The new route is opt-in and is not proof
that arbitrary natural-language app operations, screenshot/input, or audio work.

The native IPC acceptance now uses this production factory instead of a duplicate
hand-written runtime spec. Eleven IPC/lifecycle cases pass, including two added
real SIGTERM/SIGINT writer tests: a private socketpair is filled until EAGAIN,
the production writer waits against the unread receiver, then cancellation must
complete with exit code 0. The existing isolated Rust/CDP browser regression and
AgentLoop TypeScript check also pass. The CLI --check-computer and the real
DeepSeek loop exited successfully. Full UI acceptance and native parity remain open.

### Native policy source in the supervisor spec

The owned Swift service now accepts an explicit source selection in the Rust
`native_service` JSON configuration. This is host integration configuration,
not a vendor setting. The default is unchanged: omitted `policy_source` means
`standalone`, and omitted `app_policy` produces `{}` (deny unlisted apps).

For the restored app-server provider, a direct supervisor spec can use:

```json
{
  "helper": "/absolute/path/to/cua-helper",
  "directory": "/absolute/path/to/private-directory",
  "policy_source": "app-server",
  "codex_cli_path": "/absolute/path/to/selected-cli"
}
```

`codex_cli_path` is optional; the Swift provider retains its recovered launch
selection if omitted. In this mode, `app_policy` must be absent, including an
explicit empty map. Conversely, `codex_cli_path` is rejected in standalone mode.
Unknown source values and null/non-map rules are rejected. Conflicts fail before
filesystem creation or helper launch. The supervisor explicitly forwards only
the selected source/path, PATH and LANG; it does not inherit model tokens or all
host environment variables. It does not inject `CORE_CUA_APP_POLICY` in app-server
mode. No existing configuration is changed by adding this option.

Validation includes an owned Node helper over the real ProcessWorker spawn and
readiness path, asserting the received environment and shutdown cleanup for both
sources. The native Swift provider has separate owned-peer policy tests. This
is not yet proof of the complete DeepSeek launcher path: its environment filter,
spec generator and standalone-specific model context still need source-aware
wiring. Real CLI interoperability and approvals remain unverified.

The DeepSeek/restored runtime factory now maps `CORE_CUA_POLICY_SOURCE=app-server`
to that native-service spec, with optional `CODEX_CLI_PATH`. `CUA_MCP_ENV` values
win over parent environment values. `CORE_CUA_APP_POLICY` must be absent when
selecting app-server, including if it was set in `.env`; conflicts are errors,
not permission to discard local rules. Defaults have not changed. Rebuild the
Rust runtime after updating to use the new spec fields.

The host's model context/terminal explanation now distinguishes the two sources.
MCP integration with an owned app-server fixture verifies allowed/denied/forbidden
routing and cached policy fetch through the production runtime factory; approvals
are declined and no application input occurs. Real CLI authentication/configuration
and end-to-end model-driven UI acceptance are still pending. This is an explicit
integration option, not a recommendation to switch policy sources to retry a denied
application.
