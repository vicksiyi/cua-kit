# Implementation status

**Direction corrected by explicit user request:** the acceptance target is source-faithful readable TypeScript reconstructed from installed JS, original package boundaries renamed to `@core/*`, and extensionless source imports. See [reconstruction status](../reconstruction/README.md). The independent implementation and milestones below are historical evidence, not proof of this new acceptance target.

User authorized implementation on 2026-11-03. The design documents remain a historical baseline, not a claim of implemented features.

## Full goal (not complete)

- [ ] Standalone SDK: browser discovery, exact tab binding, observations, inputs, screenshots, lifecycle.
- [ ] Robust browser core: frames, stale observations, geometry, hit testing, diffs, navigation, dialogs and cancellation.
- [ ] Browser extension/native messaging for authorized existing tabs.
- [ ] Native macOS provider/helper with actual AX, screenshot and input behavior.
- [ ] Persistent, restricted JavaScript runtime; reset, resource lifecycle and quotas.
- [ ] MCP server usable by third-party clients without OpenAI host dependencies.
- [ ] Agent-independent client and model/loop abstractions.
- [ ] Demo: user question -> agent loop -> MCP client -> browser/app -> observation -> final answer.
- [ ] Integration tests for pure SDK and MCP + agent loop; native provider validation.
- [ ] Documentation, compatibility matrix, installation and reproducible examples.

## Current work

Managed Chromium and consented extension tabs share CDP AX/input/screenshot and CuaTab. Persistent QuickJS, MCP stdio, ToolClient/ModelAdapter/AgentLoop and a Chat Completions demo adapter are implemented. Swift supports AX, ScreenCaptureKit, input and clipboard leases; native AX/screenshot execution still awaits TCC permission. Current suite: 18 passed, 1 native live fixture skipped. Live-model reasoning, complete cancellation, native pointer/scroll, broad custom-editor paste and compatibility remain outstanding. Increment sections below record historical checkpoints, not current aggregate counts.

See [caller architecture and reproducible demo](AGENT-INTEGRATION.md).

## Additional caller demo requirement

The demo is one consumer, not the platform. Define a ToolClient interface for tool discovery/calls/cleanup, and a ModelAdapter for turns containing tool calls or final text. AgentLoop owns iteration limits/cancellation, while CUA owns target/session authorization and effects. MCP transport must not depend on a particular LLM vendor, prompt loop or botmux. Model credentials belong in the demo adapter, never the CUA service. Test the transport/loop with a deterministic fixture adapter and separately document live-model integration requirements.

## macOS implementation increment

Swift helper and TS provider now implement protocol handshake, application discovery/binding, AX traversal, AXPress and AXValue assignment. SDK/QuickJS/MCP expose optional native targets. Native compilation and discovery/policy/permission-denial tests pass. Local TCC reports both Accessibility and Screen Recording false; real AX observation/actions remain unverified. The opt-in fixture gate is skipped by default and explicitly fails without Accessibility when invoked. Native screenshots/keyboard/scroll/drag remain unimplemented. See [native guide](NATIVE-MACOS.md). Latest suite: 5 passed, 1 native action fixture skipped.

## Browser correctness increment

Installed isolated-world revision tracking before AX capture; validates DOM, form properties, open shadow roots and viewport/scroll state. Coordinate clicks re-check screenshot pixels. Frame clicks map through every parent owner and reject overlays, including nested cross-site frames and simple scaling. Long click cancellation releases input and reports ACTION_OUTCOME_UNKNOWN. Real browser regression tests pass; latest suite is 7 passed, 1 native-action fixture skipped. See [behavior and remaining limitations](BROWSER-CORRECTNESS.md).

## Browser advanced input increment

Added exact text selection with prefix/suffix disambiguation, modifier click, held key chords and screenshot-based pointer drag; exposed through persistent JS. Real Chromium tests verify resulting content, event modifiers and drag coordinates. Latest suite: 8 passed, 1 native fixture skipped. Clipboard paste, selectionType variants and HTML5 drag/drop remain incomplete; this is not full target compatibility.

## Native screenshot increment

Implemented ScreenCaptureKit single-window capture, explicit multi-window selection, PNG metadata and combined AX/screenshot validation, connected through SDK and persistent MCP JS. Swift builds without actor-isolation warnings. Permission denial tests pass; actual PNG content/coordinates are NOT verified because Screen Recording remains ungranted. The dedicated screenshot fixture gate is opt-in and documented in NATIVE-MACOS.md.

## Runtime lifecycle increment

Successful cells drain unawaited host calls; MCP cancellation/reset interrupts pending execution. SDK generation checks and signals prevent late authorized creates from crossing reset. Old bridge callbacks cannot emit into a fresh VM. Added cross-generation host concurrency limit, UTF-8 output quota and closed-session guards. Regression tests include real delayed authorization and real stdio cancellation. Latest suite: 11 passed, 1 native fixture skipped. See RUNTIME-LIFECYCLE.md for remaining isolation/cancellation limits.

## Existing Chrome extension increment

Implemented MV3 TypeScript extension, per-tab/origin user consent, Native Messaging host, authenticated local socket bridge, minimal BrowserDriver contract and ExtensionProvider integrated with Cua and optional MCP configuration. Real disposable Chromium profile test verifies native messaging, AX, PNG, shared CuaTab click, consent revocation/cross-origin navigation and preserving user tabs after SDK shutdown. Latest suite: 12 passed, 1 native fixture skipped. Existing user profiles were not modified. Complex extension frame/input/reconnect behavior and full compatibility remain outstanding; see CHROME-EXTENSION.md.

## Native input increment

Added per-process Unicode keyboard events, common native key chords, AX selected text range and advertised secondary actions, exposed through SDK/runtime. Native input reports dispatched rather than observed success. Swift builds; permission-free helper checks validate surrogate boundaries and key flags. Live fixture gate includes Chinese/emoji and replacement but remains unverified without Accessibility. Latest suite: 13 passed, 1 native fixture skipped. Native key holds, coordinates/drag/scroll and clipboard remain incomplete.

## Clipboard paste increment

Added a host-replaceable ClipboardBackend, Swift NSPasteboard preservation/conditional restoration and browser text/HTML/Markdown paste. Real headed browser tests verify trusted events and actual resulting text/rich formatting; named-board tests verify binary formats and preserving newer copies. Headless testing exposed a different clipboard, so automatic native clipboard wiring is restricted to headed managed browsers and extension tabs. MCP/demo exposes the headed setting. Current suite: 16 passed, 1 native fixture skipped. See [clipboard protocol and limitations](CLIPBOARD.md).

## Native paste and write-timeout increment

Added MacApp.paste through SDK/QuickJS/MCP, shared format conversion, a focused AX editor verifier and clipboard restoration after verification. Textual AX selection boundaries use UTF-16; timeout/no change is uncertain and not replayable. The helper transport now classifies all writing RPC timeouts as ACTION_OUTCOME_UNKNOWN. Swift builds; pure native Unicode checks and real stalled-process timeout tests pass. Full suite: 18 passed, 1 native live fixture skipped. Actual native paste remains unverified without Accessibility; arbitrary custom editors and formatting verification remain outside the implemented subset, not outside the full goal.

## Source reconstruction: document responses

Restored Xh/Mc/su/Yre as readable `@core/browser` document response capture, including request interceptor management and Fetch response ownership. Validation: 174 differential tests pass, TypeScript checks pass. Uses a CDP dependency contract; production backend and complete context assembly remain outstanding.

## Source reconstruction: download state machine

Restored pg and its source-origin/content-header helpers under `@core/browser`. Preserves authorization and HTTP/blob state transitions, host completion correlation and cleanup ordering. 178 tests pass with type checks. Host/security interfaces remain dependencies; production backend and full AgentLoop are not complete.

## Source reconstruction: asset content retrieval

Restored loaded-resource and authorized page-fetch fallback functions, preserving error boundaries and binary serialization. 180 tests pass. Resource enumeration and full bundle orchestration are still pending; no live asset download is claimed.

## Source reconstruction: discovery and asset bundle orchestration

Restored resource/SVG discovery and the page-assets inventory/bundle class, connected to reconstructed asset fetch. 184 tests pass with type checks. Preserves serialized per-origin fallback approval and denial cleanup. Telemetry is injected; production filesystem/provider/security and full context assembly are still outstanding.

## Real Chromium asset integration validation

Added and passed `reconstruction/page-assets-browser-smoke.ts`: actual DOM snapshot, performance entries, inline SVG, cached and fallback resource retrieval, exact on-disk bytes/manifest, per-origin approval reuse, denial suppression and directory deletion. Isolated loopback HTTP server and browser close in finally; temporary files are removed. This validates reconstructed asset components with a test CDP adapter, not the production backend or AgentLoop.

## Source reconstruction: network config composition

Restored managed/local network merging and constraint construction. 186 tests pass with type checking. Origin parser remains an explicit dependency; this is configuration composition, not a completed policy engine or full preferences class.

## Source reconstruction: origin patterns

Restored origin/hostname pattern parsing and matching and connected the parser to network constraint construction. 189 tests pass with type checks, including real canonicalization collisions. Full preferences and backend policy execution remain incomplete.

## Source reconstruction: origin policy resolution

Restored origin-level permission merging and network denial evaluation over reconstructed parsing/config modules. 192 tests pass with type checks. Persisted permissions, guardian logic and full preferences/context assembly remain incomplete.

## Source reconstruction: persisted permission storage

Restored permission table read/update/matching and snapshot refresh error semantics. 196 tests pass with type checks. Store backends are injected; prompt policy/guardian orchestration is still incomplete.

## Source reconstruction: preference context and cache

Restored request metadata/session/turn resolution and original turn + guardian-v1 caches. 199 tests pass with type checks. Guardian-v2 and full decision/orchestration remain incomplete.

## DeepSeek caller integration

Added independent `@core/agent-loop` demo with DeepSeek model adapter and configurable MCP transport. 201 tests pass including real MCP stdio + mock-model loop; package type check passes. Model credential never enters tool arguments or child-server environment. Live DeepSeek call remains pending a credential location; reconstructed production CUA backend remains incomplete.

## Source reconstruction: guardian origin cache

Restored guardian-v2 approval/review caching, revocation and cleanup scheduling. 204 tests pass with type checks. Guardian decision execution and full preferences orchestration remain incomplete; live DeepSeek verification still awaits credential location.

## Source reconstruction: prompt results

Restored user/guardian prompt outcome handling and connected policy, persisted storage and caches. 206 tests pass with type checks. Full Preferences and live approval backend are still incomplete.

## Source reconstruction: automatic permission decisions

Restored the Preferences automatic-answer method over existing policy/table/cache modules. 208 tests pass with type checks. Full class assembly and production backend remain outstanding.

## Source reconstruction: Preferences assembly

Complete lu class is assembled over restored helpers; class shape and prompt/decision flows match the installed source in differential tests. WebMCP/history/full-CDP/OTP checks restored. 211 tests pass with type checks. Real config/approval host and execution context remain pending.

## Source reconstruction: credential observation

Restored the full C_ gate and TB shared registry plus credential broker initialization/resumption and observation leases. Preserves cross-browser invalidation, protected loader tracking, ordinary/private manual-save continuations, 64-document boundary and redacted provider failures. 216 tests pass with type checks. Tests use injected CDP/broker fixtures; real credential broker, full authority/security layer and execution-context integration are not complete.

## Source reconstruction: authority builder and gate policy

Restored bf, DX/OX, wa and URL/security-mode gate helpers. Differential tests verify gate order, deduplication, MCP App branches, synchronous/rejected/approval failures, specialized URL errors, log records, and waiting for policy/preparation before approval callbacks. 221 tests pass with type checks. Providers are fixtures in these tests; full yf security facade, approval preparation and production context remain incomplete.

## Source reconstruction: approval runtime and capability preparation

Restored PB/RB/IB/hf/kB/ho/tr/sn/Tr/ba/nt and LB/I_/WB. Preserves weak identity timing, audit failure isolation, guardian decision interpretation, persisted-denial precedence, preparation versus prompting, localization and persistence-before-decision ordering. 225 tests pass with type checks. Differential tests use injected preferences/elicitation fixtures; origin/asset/WebMCP preparation, full security facade and live host remain incomplete.

## Source reconstruction: resource approval preparation

Restored GB/VB/zB/KB/MX/k_ over the shared approval runtime. Differential tests cover source-origin comparisons, permission reuse/denial, localized asset prompts, WebMCP list/invoke branches, invalid origin/input, sanitized URL metadata, and original sparse-array/non-plain-object validation semantics. 228 tests pass with type checks. Live approval host, origin review coordination and full security/context assembly remain incomplete.

## Source reconstruction: origin review orchestration

Restored NB/FB/HB/kX/MB/BX/gf/OB using reconstructed approval and guardian-cache modules. Differential tests cover v1/v2, saved decisions, bypass, policy changes, revoke/retry, shared guardian/cancel outcomes, independent user decisions and cache-identity changes during async permission reads. 231 tests pass with type checks. Real approval service, site-status checks and full security/context assembly remain incomplete.

## Source reconstruction: site-status provider

Restored D_ and request/backend/fetch helpers, retaining the original background fetch even on cached/inflight hits, 24-hour expiry, winning-request cache ownership, swallowed fetch errors in checkUrl and propagated request-construction errors. 235 tests pass with type checks. Engine-generated TypeError operand text is normalized for renamed identifiers in differential tests. Actual backend authentication, full yf facade and production execution context remain pending.

## Source reconstruction: full browser security facade

Assembled yf with all gate providers, original constructor/prototype shape, authority builder wiring and post-approval page URL check. Tests compare the exact original facade over the same restored dependency providers, whose own source differential tests remain in the suite. 238 tests pass with type checks. This proves facade assembly, not complete production host integration; input/AX/Playwright execution, overall context and actual authenticated backends remain pending.

## Source reconstruction: input class and mouse operations

Restored cg/UF/Zv/Xy/Ve with original constructor/method shape, mouse dispatch, quad fallback, wheel/gesture scroll, nested click targets, duration/abort handling and drag cleanup. 242 tests pass with type checks. Differential tests bind explicit Os/cS/ru fixtures to both original and reconstructed classes; their real keyboard/DOM/shadow implementations and full production context remain pending.

## Source reconstruction: DOM state and node targeting

Restored shared DOM snapshot/reference state and isolated execution contexts with original cleanup, FIFO cache bounds and one stale-context retry. Restored input/top-level frame transforms and cS node resolver including executable page geometry expression. 247 tests pass with type checks. Tests use CDP fixtures and isolated JS contexts; actual DOM snapshot generation, keyboard/shadow input protection and production input assembly remain pending.

## Source reconstruction: keyboard map and chord parsing

Restored original static keyboard definitions and readable map builder, key normalization, platform modifiers, editing commands and clipboard shortcut restrictions. Tests compare all map entries and alias identities plus every modifier subset for clipboard/editing keys. 250 tests pass with type checks. Key-down/up dispatch and input protection have not yet been assembled.

## Source reconstruction: keyboard event dispatch

Restored gl/Os/Ky/zA/Ep/zy/hl/A5 over reconstructed key mappings. Differential tests cover nested sessions, input-target tokens, modifier state, text suppression, Unicode insertText fallback, abort/release failure and protected versus ordinary cleanup differences. 253 tests pass with type checks. Vy focus protection is injected explicitly in this stage; real protected input and overall production context remain pending.

## Source reconstruction: protected input assembly

Restored ml/Vy/jA/HA/Gy/ru/Oc/Nv/pre/mre/fre/U2, then assembled cg with reconstructed keyboard and DOM resolver dependencies. 256 tests pass with type checks. Isolated real Chromium/CDP smoke proves ordinary input changes and closed-shadow keyboard/pointer rejection without changing protected input. Smoke uses test UI and page-load adapters and a single-frame fixture; it is not complete host/native/multiframe end-to-end verification. DOM snapshot generation and full execution context still remain.

## Source reconstruction: AX text events and input target tokens

Restored GA/fl/WA as readable text_input.ts, retaining strict token enablement, UUID preference/counter fallback, complete prevalidation, CR/CRLF normalization, first-character key pairing, editing commands and original cancellation/error boundaries. 259 tests pass with type checks. Extended isolated Chromium/CDP smoke verifies Chinese/emoji, newline and tab insertion. The AX provider and actual host token enforcement are still pending; passing dispatch tests does not establish complete AX integration.

## Source reconstruction: accessibility WebAssembly JavaScript bridge

Restored Hre/Wre/Vv/$re/zh with readable types: compressed-file and in-memory WASI loading, environment validation, ABI export validation, UTF-8 and native allocation cleanup, finalization, runtime-bound revisions, full/diff rendering and element identity/settable lookup. 262 tests pass with type checks. Differential tests run original and reconstructed JS against the same installed native binary and verify rendered prompt revisions and changes. This restores the JS bridge, not the native rendering algorithm: browser-accessibility.wasm.br remains a local test dependency, is not distributed in this repo, and the default adjacent asset is not currently packaged. Full AX provider integration and an independently reconstructed renderer remain outstanding.

## Source reconstruction: AX page value setter

Restored G2 as readable setElementValue: native checkbox/radio/select/text/color setters, editable content, ARIA tab click fallback, writable checks, input/change events and original post-mutation validation. 263 tests pass with type checks. A real isolated Chromium differential test compares original source and reconstruction across 35 scenarios, including value rollback, unchanged values, disabled/readonly controls, ambiguous select labels and focus/input handlers invalidating the target. This is the page-side function; full AX dispatcher, target resolution and host integration remain pending.

## Source reconstruction: AX selection helpers

Restored Nre/Fre/Lre: text/cursor selection with prefix/suffix disambiguation and UTF-16 DOM offsets, option activation routing, picker-close checks and injected select helper integration. 265 tests pass with type checks. Isolated Chromium differential tests cover 36 text/cursor combinations and ten select routing/failure scenarios. Text ranges are real browser operations; injected Playwright selection helpers and picker-open transitions use explicit fixtures. The Playwright service and AX target/dispatcher assembly remain pending.

## Source reconstruction: AX remote element execution

Restored Oo and Ire: backend-node resolution, serialized page function invocation with userGesture, exception precedence, remote-object release and value-setting click/recheck fallback. 268 tests pass with type checks. Differential tests compare original call traces and failure behavior; isolated real Chromium CDP composes the restored executor, value setter and UTF-16 text selection. Ire still requires the full $v click dependency explicitly, and target lookup is supplied by a fixture in integration tests; full AX provider assembly is not claimed.

## Source reconstruction: AX action coordinator and dialog race

Restored nu/Gh: dialog event subscription before state inspection, race/error handoff, beforeunload filtering, listener cleanup, per-tab tracked input serialization and interruption abort messages. 270 tests pass with type checks. Differential tests compare original asynchronous traces for existing/new/foreign-tab dialogs, operation failures, queued input and aborted pending actions. Tre/Cre dispatch implementations remain explicit dependencies; tests use controlled fixtures, not a complete browser-dialog end-to-end integration.

## Source reconstruction: AX dialog actions and close command

Restored Cre/Do/Mv/F2/cre/dre/lre: prompt editing, accept/dismiss mappings, target checks, held-input rejection and closing-event/dispatch races. 274 tests pass with type checks. Differential matrices cover actions, dialog types, target errors and command failures; a real isolated Chromium/CDP prompt accepts appended Chinese text. The initial smoke failed because Playwright auto-dismissed the dialog; registering a dialog listener lets the reconstructed CDP handler control it, and the rerun passes. State/event adapters remain explicit test code, and full AX context assembly remains pending.

## Source reconstruction: AX programmatic activation and scrolling

Restored Bre/Dre as standalone serializable page functions. Activation preserves enclosing-control/label/editable resolution, native click versus preventScroll focus, readonly/disabled/detached checks and shadow-root focus verification. Scroll invokes the native prototype method. 276 tests pass with type checks. Isolated Chromium compares 14 activation scenarios with the original function; real CDP execution verifies scrolling and instance-method bypass. Full AX click geometry, input preparation and dispatcher assembly remain pending.

## Source reconstruction: AX page hit testing

Restored Ore/Mre: viewport-clipped point choice, text range geometry, deepest open-shadow hit, composed slot/host ancestry, interactive-control conflicts, label fallback and frame-owner coordinate conversion. 278 tests pass with type checks. Real isolated Chromium compares original/reconstructed page results across occlusion, offscreen/clipped controls, labels, nested controls, text, shadow/slot nodes and frame-owner mapping. Wv/V2 cross-frame target assembly and click stabilization remain outstanding.

## Source reconstruction: AX cross-frame target geometry

Restored Wv over the reconstructed page executor, hit tests and quad/frame helpers. Preserves separate input-target and top-level points, same/remote-session transforms, IAB border/content boxes, label fallback and first occluding ancestor. 279 tests pass with type checks. Differential traces cover both backend modes, nested frames, missing frame/owner/bounds and occlusion through explicit CDP/page fixtures. Real multi-frame end-to-end execution and V2 stabilization remain pending.

## Source reconstruction: AX scroll positioning and stabilization

Restored V2/ou/Sre/xre/Ere over the reconstructed geometry/execution/page functions. Preserves initial/after-scroll fast paths, native layout-error wrapping, center-scroll fallback, 25 ms polling, 500 ms deadline and 0.5 px stability threshold. 281 tests pass with type checks. Differential traces use controlled time; real isolated Chromium moves an offscreen root-frame target into view via the restored chain and agrees with original V2. Full multi-frame end-to-end clicks and dispatcher assembly remain pending.

## Source reconstruction: AX input preparation and activation navigation

Restored Hv/Are: absent-target input, target resolution, 3000 ms editable focus preparation, abort/error wrapping, navigation listeners started before programmatic activation, nested target/main-tab waits and deferred failure tracking. 283 tests pass with type checks. Differential tests use original AST over restored page execution and explicit focus/load fixtures; full Playwright focus implementation and production AX state remain pending.

## Source reconstruction: AX coordinate targets and scroll dispatch

Restored ar/kre/Vh/Pre: finite coordinate validation, visual viewport bounds, node/point target routing, direction aliases, 100px page-size floor and mouse-move-before-wheel order. 285 tests pass with type checks. Differential tests cover fractional/boundary inputs and direction/page combinations using explicit CDP fixtures over restored node positioning; full action dispatcher and actual scrolling integration remain pending.

## Source reconstruction: AX click assembly

Restored $v/Rre and assembled Ire with the real reconstructed click path. This joins closed-shadow/ancestor protection, option routing, positioning, native activation fallback, modifier-key holding, target revalidation and deferred page loads. 288 tests pass with type checks. Original $v runs over the same restored helper implementations for real isolated Chromium comparisons: normal/coordinate/right/Shift clicks, hidden-element fallback, closed-shadow rejection and abort. Option dispatch uses an explicit Playwright fixture, and UI/load/AX state adapters remain test-only; full multi-frame production context and Tre dispatcher are pending.

## Source reconstruction: AX page action dispatcher

Restored Tre and assembled Gh/Tre/Cre through createAxActionService. Joins click/drag/secondary/type/paste/keypress/scroll/select/set-value branches, preserving duration conversion, eight-step drag interpolation and held clipboard-shortcut rejection. 290 tests pass with type checks. Original dispatcher comparisons use the same restored helpers with explicit context fixtures; clipboard Zy/oo operations remain mandatory injected dependencies, not no-op defaults. Full virtual clipboard page protocol, Playwright service and AX state/host integration remain pending.

## Source reconstruction: virtual clipboard focused-frame traversal

Restored q5/j5, preserving the exact readable embedded page expression, initial target identity, remote-frame attachment, isolated-world fallback, cycle key and object-release behavior. 292 tests pass with type checks. Original AST differential traces cover nested/remote/isolated targets and errors using explicit CDP fixtures. Clipboard operation orchestration and page protocol remain pending.
