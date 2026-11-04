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
