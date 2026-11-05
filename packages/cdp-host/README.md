# @core/cdp-host

Independent extension-free Chromium host under construction. This is a deployment adapter for the restored CUA stack, not a translation of a vendor native/CDP host and not yet a production-complete browser backend.

`startOwnedCdpBrowser()` starts a visible isolated Chromium with Playwright (the upstream library), disables extensions, blocks service workers, opens a loopback debugging port, and connects with Node's WebSocket implementation. Browser process environment is allowlisted so model credentials are not inherited. `close()` disconnects CDP, closes the owned browser and removes its temporary profile. It does not touch the daily Chrome profile.

`CdpConnection` correlates flattened CDP session requests, forwards native CDP events, bounds pending requests and times out requests without claiming an action did not occur. It only accepts explicitly supplied loopback websocket endpoints. A reachable debugging endpoint grants browser control and must not be exposed publicly.

Validation: `node --import tsx --test reconstruction/cdp-host-live.test.ts` launches real extension-free Chromium and checks local-page navigation, DOM button activation, CDP text input, Page events and PNG capture. This is a transport-level test, not proof that DeepSeek/MCP/CUA can yet use this backend.

The provider now exposes explicit browser RPC handlers through the existing authenticated native-host socket, reporting backend type `cdp`. Restored MCP inventory, deterministic CUA navigation/click/screenshot, and a real DeepSeek local-page task have passed. The model read the actual post-click text `action-completed-marker`; these tests do not prove external search or daily-profile support.

Network constraints reuse the restored predicate. Context routing blocks unclaimed pages and descendant requests; CDP Fetch interception also checks redirects (Playwright routing alone did not). A negative test caught a real redirect-policy gap before the CDP layer was added. The final test verifies allowed origin navigation, denied origin navigation, rejected foreign-session operations, redirects and a descendant frame. Service workers are blocked in the owned context; WebSockets fail closed pending scoped routing support.

Cross-site iframe read/detach, tab finalization and an actual DeepSeek external Bing search now pass. Finalization reuses the restored browser-session validators and grouping logic. The latest observed first-result destination was https://chat.deepseek.com/sign_in.

Remaining: broader frame/popup lifecycle coverage, scoped WebSocket support, explicit existing-Chrome CDP attachment and the user-facing CLI selector. Unsupported methods fail explicitly. This backend is not ready for the requested handoff; native desktop permission/action acceptance also remains outstanding. Do not emulate extension identity or disable restored policy to get a passing demo.

The `attachCdpBrowser(endpoint)` transport helper now accepts an explicitly supplied loopback WebSocket debugging endpoint and uses Playwright `connectOverCDP(..., { noDefaults: true })`. It does not launch or own the browser. A real second-client test verifies that closing/disconnecting it preserves the original browser's target IDs and page state. This helper is not yet wired into the user-facing MCP deployment: the owned-browser provider currently installs context-wide routing, which must be scoped correctly before attaching to a daily browser. No automatic restart or debugging flag change is performed on existing Chrome.

## Explicit existing-browser attachment

The demo accepts `--cdp-endpoint ws://127.0.0.1:PORT/devtools/browser/ID` in
place of `--cdp-browser`. Supply the actual browser-level endpoint from a Chrome
instance already started with remote debugging. The program does not scan ports,
restart daily Chrome, enable debugging on an already-running instance, or change
its profile. Only local uncredentialed `ws://` endpoints are accepted.

```bash
npm run demo:deepseek -- --cdp-endpoint 'ws://127.0.0.1:PORT/devtools/browser/ID' --check-browser
npm run demo:deepseek -- --cdp-endpoint 'ws://127.0.0.1:PORT/devtools/browser/ID' '在新标签页打开百度并搜索 deepseek'
```

Attachment uses upstream Playwright `connectOverCDP` with `noDefaults:true`.
It installs HTTP routing only on pages actually attached by CUA, retains CDP
Fetch enforcement for redirects, and bypasses service-worker fetch on that
page's enabled Network session. Page commands cannot disable this lease.
WebSocket creation is blocked on controlled pages while the lease is active.
Detach removes our HTTP handler, releases the CDP session, and makes our socket
handler transparent; client disconnect releases its instrumentation. Unclaimed
pages receive no context-wide routing changes. This does not claim containment
of unrelated existing background workers or browser extensions.

Exit disconnects the client, not the external browser. Restored turn-finalization
rules still close unmarked tabs created by the agent; claimed preexisting user
tabs remain open. Existing connections are not terminated merely by claiming a
page; this is not a fresh isolated profile or a full browser network sandbox.

Live tests cover existing-tab operations, unrelated-page access, actual restored
MCP actions/screenshots, service-worker bypass/recovery, WebSocket block/release,
and browser survival after the real CLI disconnects. A real daily profile still
requires an explicitly available debugging endpoint; passing these tests does
not demonstrate that an arbitrary already-running Chrome has debugging enabled.
