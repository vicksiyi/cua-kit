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


### 2026-11-06: recover the native control protocol boundary

A version-pinned ARM64 audit now decodes ten method comparisons in the installed host's `handle_native_host_control_message`. The names are reconstructed from actual MOV/MOVK and CMP/CCMP operands, including overlapping string-tail loads; they are not guesses from symbol names. See `reconstruction/native-control-protocol-evidence.json` and `scripts/audit-native-control-protocol.py`. The extractor refuses other artifact hashes.

| Native methods | Responsibility | Current Core status |
| --- | --- | --- |
| `codexRuntime/hello` | Native control negotiation | Missing; full response schema needs audit |
| `codexRuntime/status`, `ensure`, `restart` | App-server discovery/status/process lifecycle | Missing; manifest matching and proxy contracts need recovery |
| `codexRuntime/tabContextAsset/create`, `appendChunk`, `finish`, `abort`, `remove` | Native temporary attachment ownership and chunk transfer | Missing; must be Rust, not browser pageAssets TS |
| `codexRuntime/openLocalFile` | Native local-file dispatch | Missing; validation and launch behavior need recovery |

The asset create comparison permits at most 16 active entries. Append decodes with the observed base64 library and rejects a cumulative decoded size above 104857600 bytes (100 MiB), using saturating addition. UUID generation and std filesystem calls are also visible. Abort and remove call the same native method. These observations establish concrete implementation requirements, but do not prove every filename/cleanup/error detail.

Current `runtime.rs` forwards extension input to `RpcRouter::from_extension` without a native control dispatcher. Therefore the passing browser navigation tests do not exercise this separate control plane. The next implementation must intercept the evidenced native methods at the correct input boundary, preserve normal browser routing for unhandled methods, and implement asset/process ownership in Rust. Do not advertise all methods in hello until their real contracts are supported. The methods are also distinct from the existing browser-context/pageAssets APIs.

This audit is static only: no vendor host, app-server, file opener, browser profile, or network endpoint was executed. Manifest selection, complete hello/status/error schemas, filename edge cases, control authorization and WebSocket proxy remain required before parity can be claimed.


### 2026-11-06: reconstruct native attachment filename handling

Added `native/browser-extension-host/src/tab_context_asset.rs` with the native attachment limits and filename sanitizer, reconstructed from the same pinned ARM64 artifact. The binary chooses the last nonempty slash/backslash segment, substitutes the explicit reserved-character mask plus `|`, trims Unicode whitespace and falls back to `tab-context.txt`. Its 218-byte bound is UTF-8 byte based; long names retain the last extension when a nonempty truncated stem fits, otherwise the whole name is truncated at a character boundary. This behavior stays Rust. The extended static evidence records the mask and branch instructions.

Two native tests pass: exhaustive ASCII checks against the independently decoded bit mask, path/whitespace cases, exact boundary and fallback cases, plus 1196 Unicode/length combinations. No original native function was executed, so this is instruction-supported reconstruction, not dynamic differential parity. The sanitizer deliberately does not introduce unobserved character filtering. It is not sufficient path authorization: the original create operation also prefixes a UUID.

The module is not wired into the runtime yet. Asset storage/create/append/finish/remove, UUID path composition, cleanup ownership and the native control dispatcher remain required; no attachment capability is advertised by this change.


### 2026-11-06: native attachment storage and control dispatch implemented

`AssetStore` now owns real private files: UUID-v4 IDs, UUID-name composition, Base64 chunk writes, cumulative 100-MiB checks, 16-entry capacity, finish marking without eviction, idempotent missing-entry removal, and cleanup of tracked files. It reuses the observed `uuid 1.23.0` and `base64 0.22.1` crates. Their transitive dependency versions are Cargo resolutions, not claimed original lockfile recovery. Create/finish return assetId/path; append/remove return an empty object. The source evidence records the UUID-name format literal and the native string-result response error code 1.

`control.rs` intercepts the five evidenced attachment methods on extension stdio input before ordinary router forwarding. Abort and remove share handling. Other methods remain unhandled by this dispatcher; hello/status/ensure/restart/openLocalFile are not advertised or emulated. Known control failures return a response rather than terminating the host.

Core deployment deliberately places attachments under the private owned endpoint's assets directory, rather than the original global temporary codex-tab-context-assets directory. Root/file inode checks, exclusive creation and no-follow append protect the owned deployment; cleanup only removes tracked identities and an empty owned directory. Full vendor parameter/error wording, original cleanup semantics under every failure and control authorization remain unproven. This is a native implementation with explicit deployment differences, not exact recovered source.

Validation: six attachment Rust tests include real binary/Unicode bytes, malformed Base64 with no writes, finished-entry behavior, same-name unique files, capacity including finished entries, a real exactly-100-MiB file plus rejected overflow, and preservation of replacement paths/unrelated files. The restored ExtensionBrowserPeer exchanges real framed stdio with the production debug executable, exercises all five methods without a browser RPC client, checks disk contents and verifies EOF removes files and endpoint. The full gate passes 32 native tests and 17 cross-language/process tests.

After this dispatcher change, both packaged native/full extension deployments also pass actual isolated Chromium navigation/click/read and native EOF cleanup (2/2). No daily Chrome profile or paid model request was used.


### 2026-11-06: native openLocalFile control implemented

Added Rust `open_local_file` and wired `codexRuntime/openLocalFile` with the `path` parameter. The pinned binary evidence establishes embedded-NUL rejection, absolute paths, regular-file/symlink checks, ASCII-case-insensitive command/desktop/jar/terminal/tool extension rejection and Unix execute-bit rejection. The implementation uses `Command::new("open").arg(path)` with null standard streams, responds after successful spawn and reaps the child on a detached waiter, matching the observed asynchronous boundary. It does not claim the GUI application finished opening the document. Non-macOS platforms return unsupported.

Validation: one native validator test covers missing/relative/NUL paths, directories, symlinks, all three execute bits and five extension variants. All nine real stdio runtime tests pass, including a new test-owned PATH opener: invalid input produces no launch, a path containing spaces/semicolon/shell-like text arrives as one literal argument, the child is reaped while the host stays running, and clean EOF still succeeds. No personal file or actual GUI app was opened. The release Rust host has been rebuilt.

Original native dynamic parity, exact diagnostic wording and LaunchServices/GUI acceptance remain unverified. Hello/status/ensure/restart and full App Server manifest/process/WebSocket behavior remain missing; this change adds only the evidenced file-opening control, not those runtime services.


### 2026-11-06: distinguish deployment configuration from runtime registry

The installed Chrome plugin's JavaScript `installManifest.mjs` writes schemaVersion-1 `extension-host-config.json` next to the extension-host executable. It includes CLI/Node/REPL paths, optional browser client/channel and proxy host/port. This is distinct from the native schemaVersion-2 chrome-native-hosts-v2.json runtime registry. The native load function has both registry processing and later configuration/environment code; their full precedence/selection behavior remains to be recovered.

Restored the three JS configuration builder/plugin-path/writer helpers as readable TS in `app_server_host_configuration.ts`, exported from @core/native-host. They preserve original validation order, optional-null omission, whitespace preservation, port bounds/defaults and override spread semantics. This belongs in TS because the evidence is JavaScript; native registry selection will remain Rust.

Two differential tests execute the pinned installed helpers (not install()) against the restored implementation: 21 configuration cases, 4 plugin-path overrides, and an owned temporary write compare bytes and location. Both tests and native-host type check pass. No installed registration/configuration or user environment was modified. The helpers are available but deliberately not wired to launch an App Server before native loading/selection is implemented.


### 2026-11-06: reconstruct native launch-field environment resolution

Added Rust `app_server_configuration::LaunchFields::resolve`, based on the pinned native load function at 0x10001e4d8..0x10001ebfc and non_empty_env at 0x1000213e8. It resolves the eight observed CLI/extension/Node/browser-client/home/REPL/proxy environment inputs against already-selected configuration fields. The environment accessor is supplied explicitly and requests only those eight names; this module never scans or forwards model credentials.

Native environment values are converted from Unicode, trimmed, then ignored if empty. This differs from JS configuration generation, which validates trim but preserves the stored string. Nonempty environment values take precedence; fallback CLI/Node/proxy host values are codex/node/127.0.0.1. Proxy ports use Rust u16 parsing (including plus signs and zero); invalid/overflow values fall back to the configured port, then zero, instead of failing. The pinned evidence extractor verifies each environment literal/call and records trim/fallback instructions.

Two Rust tests pass: all eight field overrides, whitespace/invalid-Unicode fallback without global environment mutation, every one of the 65536 valid u16 ports, and malformed/overflow/default cases. This verifies the reconstructed resolver, not dynamic parity with the original binary. Raw JSON schema validation, schema-2 registry selection, full load precedence and connection to process startup remain unimplemented; the new module is not yet wired into the runtime.
