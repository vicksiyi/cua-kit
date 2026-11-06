# Browser extension host: native responsibility audit

The installed `chrome/extension-host/macos/arm64/ChatGPT for Chrome` executable is Rust. Its SHA-256 is `2a5b1035b5dcbb6c9a55f2acf775dc5124d816131388332af60ec2850fd99f5f`. This is a different executable from the `cua_node/bin/node_repl` supervisor. Migrating the supervisor to Rust did not migrate the browser extension host.

Evidence is reproducible without running the original host:

```sh
python3 scripts/audit-extension-host-language.py > reconstruction/extension-host-native-evidence.json
```

The extractor reads compiler/source-path literals and `nm --demangle` symbols. It records 66 host symbols and the visible `base64 0.22.1`, `itoa 1.0.18`, `serde_json 1.0.149`, and `uuid 1.23.0` dependency path literals. These are reuse candidates; they are not a complete Cargo manifest or evidence of feature flags. The supervisor currently has its own dependency versions; do not assume one package's versions prove another's.

| Original Rust evidence | Current code / gap | Required direction |
| --- | --- | --- |
| `extension_host::main` | Rust `main.rs` is the default; TS `main.ts` is an explicit legacy entry | Retire remaining legacy consumers; retain installer/client JS where evidenced. |
| `transport::unix::UnixSocketServer::{bind,accept}`, stdio reader/writer | Rust runtime owns default Unix/stdio service; `server.ts` remains a reference | Keep original JS native-pipe client bindings in TS; retire explicit legacy server consumers. |
| `rpc_router::RpcRouter::{register_message_from_client,route_message_to_client,remove_client}` | Core Rust routing is implemented and selected; TS reference remains | Original message-ID/lifecycle algorithm parity still needs evidence beyond Core compatibility. |
| `client_writer::{ClientWriter,ClientWriterRegistry}`, enqueue/send/broadcast/evict | Rust queued writers are integrated and tested; TS version is legacy | Original queue sizes and exact eviction semantics remain unproven by symbol names. |
| `peer_authorization::PeerAuthorizer::authorize_unix_stream`, code-identity resolver | Core capability tokens authenticate current sockets | Original code-identity policy is not equivalent to Core token authentication. Keep this gap explicit; do not impersonate installed signed clients. |
| `app_server::{AppServerManager,AppServerProcess,AppServerHostConfig}` | No corresponding original host manager in the current Core host | Manifest/version selection, process startup/status/shutdown remain part of full host scope. |
| app-server proxy/WebSocket and tab context asset symbols | Simple browser RPC forwarding does not supply these capabilities | Investigate contracts and implement in native host; do not mark host complete after routing alone. |
| `open_local_file::open` | Original host dispatch not reconstructed | Establish request contract and native responsibility before implementation. |

Two existing native-host files have separate **original JavaScript** evidence: `chrome_profile.ts` and `macos_browser_app.ts`. Those remain readable TS. Three files now have confirmed corresponding Rust roles (`main.ts`, `server.ts`, `router.ts`); ten remaining files still need finer ownership analysis. Native roles are confirmed, not native function bodies.

The current extension installer now generates a Rust launcher; the independent CDP adapter uses `startRustNativeHost` and the Rust executable. Explicit legacy public APIs/tests still reach the TS reference server. Default-path migration is now validated with owned installation and browser fixtures; remaining legacy API/test consumers still require retirement. Removing only an export or replacing the demo supervisor leaves this native service in TS.

## Version-bound authorization evidence

`reconstruction/native-host-auth-evidence.json` describes a historical binary with SHA-256 `bd707631640d6b818c2dd61466b83ed9c49612b1c9f176fe57fa26a0097db1ab`. It does **not** match the currently inspected installed host. Its disassembly addresses and 15-entry allowlist must not be treated as current offsets/policy without re-auditing this exact executable. The new evidence records the mismatch instead of overwriting the historical record.

This audit is static evidence, not a passed browser acceptance test. It does not execute the original host, connect to user browser sessions, recover Rust source bodies, or prove parity of the current independently implemented Core protocol.


## Rust routing implementation checkpoint

`native/browser-extension-host` now contains a real Rust routing core, with `serde_json 1.0.149` reused from the observed host dependency version. It owns request-ID correlation, multiple clients, id-only void replies, reverse heartbeat replies, explicit monotonic deadlines, client removal, stale response rejection and failed-delivery rollback. The future native event loop must expire deadlines before dispatch and deliver actions via bounded writers; this crate does not yet provide a socket/stdio executable.

Run `npm run test:native-host-router`: seven Rust contract tests and a 30-transition differential against the **current Core TS router** pass. The latter is a compatibility check, not a differential against the installed original Rust host. The NDJSON `router_contract` example is exclusively a test harness and must not be registered as a browser Native Messaging host.

Production `startNativeHost` and CDP still use the TS implementation. Native transport, writer queues, cleanup/authentication, installation/consumer switch, and original app-server/proxy capabilities remain required. The routing implementation alone does not retire the TS package or establish vendor algorithm parity.


## Native transport and client-writer checkpoint

The Rust crate now has native-endian framed JSON read/write helpers, with size checks before payload allocation and explicit rejection of truncated headers/bodies. Invalid JSON diagnostics omit payloads. Restored JS framing exchanges actual stdio messages with the Rust test executable, including Unicode, coalesced frames and fragmented response decoding.

`client_writer` owns one bounded writer thread per Unix client. Both queued and in-flight frames count toward message/byte limits. Queue overflow, frame rejection, write failure and explicit disconnect close the socket, wake the writer and emit one terminal event. Real Unix socket tests connect the routing core to writers, verify colliding-ID replies and notifications, and show a non-reading client is disconnected without blocking another client's messages. The native event loop must still consume terminal events and remove routing state. Queue sizes remain explicit Core policy, not recovered original constants.

`npm run test:native-host-router` now passes 15 Rust tests plus 3 cross-language checks (the 30-transition routing compatibility test and two framed-stdio tests). `framed_echo` and `router_contract` remain test-only executables, not production hosts. The Unix listener, authentication/endpoint lifecycle, host supervisor loop and installation/consumer switch are not implemented by these helpers; production still reaches TS.


## Private endpoint and Core authentication checkpoint

`endpoint.rs` now creates an owned mode-0700 child under an explicitly supplied private parent, binds a mode-0600 Unix socket and publishes a mode-0600 descriptor compatible with the existing Core client. The descriptor and socket are removed by the owner guard; cleanup checks the directory device/inode and does not recursively delete a replacement. Listener setup failure rolls back its child. Parent creation remains the caller/installer responsibility. Long macOS Unix socket paths fail with cleanup rather than silently moving outside the configured parent.

The Core capability handshake uses OS random bytes and `subtle 2.6.1` for constant-time token comparison; `libc 0.2.191` supplies effective user identity. These two dependencies are independently selected implementation dependencies, not claimed observed vendor dependencies. The handshake has an absolute deadline across partial reads/writes, a bounded frame, restores stream timeouts, preserves a pipelined next frame and closes rejected connections. This is still Core token authentication, not original peer code-signature authorization.

Six endpoint tests pass, including denied tokens/version/type, slowly arriving authentication bytes, private permissions, replaced-directory protection, pipelined frames, long-path rollback and cleanup. The existing TS discovery/authentication/BrowserRpcPeer client successfully connects to a Rust-owned Unix listener, rejects a bad token, performs an owned fixture RPC and verifies endpoint removal after exit.

The combined `npm run test:native-host-router` gate now passes 21 native tests and 4 cross-language checks. `endpoint_probe` is a single-request test fixture, not the production host. Connecting the native router, listener, workers and stdio in a supervised event loop, then switching installation and CDP consumers, remains required. No daily Chrome instance or installed original host was launched in these tests.


## Composed Rust host executable checkpoint

`native/browser-extension-host/src/main.rs` and `runtime.rs` now compose the listener, Core handshake, bounded client writers, router and framed stdio into a real native host executable. The command is `core-browser-extension-host --config <config.json> <chrome-extension origin>`; version-1 Core configuration must explicitly provide a private endpoint parent and registered extension IDs. This entry has not yet replaced the installed Node launcher or the CDP adapter's TS server.

The event loop bounds accepted connections, cross-thread message traffic and extension-output buffering. Authentication and client reads run independently so an unauthenticated stalled connection does not stop healthy clients. EOF, SIGINT/SIGTERM, truncated input and output failure cancel pending requests, shut down connections, join client workers and remove the owned descriptor/socket. Stdout contains framed RPC only; the endpoint path is reported to stderr. Original code-identity authorization, app-server/proxy behavior and equivalent lifecycle logging remain open.

Two macOS integration failures were corrected: accepted sockets inherit the nonblocking listener flag and must be reset for bounded blocking authentication; libuv socketpair stdout signals idle peer closure via readable EOF rather than necessarily POLLHUP. Tests exercise both actual behaviors.

Seven new process-level cases use restored `ExtensionBrowserPeer`, `BrowserRpcPeer` and Core client code against the native executable: colliding request IDs, void replies, notifications, extension errors, wrong-token rejection, a stalled unauthenticated peer, three shutdown paths, invalid origin, truncated input and closed output. They use owned fake-extension streams, not daily Chrome or the original native host. Together with the existing tests, the gate covers 23 Rust cases and 11 cross-language/process cases. This establishes Core-host composition; real extension installation/CDP migration and original behavior parity are still unproven.


## CDP consumer migrated to the Rust executable

`packages/cdp-host/src/host.ts` now checks for the Rust binary before launching/attaching a browser and uses `startRustNativeHost`. The new TS `native_process.ts` is a deployment binding: it creates a private Core configuration, starts the owned native process, forwards framed streams with backpressure, reads the private endpoint and reaps the child on close. It does not implement socket listening or RPC routing. Model credentials are not forwarded to the child environment. There is no silent fallback to the TS host.

`npm run build:rust-browser-host` builds/copies the release executable. CDP demo CLI branches now build it automatically; direct callers need this build first. The broad reconstruction and browser/sandbox test commands include the prerequisite. The extension installation launcher remains Node-based and still needs migration.

Validation: three deployment-binding cases cover RPC, idempotent close, child reaping, listener cleanup, startup failure and startup timeout. The root `npm run demo` isolated-browser Loop passes with the Rust browser host and Rust supervisor, using a local deterministic model; it opens/clicks/reads the fixture and returns the marker. The existing attached-browser/provider/MCP test also passes, preserving unrelated tabs and the attached browser on close. The attachment fixture is owned by the test; no daily Chrome instance was touched. CLI routing tests and native-host/CDP type checks pass. No paid DeepSeek run or original-host algorithm parity is claimed.


## Extension installation default migrated

`install:chrome` now builds the Rust executable and generates a shell launcher that directly execs it. `@core/native-host`'s `start` command also selects Rust; `start:legacy` retains the explicit Node reference entry. New configurations record native runtime metadata. A compatible existing Core registration under the caller's installation root is upgraded atomically after origin, config, ownership and path checks. The old launcher remains untouched and its registration is saved as private `previous-registration.json` for rollback; unrelated or changed registrations are refused. Repeating the install is idempotent. No daily Chrome registration was changed during this implementation turn.

Native lifecycle logging preserves private, bounded JSONL metadata (`time`, `pid`, `event`) with no RPCs, page content or tokens. Rust reuses `chrono 0.4.45` for UTC formatting; this is an independent logging dependency, not an observed original-host dependency. Logs reject symlinks/hardlinks/shared permissions. `lifecycle.jsonl` is ignored by Git. Release executable replacement is atomic, so rebuilding does not overwrite the executable inode used by a running process.

Fresh and legacy-upgrade fixtures pass actual generated-launcher RPC, idempotence, rollback-record preservation, incompatible-registration refusal and lifecycle/endpoint cleanup. The packaged native extension also passes real owned Chromium → Rust browser host → Rust supervisor → restored CUA/MCP page-operation acceptance. It verifies the registered runtime is Rust, not just that some host responds. This run did not use the full-extension deployment variant or daily Chrome.

The explicit TS reference server/router APIs are not deleted yet. Original peer code-signature policy, app-server/proxy/tab asset semantics, complete native source fidelity and daily Chrome acceptance remain open. Historical checkpoints above describe earlier stages; the default extension and CDP paths now both use the Core Rust host.

Current host gate result after installer migration: 26 Rust tests and 16 cross-language/installation/process tests pass.


## Both packaged deployments accepted with native shutdown

After installer migration, both `native` and `full` packaged extension deployments pass in isolated Chromium using the Rust browser host and Rust REPL supervisor. The full deployment includes its restored extension initialization, with external feature/telemetry traffic disabled or DNS-blocked by the fixture. Both exercise tab discovery, native notifications, mention messages/ports, page capture, tab creation, and restored MCP CUA navigation/click/AX read. A random action marker observed independently by the local HTTP server proves the click affected the fixture page.

The same tests now close the owned browser and wait for native endpoint withdrawal plus the `input-ended` lifecycle event. This checks actual Native Messaging EOF cleanup rather than only a fake-extension process test. Both cases pass (2/2, no skips). Discovery's explicit `no_endpoints` result is treated as expected shutdown; other discovery failures remain errors.

Reproduce: `CUA_RUNTIME_SUPERVISOR=rust CUA_TEST_MACOS_SANDBOX=1 CUA_TEST_RUST_RUNTIME=1 node --import tsx --test reconstruction/extension-native-controller.test.ts`. This does not prove daily Chrome profile/cold-start behavior, native App screenshot/input, paid DeepSeek reasoning, original host authorization, or source-body parity.


### 2026-11-06: isolate the legacy TS host from normal public clients

The normal `@core/native-host` entry no longer exports the old TS `startNativeHost` or `NativeHostRouter`; reference consumers explicitly import `@core/native-host/legacy`. Native callers use `startRustNativeHost(input, output, { parentDirectory })`, with an existing private directory. This is an intentional development-package API change: the Rust binding does not silently emulate old requestTimeoutMs/onLifecycle options. Existing reference source files remain for differential/compatibility tests.

Extracted Core endpoint types, frame limit and JSON-RPC shape validation into `protocol.ts`. Client imports previously pulled `server.ts` for MAX_FRAME and `router.ts` for validation; they now avoid both native-reference implementations. An esbuild module-graph regression checks the normal entry and both client transports exclude server/router/main/lifecycle_log. These are Core contracts, not claimed original native constants.

Default native-host/reconstruction builds no longer generate the old Node `main.mjs`; `--include-legacy`, workspace `build:legacy`, and root `build:legacy-runtime` explicitly build it. Existing local artifacts are preserved rather than deleted. A fresh-output check verified default omission and explicit legacy generation. Discovery/live-discovery integration fixtures now use the actual Rust host, with macOS /tmp canonicalization accounted for.

Validation: native-host/CDP type checks; 10 boundary/discovery/pipe-auth tests; 3 Rust process-binding cases; 6 retained legacy compatibility cases; and the real full-extension Chromium/Rust/MCP navigation/click/read plus EOF cleanup case pass. Native source algorithm parity, peer identity policy, app-server behavior and desktop effects remain incomplete.
