# Browser extension host: native responsibility audit

The installed `chrome/extension-host/macos/arm64/ChatGPT for Chrome` executable is Rust. Its SHA-256 is `2a5b1035b5dcbb6c9a55f2acf775dc5124d816131388332af60ec2850fd99f5f`. This is a different executable from the `cua_node/bin/node_repl` supervisor. Migrating the supervisor to Rust did not migrate the browser extension host.

Evidence is reproducible without running the original host:

```sh
python3 scripts/audit-extension-host-language.py > reconstruction/extension-host-native-evidence.json
```

The extractor reads compiler/source-path literals and `nm --demangle` symbols. It records 66 host symbols and the visible `base64 0.22.1`, `itoa 1.0.18`, `serde_json 1.0.149`, and `uuid 1.23.0` dependency path literals. These are reuse candidates; they are not a complete Cargo manifest or evidence of feature flags. The supervisor currently has its own dependency versions; do not assume one package's versions prove another's.

| Original Rust evidence | Current code / gap | Required direction |
| --- | --- | --- |
| `extension_host::main` | `packages/native-host/src/main.ts` still runs a Node host | Replace native host executable entry in Rust; retain installer/client JS where evidenced. |
| `transport::unix::UnixSocketServer::{bind,accept}`, stdio reader/writer | `server.ts` owns Unix socket and framed stdio | Native transport/server belongs in Rust. Keep original JS native-pipe client bindings in TS. |
| `rpc_router::RpcRouter::{register_message_from_client,route_message_to_client,remove_client}` | `router.ts` implements an independently designed request router | Reconstruct native routing in Rust; prove message-ID/lifecycle behavior rather than assuming the TS design matches the original. |
| `client_writer::{ClientWriter,ClientWriterRegistry}`, enqueue/send/broadcast/evict | TS server uses writable-length checks and direct socket writes | Native queued writer and eviction lifecycle need explicit reconstruction and acceptance. Symbol names do not establish queue sizes or exact eviction semantics. |
| `peer_authorization::PeerAuthorizer::authorize_unix_stream`, code-identity resolver | Core capability tokens authenticate current sockets | Original code-identity policy is not equivalent to Core token authentication. Keep this gap explicit; do not impersonate installed signed clients. |
| `app_server::{AppServerManager,AppServerProcess,AppServerHostConfig}` | No corresponding original host manager in the current Core host | Manifest/version selection, process startup/status/shutdown remain part of full host scope. |
| app-server proxy/WebSocket and tab context asset symbols | Simple browser RPC forwarding does not supply these capabilities | Investigate contracts and implement in native host; do not mark host complete after routing alone. |
| `open_local_file::open` | Original host dispatch not reconstructed | Establish request contract and native responsibility before implementation. |

Two existing native-host files have separate **original JavaScript** evidence: `chrome_profile.ts` and `macos_browser_app.ts`. Those remain readable TS. Three files now have confirmed corresponding Rust roles (`main.ts`, `server.ts`, `router.ts`); ten remaining files still need finer ownership analysis. Native roles are confirmed, not native function bodies.

The current production extension host and the independent CDP adapter both use `startNativeHost` from the TS package. A migration must switch both call paths and validate installation, connection/authentication, multiple clients, framing, cancellation/disconnection and cleanup with owned fixtures. Removing only an export or replacing the demo supervisor leaves this native service in TS.

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
