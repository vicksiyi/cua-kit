# @core/cdp-host

Independent extension-free Chromium host under construction. This is a deployment adapter for the restored CUA stack, not a translation of a vendor native/CDP host and not yet a production-complete browser backend.

`startOwnedCdpBrowser()` starts a visible isolated Chromium with Playwright (the upstream library), disables extensions, blocks service workers, opens a loopback debugging port, and connects with Node's WebSocket implementation. Browser process environment is allowlisted so model credentials are not inherited. `close()` disconnects CDP, closes the owned browser and removes its temporary profile. It does not touch the daily Chrome profile.

`CdpConnection` correlates flattened CDP session requests, forwards native CDP events, bounds pending requests and times out requests without claiming an action did not occur. It only accepts explicitly supplied loopback websocket endpoints. A reachable debugging endpoint grants browser control and must not be exposed publicly.

Validation: `node --import tsx --test reconstruction/cdp-host-live.test.ts` launches real extension-free Chromium and checks local-page navigation, DOM button activation, CDP text input, Page events and PNG capture. This is a transport-level test, not proof that DeepSeek/MCP/CUA can yet use this backend.

The provider now exposes explicit browser RPC handlers through the existing authenticated native-host socket, reporting backend type `cdp`. Restored MCP inventory, deterministic CUA navigation/click/screenshot, and a real DeepSeek local-page task have passed. The model read the actual post-click text `action-completed-marker`; these tests do not prove external search or daily-profile support.

Network constraints reuse the restored predicate. Context routing blocks unclaimed pages and descendant requests; CDP Fetch interception also checks redirects (Playwright routing alone did not). A negative test caught a real redirect-policy gap before the CDP layer was added. The final test verifies allowed origin navigation, denied origin navigation, rejected foreign-session operations, redirects and a descendant frame. Service workers are blocked in the owned context; WebSockets fail closed pending scoped routing support.

Cross-site iframe read/detach, tab finalization and an actual DeepSeek external Bing search now pass. Finalization reuses the restored browser-session validators and grouping logic. The latest observed first-result destination was https://chat.deepseek.com/sign_in.

Remaining: broader frame/popup lifecycle coverage, scoped WebSocket support, explicit existing-Chrome CDP attachment and the user-facing CLI selector. Unsupported methods fail explicitly. This backend is not ready for the requested handoff; native desktop permission/action acceptance also remains outstanding. Do not emulate extension identity or disable restored policy to get a passing demo.
