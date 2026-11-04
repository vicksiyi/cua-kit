# @core/browser-extension

Readable reconstruction of selected code from the locally installed ChatGPT Chrome extension, version **1.26.1102.11740**, extension ID `hehggadaopoacecdllhhajmbjkdcmajg`. This is a different artifact from the `@oai/*` npm packages. `@core/browser-extension` is this project's package name; no original package with that name is asserted. It is also separate from the older independently authored `extensions/chrome` implementation.

The first restored component is the original `GE` native messaging transport and its errors/type decoder. It uses Chrome's nativeMessaging and alarms APIs plus standard timers; no third-party transport library is recreated. The inspected bundle separately includes Sentry 10.48.0, which is not copied into this component.

`NativeTransport` keeps the original constructor behavior: attach the alarm listener and immediately attempt a native host connection. The default host identity remains `com.openai.codexextension`; callers can supply the original string/list argument. `createNativeTransportClass` adds an explicit dependency boundary for tests while the default export uses actual Chrome APIs and standard timers. Do not construct the default transport in a non-extension process.

Preserved behavior includes native-host-prefixed request IDs, reply correlation, remote error types, timeout/post/disconnect rejection, late-reply suppression, stale-port suppression, explicit reconnect, missing-host-only candidate fallback, five-second retries and half-minute Chrome alarms. Status timestamps and retry counters retain the original transitions. This does not add an invented teardown method that the inspected class lacks.

Provenance and the pinned background.js hash are recorded in `reconstruction/extension-source.json`. The differential harness extracts only explicitly inspected top-level bindings; it does not execute extension startup. Set `CUA_EXTENSION_SOURCE_ROOT` to an installation of the recorded extension version to run the tests on another machine.

```sh
npm run build:reconstruction
npm run check:reconstruction
npx tsx --test reconstruction/extension-native-transport.test.ts
```

This is **not yet an installable extension**. The real extension dispatcher, browser operations, session/auth/security integration, manifest/build wiring and native messaging host remain outstanding. The original extension snapshot is newer than the recorded desktop application artifacts; cross-version production compatibility is not established by component differential tests.

## Browser RPC facade

The original `fc` bidirectional peer and `pc` extension facade are now restored. Their protocol methods match the browser-service `to` peer, so the implementation is shared through `@core/core/browserRpcPeer`; the browser service retains its existing re-export facade. This factoring is a project boundary, not a claim that the original extension imported that package.

The original bundles differ in transport field initialization order. The shared class factory preserves each variant and class-field descriptor/setter semantics. It retains method registration/binding, numeric request IDs, string rejection values, missing-handler errors, notification listeners and response suppression after closure. `ExtensionBrowserPeer` restores ping and the CDP/detach/download/page/tab-mention notifications, plus moveMouse/WebMCP event handling. Synchronous moveMouse throws remain synchronous failures; only rejected promises go to its error callback, matching the source.

Differential tests compare both original peers and the extension facade. A composed transport/peer test verifies `native-host:*` host requests and numeric browser requests do not collide, and an inbound browser request reaches the supplied handler and returns through native messaging. The production command handler is still not restored/installed; this is protocol composition with a fixture handler.

### Browser command handler

`createBrowserCommandHandlerClass(dependencies)` translates original `pE` in full,
including session resolution/activation, passive reads, CDP validation/filter calls,
capability dispatch, cursor arrival waiters, download events and child popup cleanup.
The original method list, field order, return/error values and dependency-call order
are compared with the pinned artifact. An RPC composition test routes requests
through `ExtensionBrowserPeer` into the handler.

The factory is an explicit reconstruction boundary, not an installed extension
entry point. Its required dependencies include the real session (`wd`), tab leases,
SIWC, overlay and frame monitors. The original persistent request-header policy
is constructed directly using the supplied Chrome API; CDP validation/filtering now
imports the restored security module directly. No
production defaults or permissive security substitutes are supplied. Parameter
payloads remain broadly typed while those contracts are being recovered; this is
readable TypeScript, not yet a fully specified public protocol. See
`reconstruction/extension-command-handler-dependencies.json` for every original
binding's readable dependency name. The tests' fake sessions are test-only.

```mermaid
flowchart TD
  Host[Native messaging host — external binary] --> Transport[NativeTransport — restored GE]
  Transport --> Peer[ExtensionBrowserPeer — restored pc/fc]
  Peer --> Handler[BrowserCommandHandler — restored pE]
  Handler --> Chrome[Chrome APIs: tabs / windows / scripting / notifications]
  Handler --> Guards[Restored CDP filters + required SIWC / lease dependencies]
  Handler --> Session[Required Session implementation: original wd]
  Handler --> Overlay[Required overlay and frame-monitor implementations]
  Session --> Actual[Debugger / lifecycle / ownership — pending production wiring]
```

### CDP security and event forwarding

`cdp_security.ts` restores original `Qp`, `Xp`, `Yp` and their helpers. The handler
uses validation before session activation and filters replies before returning to
RPC. The rules reject page-exposed debugger access and require flattened automatic
attachments (except when automatic attachment is explicitly disabled). Cookie and
header transformations specifically protect `__Host-siwc-browser-bootstrap` across
the original CDP result/event shapes. Unknown methods and arbitrary page values
retain original behavior; this is not a blanket secret scrubber.

`registerBrowserEventListeners` extracts six original `dR` subscriptions:
debugger detach/events, handler download changes, Chrome download creation/changes,
and navigation targets. CDP events are filtered before broadcasting, including
dropping `Target.receivedMessageFromTarget`. The original per-peer routing,
instance initialization, remaining runtime subscriptions, and startup lifetime
still need production composition. No teardown or additional catches are invented.
Differential tests execute only these six inspected original subscription calls,
not the original extension startup.

### Request-header templates and persisted policy

The installed browser service's `VC/u5` and extension's `cs/ls` implement the same
header-template parsing/expansion rules. Both now use `@core/core/requestHeaders`;
the browser re-exports its existing function names and the extension exposes
`parseRequestHeaders` and `resolveRequestHeaders`. This is a project-created shared
export, not a claim that the original package had this path. No third-party header
library appears in these inspected functions.

The handler directly constructs the restored original `uS` policy over Chrome
storage. `AGENT_REQUEST_HEADER_ENABLED` becomes sticky once true: a false decision
does not revoke an enabled policy. Failed persistence does not set the in-memory
flag. Header count/name/value/aggregate limits, reserved names, template substitution,
case-insensitive collisions and exact validation errors are compared with the
original extension. The session's use of these headers and lease/DNR reconciliation
still require restoration; this module alone does not install network rules.
