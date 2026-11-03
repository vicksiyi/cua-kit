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

## Source reconstruction: virtual clipboard page execution protocol

Restored yl/U5/no/Ms: install bridge before page execution, exact serialized async wrapper, optional execution context, result/error protocol and credential field policy. 295 tests pass with type checks. Differential traces cover result and exception precedence; isolated JS evaluation validates async return/throw behavior with structured-clone transport simulation. Cp page clipboard logic and cut commit/orchestration still remain.

## Source reconstruction: virtual clipboard page operations and cut commit

Restored Cp/KA as self-contained serializable page functions: native DOM getters, recursive focus, credential filtering, text/HTML/binary transfer, paste fallback and deferred cut commit. Real isolated Chromium compares 25 scenarios directly with original AST, including stale selection, canceled beforeinput/paste, wrong/reused/invalidated cut tokens, password protection, rich text and open shadow roots. Type checks and all 296 reconstruction tests pass. Host orchestration Zy/oo, production clipboard/AX assembly, native services and complete end-to-end execution remain pending.

## Source reconstruction: virtual clipboard orchestration and AX defaults

Restored Zy/oo: shortcut interception, exclusive operation queue, focus before clipboard access, plain-text filtering, page execution and host-write-before-cut-commit. AX page/action service factories now default to these reconstructed operations while retaining explicit injection for testing. All 298 tests and type checks pass. Fourteen isolated Chromium scenarios compare original orchestration/page functions through shared reconstructed focus/execution helpers and the actual reconstructed store; the page bridge is an explicit fixture. A separate real Chromium AX default dispatcher test cuts and pastes successfully. Full production bridge/context assembly, AX state manager, Playwright service and native services remain incomplete.

## Source reconstruction: AX snapshot metadata and navigation helpers

Restored j2/Bo/gre/bre: DOMSnapshot attribute projection, credential classification, closed shadow ancestry including slot transitions, viewport-relative bounds and inclusion of protected ancestry outside the requested node set. Restored Lv/$h/Lr/Uv/W2/jv/$2: navigation resets, target/document identity, cycle-safe frame depth, sparse-capture retry and readiness heuristics. Type checks and 302 reconstruction tests pass. Real Chromium snapshots and synthetic sparse/duplicate data are compared directly to original AST; navigation tests cover thresholds, URL equivalence and transitions. Kh state/capture manager and AX tree normalization remain pending; these helpers do not yet constitute a complete AX capture engine.

## Source reconstruction: AX tree conversion and synthetic dialogs

Restored hre/Fv/H2/yre/wre/qv/ko/_re/vre and q2. Converts raw AX nodes with reconstructed DOM metadata, preserving ignored-node ancestry, credential redaction, closed-root references, supported properties, frame-local/global relation indexes and UTF-8 identity lengths. Synthesizes JavaScript dialog controls with original roles, focus and identities. Type checks and all 305 tests pass. Real Chromium AX trees compare directly to original functions; synthetic fixtures exercise missing metadata/owners, protected relations and cross-frame offsets. Dialog matrix compares all four types and URL/title/prompt variants. Kh capture/state manager is still pending; full production and native integration remain incomplete.

## Source reconstruction: AX session state, events and capture commit

Restored the state/event/commit portion of Kh plus iu/zre in AccessibilityStateStore: session maps, provenance, navigation and frame invalidation, dialog revisions, stale element checks, deferred errors and capture commit ordering. Type checks and all 308 tests pass. Differential tests instantiate the original full Kh class and compare event/state traces, navigation rollback, capture/session/document mismatch, instruction callback failure after state mutation, listener cleanup and first-error consumption. The restored module is deliberately marked partial: Kh tracking, navigation waits, candidate construction and capture execution are still pending, and production context assembly is not complete.

## Source reconstruction: AX initialization, action tracking and waits

Restored the tracking/action/wait portion of Kh over AccessibilityStateStore, plus K2/Ji: initialization guarded against document/navigation races, dialog interruption, target enable tracking, action completion, navigation/paint/AX quiet polling and document probing. Type checks and all 311 tests pass. Original Kh comparisons cover initialization failures/races, repeated tracking, prompt actions, evaluation failure and controlled-clock polling thresholds/updates/timeouts. CDP and clock dependencies are explicit test fixtures. Candidate building and the capture loop remain pending; the full AX manager and production/native integration are not yet complete.

## Source reconstruction: AX remote sessions and frame documents

Restored Kh.captureSessions/captureDocuments and Kre/Xre: remote iframe discovery, 1000ms traversal/500ms operation budgets, target-parent verification, AX enabling, session/frame ownership, parallel document AX collection, metadata, owner bounds and ordered child warnings. Root errors propagate. Type checks and all 314 tests pass. Eleven traversal and seven document fixtures compare original method traces; real isolated Chromium same-origin iframe capture compares actual nodes/metadata/owners/sizes. Remote cross-process execution is fixture-covered, not yet a real production end-to-end claim. Candidate/revision building and the capture loop remain pending.

## Source reconstruction: assembled AX capture manager

Restored the remaining Kh methods and assembled AccessibilityCaptureManager over state/tracking/document/tree modules: AX and dialog candidates, revision building, screenshot/dialog race, sparse-result retry, navigation stabilization and commit loop. Z2/Q2/Vre preserve shared lazy runtime loading. Type checks and all 317 tests pass. The full original Kh and restored manager agree on real isolated Chromium with a same-origin iframe, using the installed WASM and an explicit test CDP adapter: initial/diff/full capture, target resolution, screenshot-only fast path and stale provenance. Additional differential tests cover retries/final failures and dialog output modes. Native WASM bytes are still a local installed dependency, not reconstructed or published; production service/context, Playwright and native App integration remain incomplete.

## Source reconstruction: AX command handlers

Restored z2/eF command entry points over reconstructed AX/screenshot code. Preserves authority checks before and after observation, tab following before action, specific action-error enrichment, one stale-capture retry and session checks around reauthorization. Type checks and all 319 tests pass. Differential command traces cover authorization failures, validation, stale retry limits/session changes, screenshot callback and error cause/message. These handlers are ready for the production registry/context assembly, which remains pending along with Playwright/native integration.

## Source reconstruction: Playwright execution context state

Restored ig execution-state methods and Fo/ng/og/ot/Sne/Ene/xne/Tne: readonly context identity and invalidation retries, 20-entry completed-context eviction, 50-world FIFO eviction, isolated-world evaluation, event cleanup, forDocument prototype sharing and CDP fallback. Type checks and all 323 tests pass. Original class comparisons cover concurrent creation, stale errors, cache and event sequences; real isolated Chromium confirms world reuse and separation from the main world. Full ig selector, injection and action behavior remains pending; this is explicitly a partial Playwright reconstruction.

## Source reconstruction: Playwright node execution and remote handles

Restored ig.withPlaywrightNode/evaluateOnPlaywrightNode/frameIdForElementObject/releaseRuntimeObjects and oS/No/wF. Preserves isolated-world setup order, document-bound handle checks, serialized callback protocol, exception precedence and independent 100ms cleanup budget with duplicate suppression. Type checks and all 325 tests pass. Differential fixtures cover request/error/cleanup ordering; real Chromium iframe tests resolve a node, evaluate in its isolated world and recover its owner frame. Injection remains an abstract dependency; browser tests explicitly use functions that do not require the injected helper. Full selector/injection/action and production integration remain pending.

## Source reconstruction: Playwright injection and recovery

Restored ig injection/evaluation/recovery methods plus vne/eg/gF/vF/SF/Pne/nS/Mo/Ane behavior over restored execution state and node cleanup. Preserves deadline-adjusted CDP timeout, install caching, missing-helper/context-destruction distinction, targeted invalidation and single recovery attempt. Type checks and all 327 tests pass. Eighteen original-class recovery traces and real Chromium installation/selector/credential/recovery checks pass. The real-browser test supplies original hF from the local installation: its helper body is not yet reconstructed or published, and remains a required constructor dependency. Full selector/action service and production/native integration are still incomplete.

## Source reconstruction: Playwright focus and locator retry

Restored Qv/sg/eS/EF, _F and ig.focusNode, assembling real node execution, injection, input token creation and retry timing. Preserves ancestor visibility/state checks, retarget/select/focus order, token property descriptor, terminal error detection, timeout/deadline distinction and retry telemetry. Type checks and all 330 tests pass. Controlled-clock retry comparisons plus nine real Chromium page-focus cases and an assembled isolated-world focus/token check match original. Installed hF remains required for the browser tests; selector-based focus/fill and the remaining service are still incomplete.

## Source reconstruction: Playwright page selector scope

Preserved original already-readable au and ig.selectorScopeFunctions as serialized source in selector_scope.ts. Includes visible fallback/strict selection, parsed capture slicing, same-origin helper/window traversal, frame geometry and pointer-coordinate transforms. Type checks and all 333 tests pass. Exact generated-source equality plus real Chromium tests cover ten selector/frame cases, sandbox rejection, nested iframe traversal, geometry and hidden frames. OOPIF host routing, selector service assembly and readable hF reconstruction remain pending.

## Source reconstruction: Playwright iframe target routing

Restored ig.frameRouteForFirstOopif/frameIdForFrameMatch/targetForFrame plus qc/rg/Rne/Ine/iS/kne/Bne in frame_routing.ts. Preserves frame auto-attach, readable page discovery/size code, parallel metadata and DOM description error precedence, URL/name matching, local URL/cached world fallback, frame-chain replacement and finally cleanup. Type checks and all 336 tests pass. Eighteen original-class scenarios compare returned values and exact call/expression traces; real Chromium sandbox iframe verifies actual discovery, bounds and release with an explicitly supplied same-target fallback. Real attached OOPIF end-to-end integration, resolveSelectorTarget orchestration and full hF readable reconstruction remain pending.

## Source reconstruction: Playwright selector execution assembly

Restored ig.evaluateOnPlaywrightPage/resolveSelectorTarget/nodeForResolvedSelectorTarget/frameIdentityForResolvedSelectorTarget/evaluateSingleSelectorWithTarget/evaluateSingleSelectorInResolvedTarget/evaluateSelectorAllInTarget and tS in selector_execution.ts. Preserves recursive document-only frame restriction, iterative target routing, callback serialization order, page telemetry/isolated-world choice, single/all selector page protocol, node cleanup and frame identity. Type checks and all 339 tests pass. Six orchestration scenarios and ten exact execution/error traces match original; real Chromium compares root/missing/same-origin iframe single/all/node/identity operations, main/isolated page evaluation and document-only restriction. Readable callback names/positions intentionally change error stack frames; error text is compared separately. Tests still load installed hF; full locator action service, real attached OOPIF integration, readable hF and production/native assembly remain incomplete.

## Source reconstruction: Playwright locator node binding

Restored ig.resolvePlaywrightSelector/resolvePlaywrightSelectorNode/withBoundPlaywrightSelector in locator_binding.ts over the assembled selector execution stack. Preserves timeout normalization, independent selector-node retry loop, terminal errors and causes, root isolated-world choice, telemetry, validation after handle acquisition, non-writable/non-enumerable prototype-scoped binding and final handle release. Type checks and all 342 tests pass. Ten controlled-clock resolution scenarios and four validation/action scenarios match original. Real Chromium verifies iframe node binding in an isolated world, prototype isolation, returned element data and inability to reuse the released CDP handle. Installed hF is still required by this browser test; locator evaluation/actions, full hF and production/native assembly remain incomplete.

## Source reconstruction: Playwright locator evaluation entry points

Restored ig.evaluateOnPlaywrightSelector/evaluateOnPlaywrightSelectorWithTarget/evaluateOnPlaywrightSelectorAll in locator_evaluation.ts. Preserves bound selector/tab matching, strict and isolated-world rejection, exact bound callback/frame-chain expression, null argument omission, ordinary selector retry/options/telemetry and collection evaluation. Type checks and all 344 tests pass. Fourteen original-class scenarios compare call traces and source expressions; real Chromium verifies ordinary and bound root/iframe callbacks, collection results and rejection after a bound node is disconnected. Browser tests continue to use installed hF. Input/action preparation, full helper reconstruction and production/native integration remain pending.

## Source reconstruction: Playwright input preparation and state reads

Restored ig.focusLocator/prepareLocatorFill/prepareSequentialInput/readCheckedState/countLocator/readElementState and Dne in input_preparation.ts. Preserves state checks, fill done/needsinput split, label retargeting, focus ordering, target-token descriptors, document/IAB options and first-element state semantics. Type checks and all 346 tests pass. Eighteen original callback scenarios compare state/fill/retarget/focus/token/error order; eight real Chromium scenarios cover text/date fill, disabled/hidden rejection, direct/label focus, sequential markers and checkbox/radio/count/missing state. Browser validation continues to load installed hF. Pointer actions, full readable helper and production/native integration remain pending.

## Source reconstruction: Playwright pointer frame geometry and obstruction

Restored ig.currentTopLevelPointForAction/currentPointInParentFrame/obstructingFrameHitTarget/obstructingFrameBoundaryHitTarget/describeBackendNodeForHitTarget plus li/b5/gp/xF behavior in pointer_frames.ts. Preserves reversed coordinate/boundary traversal, IAB content-box versus content-quads selection, coordinate rounding, owner/frame acceptance, attribute descriptions and original swallowed hit-test errors. Type checks and all 349 tests pass. Geometry comparisons, six mapping scenarios and seven obstruction scenarios match original; real Chromium verifies iframe coordinate mapping and overlay detection in both backend modes. These frame operations require no hF injection. Full pointer action preparation/dispatch, readable hF and production/native integration remain pending.

## Source reconstruction: Playwright pointer action preparation and orchestration

Restored ig.performPointerAction/resolvePointerActionTarget and rS/Cne in pointer_actions.ts. Preserves frame animation/timer fallback, two stable rectangles within ten iterations, state checks before/after stabilization, scroll alignment sequence, center coordinate clamping, frame mapping, force behavior and dispatch/error boundaries. Type checks and all 352 tests pass. Six original orchestration scenarios and ten page-state/stability scenarios match; real Chromium same-origin iframe preparation and supplied CDP mouse dispatch trigger the expected click handler at identical coordinates. The callback dispatch contract is original; full clickLocator integration is still pending. Installed hF remains required by browser tests; OOPIF end-to-end and production/native reconstruction remain incomplete.

## Source reconstruction: Playwright clickLocator and document synthetic click

Restored ig.clickLocator, bF and yF in click.ts over the pointer preparation stack. Preserves button/modifier normalization, synthetic-policy rejection, nested-target physical dispatch fields, pre-document-click callback and synthetic pointer/mouse sequence, hit/document guards, cancellation and focus traversal. Type checks and all 355 tests pass. Twelve routing scenarios match original; six real Chromium synthetic event/focus/cancellation/document/hit/shadow scenarios match, and assembled document-scoped clickLocator triggers the page handler without physical dispatch. Physical CUA click backend is an explicit constructor dependency; browser tests still use installed hF. Full service/context assembly, OOPIF end-to-end, readable hF and native reconstruction remain pending.

## Source reconstruction: Playwright service method assembly

Added PlaywrightService with original ig.prepareReadonlyLocatorAll/selectorsResolveToDistinctElements and static selectorScopeFunctions, assembled over the reconstructed hierarchy. The explicit method-surface audit records all 52 original instance methods and both static members with no missing methods in reconstruction/playwright-service-coverage.json. This is surface coverage, not a proof of full behavior or production completeness. Type checks and all 358 tests pass. Exact generated readonly/identity expressions and options match original; real Chromium verifies distinct/duplicate/missing selector identity and root/iframe readonly collection preparation. Installed hF and the physical CUA backend remain explicit dependencies. Readonly sandbox service, production context/registry, OOPIF end-to-end, full helper and native reconstruction remain incomplete.

## Source reconstruction: complete readonly page expression

Preserved the original already-readable uS/Vne page sandbox as a TypeScript expression builder in service/readonly/expression.ts, with readable credential classification and original kF/qne import guard. Includes full DOM/CSS/range/selection/API wrappers, credential filtering, fixed bindings, intrinsic hardening and bounded serialization. Type checks and all 360 tests pass. Generated source is identical after substituting the readable credential predicate; nineteen independent Chromium isolated-world scenarios compare original results, with explicit assertions for mutation rejection, credential exclusion, array/string/object limits and unchanged main-world DOM/intrinsics. This expression does not require hF, but must run in a managed isolated world. Host readonly execution/recovery/cleanup and command authority integration remain pending; this does not claim a generally proven secure sandbox or complete system.

## Source reconstruction: readonly host runtime and command

Restored Hne/Wne/sS/aS/$ne/PF/RF/ag/CF/$n/IF/Gne/BF/DF/zne in readonly/runtime.ts and AF in commands/readonly_evaluate.ts. Preserves managed isolated-world caching, one page-context recovery, selector retry and one wrong-document invalidation, temporary node bindings, independent cleanup deadlines, non-JSON primitive conversion and authority-before-validation command order. Type checks and all 364 tests pass. Twelve original runtime trace scenarios, primitive conversion, real Chromium page/node/collection/error execution with cache and binding cleanup, and command authorization/result-release checks pass. Selector/collection paths still require the installed hF in tests. Production context and registry wiring, full helper reconstruction, OOPIF end-to-end and native implementation remain incomplete.

## Source reconstruction: locator command handlers

Restored eleven original ug handlers s2/u2/a2/c2/d2/p2/m2/f2/w2/_2/v2 in commands/locator.ts: click/double-click, count, attribute, inner text, enabled/visible, all text contents, text content, structured relative reads and wait state. Preserves authorization and follow-session ordering, special attribute validation order, credential filtering and callback result semantics. Type checks and all 366 tests pass. Eight scenarios per handler yield 88 original comparisons; real Chromium observation handlers verify credential redaction and relative missing results. ReadAll uses an equivalent object method to avoid tsx emitting an out-of-scope __name in serialized collection callbacks. Remaining action handlers and production ug/context wiring are not yet complete.

## Source reconstruction: locator selection, checked state and sequential typing

Restored b2/y2/g2/Qte/Zte/h2 in commands/locator_actions.ts. Preserves authority/follow-tab ordering, enabled checks, select error handling, checked no-op/radio rejection/post-click confirmation, Unicode iteration, per-character focus/token/target identity checks, 50ms inter-character delay and finally token cleanup. Sequential typing uses the assembled original keyboard dispatch implementation. Type checks and all 369 tests pass. Sixteen selection/checked scenarios and seven typing scenarios match original; real Chromium verifies option change, checkbox change, a/Chinese/emoji text and marker removal. Fill/press handlers, remaining registry/context wiring, full hF and native implementation remain pending.

## Source reconstruction: locator press with virtual clipboard and keyboard dispatch

Restored zD/Af in commands/locator_press.ts. Preserves authority/follow-tab order, value and tab validation, focus callback, clipboard interception before native keys and deadline/focus metadata propagation. Uses reconstructed dispatchClipboardKeypress and keyboardDispatch directly. Type checks and all 371 tests pass. Seven original trace scenarios match; real Chromium executes Control+A/C/V and Backspace through the assembled Playwright service, BrowserClipboard and actual reconstructed page bridge, comparing final inputs and clipboard to original. Full fill/text rendering path, production registry/context, full hF and native reconstruction remain incomplete.

## Source reconstruction: text paste plumbing and locator fill

Restored Hs/F9/L9/U9/q9/j9/r_/H9 behavior in input/text_paste.ts and kv in commands/locator_fill.ts. The exact bundled N9 markdown-it renderer is a required explicit dependency of createTextPaste, not replaced with marked or a simplified renderer; its options are recorded but its implementation remains pending. Preserves plain/rich policy, whitespace handling, serialized paste, replace/append and helper-done paths. Type checks and all 374 tests pass. Original policy/whitespace and five paste traces use a declared renderer fixture; five fill traces and real Chromium replace/append/Unicode/date fill pass through reconstructed clipboard bridge/page operations. Plain fill intentionally skips rich renderer/tab policy, as original. Full rich-text renderer, production assembly, hF and native implementation remain incomplete.

## Source reconstruction: network idle lifecycle wait

Restored T2 in service/cdp/network_idle.ts. Preserves root-target filtering, pre-frame-tree event buffering, frame/loader identity resets, blocked navigation and detach precedence, shared CDP deadline, lifecycle enabling and finally listener cleanup. Eight differential scenarios match the installed original; type checks and all 375 tests pass. This test uses controlled CDP events; real CDP network-idle integration and wait command registry wiring remain pending.

## Source reconstruction: Playwright load-state, URL and timeout commands

Restored C2/Bv/nre/ore/A2/I2/P2/ire/R2/sre/Dc/Dv in commands/wait.ts, using reconstructed network-idle and blocked-navigation helpers. Preserves authority-before-validation, complete/interactive readiness, session-only filtering in load/URL predicates, single/double-star URL semantics, main-frame fallback, URL initial-check races, post-URL full timeout and unclamped explicit sleep. Forty-eight original command trace comparisons and glob/frame edge checks pass. Real Chromium verifies URL navigation/load, DOM readiness and networkIdle with the reconstructed event waiter, closing the previous network-idle integration gap. Type checks and all 378 tests pass. Production command registry/context assembly, full injected helper and native reconstruction remain incomplete.

## Source reconstruction: tab clipboard commands

Restored B2/D2/M2/N2 and command identifiers are/ure/O2/Ov in commands/clipboard.ts. Preserves positive-tab validation before authority, observe versus act permissions, bridge installation before serialized store access, text validation before bridge installation and first-plain-entry semantics (base64-only first entry yields empty text). Thirty-six original command traces and real Chromium command/navigator bidirectional text plus rich HTML round trips pass. Type checks and all 380 tests pass. Commands use the reconstructed BrowserClipboard; production registry/context integration remains pending.

## Source reconstruction: tab lifecycle/session and dialog command entrypoints

Restored BN/DN/Fh/MN/NN/k2 (close/create/get/list/name-session/selected-tab) and pF/L2 (get/handle JavaScript dialog). Preserves command-specific validation, lifecycle recording, independent credential observation gate checks per metadata field, selected-tab catch-all fallback, dialog content projection and authority/follow-session ordering. 128 combined original trace comparisons pass; dialog wrapper comparisons share reconstructed Mv as their execution dependency and do not independently re-prove that helper. Type checks and all 381 tests pass. No new real-browser integration claim for these command wrappers. Mark-tab/navigation commands and production registry/context assembly remain pending.

## Source reconstruction: back, forward and reload navigation

Restored FN/LN/UN in commands/history_navigation.ts. Shared readable implementation preserves act authority and follow-session before tab validation, command-specific errors, history edge failures, un-clamped numeric timeout/default 10 seconds, and load listener setup before navigation dispatch. Sixty-three original command traces pass. Real Chromium verifies backward/forward/reload through the reconstructed page-load waiter and listener cleanup. Type checks and all 383 tests pass. URL navigation with credential epoch/document authorization and production registry/context integration remain pending.

## Source reconstruction: URL navigation and document authorization

Restored YN/KN/Nte/XN/Fte/Lte/Ute/qte/Hh/jte/Hte/Iv in commands/url_navigation.ts. Preserves egress authority, document reset ordering, stateful navigation completion, display URL redaction, session/epoch/loader authorization checks, frame-query races, download/detach exclusions and finally abort/listener cleanup. Twenty original command scenarios plus completion predicate comparisons pass; type checks and all 385 tests pass. GD is an explicit required reset dependency: document response lease ownership Tf and Z_ remain unassembled, with no no-op production fallback. Real-browser URL-command integration and production registry/context remain pending. Next source dependency: GD/$D/Tf ownership around source lines 38242–38300 and Z_ around 38428–38750.

## Source reconstruction: credential request matching and lease ownership

Restored uJ/aJ HMAC-based form/ordinary-request matching and Tf/VD/$D/GD lease ownership in credentials/request_matching.ts and lease_registry.ts. Preserves non-exportable HMAC keys, URL/referrer recursive decoding and conservative caps, exact-one form fields, multipart parsing, registry replacement and rollback, and blank navigation before close. Differential matching and five registry traces pass; type checks and all 388 tests pass. The registry requires Z_ as an explicit constructor; actual network interception/quiescence/close implementation remains pending, so the URL reset chain is not yet standalone. Tests use synthetic credentials only. Next: original Z_.navigateToBrowserBlank/quiesceWebsite (38662 onward), then close/start and event/request handling.

## Source reconstruction: credential lease quiescence and teardown

Restored seven Z_ methods in abstract CredentialLeaseCleanup: navigateToBrowserBlank, quiesceWebsite, rejectOrdinaryRequest, close, dispose, stopPausedTarget and stopPausedTargets. Preserves promise identity/retry caches, blank navigation root-frame/loader verification, rejected history reset, protected-target draining, ordered release and ownership-sensitive removal. Seventeen original method trace scenarios pass; type checks and all 391 tests pass. This is the lifecycle portion of Z_, not a complete lease: start, event/request policy, outcome and state assembly remain pending. No new real CDP integration claim. Next inspect constructor/start (38428 onward), result/outcome methods and event/request handler dependencies.

## Source reconstruction: credential lease result and diagnostic state

Restored 15 Z_ result/ordinary-attempt/diagnostic methods in CredentialLeaseResults extending CredentialLeaseCleanup. Preserves first-outcome promise settlement, background versus terminal rejection, phase transitions, 63 ordinary event slots plus a reserved completion slot, saturated counters, shallow diagnostic copy, 5-second timeout caps and cleanup ordering. Twenty-two original state/result scenarios pass; type checks and all 394 tests pass. Remaining lease start and event/request policy are required; this does not establish standalone credential submission. Next source: onTabDetached/onEvent/onRequestResolution/finishCandidate at 38854–39035, then onRequest and Cf/start.

## Source reconstruction: credential lease event correlation

Restored onTabDetached/onEvent/onRequestResolution/finishCandidate and wo in CredentialLeaseEvents. Preserves root versus nested event distinctions, protected target handling, 32-entry network/frame caps, fragment-free URL correlation, POST/loader/reachable-frame confirmation, release gating and separate private/ordinary settlement. Forty-eight event/release combinations, eighteen protection events and two cap/detach scenarios match original. Type checks and all 396 tests pass. Actual credential submission and full lease assembly remain unverified; onRequest and Cf/start are next required dependencies.

## Source reconstruction: assembled credential lease and URL reset chain

Restored Z_.onRequest, Cf/sJ containment, constructor/start; assembled CredentialSubmissionLease from cleanup/results/events/requests layers. Shared credentialLeases now owns original Tf/VD/$D/GD behavior, and NavigateTabUrlCommand uses its resetBeforeNavigation directly. This supersedes earlier pending Z_/GD assembly notes. Fifty original startup/containment/admission scenarios and a synthetic private POST through assembled admission/event/result/cleanup pass. Real Chromium URL navigation with no active credential lease verifies new-loader authorization and listener cleanup. Type checks and all 400 tests pass. Live credential submission, active-lease navigation through the real backend and production provider/context/registry integration remain unverified. Full CUA helper/native and other command families still incomplete.

## Source reconstruction: download and file chooser command handlers

Restored o2/Wh and S2/ere/tre/rre/x2/E2/i2/Jte in commands/downloads.ts and file_chooser.ts. Preserves download setup ordering and 120-second cap, chooser event interception cleanup, tab ownership/nested-target restrictions, upload authority and extension-error conversion, and deletion only on successful file assignment. Forty-four original command traces plus upload-error classification comparisons pass; type checks and all 401 tests pass. Browser-family ks remains explicit dependency for set-files error text. Real file upload/download integration and production command registry remain unverified.

## Integration verification: Chromium file chooser command chain

Closed the real-browser chooser gap with isolated Chromium and a temporary synthetic Unicode file. The reconstructed waiter intercepts Page.fileChooserOpened; set-files verifies observe/act/upload authority order, DOM.setFileInputFiles, page File.name/File.text, chooser deletion and listener cleanup. No remote form submission occurs; temporary files are removed. Type checks and all 402 tests pass. Real download integration, browser-family catalog dependency and production registration remain pending.

## Source reconstruction: raw CDP authority URL helpers and dev log command

Restored Nc/Xv/iF/sne/nne/one/tF/Kv/ine/ane/rne in cdp/raw_urls.ts and dF in commands/dev_logs.ts. Preserves absent versus invalid URL fields, cookie partition targets, redirect Location extraction, parameter-specific capability exclusions and exact original grantUniveralAccess spelling. Dev logs retain authority ordering and public-field projection. Ninety URL helper comparisons, 112 parameter exclusions and four command traces match original; type checks and all 405 tests pass. Full raw command tables Jre/Zre/Qre/ene/rF, nF/oF/tne and sF/aF remain pending; no raw CDP entrypoint completion claim.

## Source reconstruction: raw CDP method admission and Fetch preservation

Restored exact Jre/Zre/Qre/ene data and rF/Mc/Yh/tne/une/nF/oF logic in raw_policy_data.ts and raw_policy.ts. Preserves allowed/blocked domains and methods, original guidance, parameter-sensitive exclusions, URL authority extraction and root-only managed Document response interception. Full catalog equality and method/domain/parameter cross-products match original; type checks and all 407 tests pass. The original-binding test initially exposed declaration-order initialization and was corrected before successful tests. Full sF/aF command assembly with Bs capability gate and schema/dispatch checks is next; this policy alone is not a production raw-CDP entrypoint.

## Source reconstruction: raw CDP command assembly

Restored Bs/Jh/sF/aF in commands/raw_cdp.ts using existing CdpCall/CdpEvents schemas, method policy and URL authority extraction. Preserves backend/env capability gate, observation/action-before-schema order, per-origin full-CDP authority, protection checks both before authorization and at dispatch, document interception setup, target conversion and null-result fallback. 125 original capability combinations and 28 command traces pass; schemas and method policy are shared previously reconstructed dependencies. Type checks and all 409 tests pass. Real raw-command/backend integration and production registry remain pending.

## Source reconstruction: page asset command assembly

Restored OF/MF in commands/page_assets.ts using the existing PageAssets backend. Preserves bundle's captured tab URL before authority and list's current URL authority before tab lookup, plus exact selection projection. Ten original command traces pass. Real Chromium inline SVG discovery, reconstructed backend bundle output and manifest contents verified with a temporary filesystem and approval-call fixture. Type checks and all 411 tests pass. This does not prove remote asset fallback, real permission provider integration or production registry assembly.

## Source reconstruction: DOM input command handlers

Restored AN/Nh/CN/PN/RN/IN/kN/yte/Tv in commands/dom_input.ts. Preserves node schema errors, authority/follow-session ordering, click counts, visual viewport center fallback, array-only clipboard shortcut interception and explicit text-paste dependency. Thirty-five original command traces and 28 node-schema cases pass; type checks and all 413 tests pass. Schema and clipboard helper are shared reconstructed dependencies; type-text tests validate forwarding only. Bundled markdown rendering, real DOM command integration and production registry remain pending.

### 16.126 Coordinate CUA input commands

Reconstructed original ar/Kr/FA/LA/UA/qA/XA/YA/JA/n_ into `service/commands/coordinate_input.ts`: click, double-click, drag, move, scroll, keypress and type factory. Uses existing reconstructed modifier, clipboard and input implementations. Preserves authority/validation order, finite coordinates without clamping, fixed 10-second click deadline, double-click omission of button, empty-path rejection and move's lack of session following.

Validation: 63 original-vs-readable command traces (seven commands, nine scenarios) plus concrete assertions. Reconstruction type checks and all 414 tests pass. This is command-layer evidence, not a new real-browser test. Type requires explicit Hs dependency; bundled markdown renderer, production command registry, native/backend assembly and real DeepSeek credentials remain outstanding.

### 16.127 DOM snapshot command and frame expansion

Reconstructed original e2/t2/Gte and normalization helpers in `service/commands/dom_snapshot.ts`. Includes self-contained page/selector callbacks, iframe ID/name annotations, visible/non-hidden child selection, concurrent ordered recursive expansion, document-only bypass, IAB total 1000ms/per-child 500ms budgets, and exact generic/group/listitem flattening plus unnamed-image removal.

Validation: 11 original command scenarios execute serialized callbacks against fixture DOM/helper; normalization/ref cases and nested-frame/expired-deadline traces match. Type checks and all 417 reconstruction tests pass. The original bundled incrementalAriaSnapshot helper is still a dependency to reconstruct; this does not claim real-browser ARIA snapshot integration. Native/backend assembly, production registry and live DeepSeek remain incomplete.

### 16.128 Visible DOM frame reader

Restored dY/CD/pY/mY/H_/W_/fY/hY/gY/bY/yY/wY/AD as `service/input/visible_dom_frame.ts`. Uses the same reconstructed DomState isolated-world evaluator as DOM input, separates ordinary/reviewer node maps, releases remote objects even if frame description fails, preserves filtering and timeout semantics. The cY/_Y page renderer remains an explicit required dependency; ED/q_/TD aggregation remains outstanding.

Validation: 21 original-vs-readable capture/frame/find traces through actual DomState with fixture CDP, filter boundary cases, serialized reference expressions, timeout and error fallback comparisons. Type checks and all 420 tests pass. No new real-browser visible DOM integration claim.

### 16.129 Visible DOM capture orchestration

Restored SD/xD/ED/q_/TD/j_ in `service/input/visible_dom_capture.ts`: authorized command and reviewer capture, main-document reset, shared public node IDs, recursive frame traversal, credential-frame priority, output caps (200 lines/20000 chars), reserved root limits (150 lines/15000 chars), child clipping/deadlines and attachment fallback. Reviewer captures do not replace ordinary snapshot state.

Validation: 19 original-vs-readable scenarios using actual shared DomState with fixture frame reader; checks limits, ordering, repeated IDs, reviewer isolation, child/root errors and expired budgets. Type checks and all 421 tests pass. The cY/_Y page renderer remains pending; this is not a real-browser visible DOM end-to-end claim.

### 16.130 Visible DOM page collection and real browser assembly

Restored complete original cY/_Y collector and oY/iY/sY/aY option data in `service/input/visible_dom_page.ts`. Preserves viewport clipping, interactive and reviewer classification, shadow traversal, frame discovery, attribute escaping, textarea/text limits, credential redaction, live boolean values, persistent local refs and output budgets. `visible_dom.ts` assembles actual collector → frame reader → capture orchestration with the same DomState used by DOM input; no placeholder renderer remains in this chain.

Validation: 10 original-vs-readable output cases in fresh headless Chromium across ordinary/reviewer, clipping and capacity. Actual assembled command reads a same-process srcdoc iframe and its public node ID drives the real reconstructed BrowserInput guarded click; recapture retains the clicked node ID. Authority, UI and target routing use fixture adapters. Production host and real OOPIF attachment are not claimed. Type checks and all 423 tests pass. Other overall-project gaps remain (full Playwright injected helper, markdown renderer, native backends/production registry and live DeepSeek credentials).

### 16.131 Locator media download command

Restored l2 as `service/commands/download_media.ts`. Preserves permission/lifecycle ordering, currentSrc/src/href precedence and empty-src handling, 120000ms timeout cap, frame identity requirements, blob top-frame restriction, original filename selection, temporary anchor creation/removal and completed download filename return. Uses actual Downloads type boundary; no permissive production lifecycle default.

Validation: 16 original-vs-readable traces execute serialized callbacks and cover source variants, errors, timeout clamps and cleanup. Fresh Chromium blob download verifies Unicode filename, bytes and temporary-anchor removal using fixture selector/download lifecycle adapters; full production Downloads/Playwright helper integration is not claimed. Type checks and all 425 reconstruction tests pass.

### 16.132 User browser commands

Restored Gp/Vp/rR/W9/nR as `service/commands/browser_user.ts`: claim, authorized context read, history query validation/authorization, and open-tab projection. Preserves returned-ID acquisition, original explicit bypassApproval option for context reads, null omission without dropping false/empty metadata, and history's original validation order and non-coercing semantics.

Validation: 32 original command traces, 21 query-validation cases, and assembly with actual ServiceBrowserUser/TabLifecycle for turn reclaim, session isolation and authorized URL mismatch. Providers/authority are test fixtures; no user history or personal tabs were read. Type checks and all 428 tests pass. Production provider/registry integration remains outstanding.

### 16.133 Manual handoff and tab marking

Restored Ic/ON in `service/commands/handoff.ts`. Manual handoff authorizes first, checks filtered browserAuth capability and CDP backend, preserves exact string-valued unsupported-client metadata, validates the tab, gets it and then marks handoff. MarkTab preserves extension-specific upgrade error and cause. Family metadata lookup is an explicit required dependency pending the complete ks/sl catalog.

Validation: 26 original-vs-readable command traces cover backend/capability disabling, malformed metadata, boolean-vs-string client flag, validation ordering and provider errors. Type checks and all 429 reconstruction tests pass. No real user handoff performed; production host/registry integration remains incomplete.

### 16.134 Browser family catalog and command assembly

Restored complete installed dp/HC/WC/si/pp/sl data and ks/ky lookups as readable `service/browser_family.ts`: Chrome, Edge, Brave, Opera, Vivaldi; platform discovery paths; extension distribution/channel metadata with original shared reference identity. Exported MarkTabCommand and PlaywrightFileChooserSetFilesCommand now use the actual catalog, removing those pending family dependencies.

Validation: every catalog field compared to the original expressions; shared channels/distributions, default/unknown/prototype lookups and assembled command guidance verified. Type checks and all 432 tests pass. First full run exposed existing network-idle new-loader test scheduling flakiness at 25ms; success-path test budgets now allow 1000ms while failure/timeout cases retain 25ms, with no production change. Full rerun passed. Catalog is installed-version data, not a claim of runtime discovery or extension installation.

### 16.135 Google Workspace content export

Restored lF/Jv/Qh/dne/pne/mne/fne/hne/gne and format sets in `service/commands/content_export.ts`, reusing existing document URL and filename helpers. Preserves per-document formats, tab query/fragment forwarding, page-world GET, 32768-byte encoding chunks, Markdown data-reference cleanup, mkdir-before-decode ordering, UUID file paths and write-only cause wrapping.

Validation: 14 original command traces, URL/Markdown/binary comparisons, and real Chromium fetch against routed fixture response exporting 70000 binary bytes to temporary disk. No user documents or real Google service accessed. Type checks and all 435 tests pass. YouTube transcript export and production provider/registry integration remain outstanding.

### 16.136 YouTube caption capture and transcript export

Restored hp/c5/d5/p5/Fy in `service/content/youtube_transcript.ts` and cF in `commands/youtube_export.ts`. Preserves observed timedtext selection, subtitle toggling/restoration, player/video identity gates, JSON MIME/length/stream limits, abort/cancel handling, UTF-8 text budgets, timestamps and truncation marker. Export validates captured URL video ID and re-reads the current tab before writing.

Validation: original formatter/filter comparisons including item and byte limits; 12 original page-capture scenarios; five export identity/error cases. Real Chromium PerformanceObserver sees actual routed fixture requests and exports caption bytes to disk while restoring subtitles. No real YouTube service/user page accessed; player/provider/authority are fixture adapters. Type checks and all 439 tests pass. Production runtime, full injected Playwright helper, native backends and live DeepSeek remain incomplete.

### 16.137 Bot detection report command

Restored fF/yne/wne/_ne and Uc/mF metadata helpers in `service/commands/bot_detection.ts`. Preserves authorization before payload parsing, backend projection, nullish URL fallback, hostname-only reporting, exact metadata defaults, and conversation/backend deduplication that records keys before emitter invocation. dt telemetry emission is an explicit required factory dependency; production telemetry bootstrap is still pending.

Validation: 10 original command traces using actual report schema and turn-metadata parser, metadata/hostname cases and deduplication with throwing emitters. Tests use recording emitters and no telemetry network calls. Type checks and all 442 tests pass. Full runtime/provider/registry/native work remains incomplete.

### 16.138 WebMCP frame discovery

Restored uN/Ct in `service/webmcp/frame_discovery.ts`: root/attached target traversal, frame-owner probing, secure origin eligibility, excluded probe subtrees, file URL normalization, attachment identity checks and stable registration snapshot. Preserves original known-owner-error filtering and propagation of unexpected errors.

Validation: 13 original traversal/error traces, 56 secure-origin combinations, and actual Chromium HTTPS frame discovery. Chromium srcdoc frames report securityOrigin `://`; the original rejects them as tool owners while retaining their identity in the snapshot. Tests preserve that boundary and independently verify probe exclusion. Type checks and all 445 tests pass. OOPIF attachment remains fixture-tested; native WebMCP registration/invocation and production runtime assembly remain incomplete.

### 16.139 WebMCP page registry and invocation

Restored embedded xv page runtime in `service/webmcp/page.ts` as a self-contained readable TypeScript factory and script serializer. Preserves native context selection, registry generation/descriptor invalidation, toolchange handling, current-window and opaque-origin gates, invocation revalidation, one/two-argument execution, abort timeouts and closed-shadow probe cleanup. Bundled CommonJS export property descriptors are retained.

Validation: 24 original-script VM scenarios, export descriptor comparison and real Chromium script injection/registration/invocation with a fixture modelContext. The fixture tool changes a button label and toolchange invalidates its old handle. Native browser WebMCP implementation, host-side registry assembly and production OOPIF integration remain unverified. Type checks and all 448 reconstruction tests pass. DeepSeek adapter and mock MCP round trip exist; live model call still requires a located credential.

### 16.140 WebMCP host registry, isolated worlds and execution

Restored kc/dN/lN/Xa/zi/kh/nr/pN/Ev/cN/gte/mN/fN/bte/hN in `service/webmcp/host.ts`, using the actual reconstructed frame discovery and page script. Preserves per-CDP/per-tab state, global generation sequence, event invalidation, deferred crash-workaround frame attachment, observation promise caching/retry, origin permission sharing, isolated world caching, owner validation, file-origin projection, fetch revalidation and dispatch-time stale guards.

Validation: 18 original command traces, 48 event transitions, 25 target identity pairs and real Chromium frame discovery/createIsolatedWorld/Runtime.evaluate. The assembled host/page chain invokes a fixture native tool that changes the DOM and rejects its registration after an invalidation event. WebMCP.enable and document.modelContext remain fixture dependencies; no production native WebMCP support claimed. Type checks and all 452 reconstruction tests pass. The upper capability/security/limits/notification layer, production provider/runtime assembly, full injected Playwright helper and native backends remain incomplete.

### 16.141 WebMCP session catalogs and constrained tool directory

Restored Ya/gN/bN/yN/Ki/Xi/wN/Dh/_N/vN/Yi/SN/Bc/Oh/xN/EN in `service/webmcp/session_catalog.ts`, plus Bh in `tool_directory.ts`. Preserves per-context/tab/session snapshots, clone isolation, notified generations, configuration-denial revocation, round-robin checks, top-level-navigation reset, count/UTF-8 descriptor/change limits, origin reauthorization and denied-origin exclusions from change accounting. The directory uses actual reconstructed host discovery/evaluation and result schemas. Feature flags, config, telemetry and capability/model gate remain explicit required runtime dependencies.

Validation: 11 original session state scenarios; 11 original directory scenarios using fixture CDP and actual restored host; nullish/zero limit overrides and UTF-8 byte sizing. File-origin authority keys use the existing original qe reconstruction, preserving path identity. Type checks and all 455 tests pass. This does not complete production bootstrap, WebMCP invoke/list commands, full Playwright injected helper or native providers.

### 16.142 WebMCP commands and model/capability gates

Restored BA/Ja/tD/uc/rD in `service/webmcp/support.ts` and Mh/TN in `service/commands/web_mcp.ts`. Invoke obtains current-session tool metadata before approval, overwrites caller labels, rechecks capability and registration after approval, emits the invocation notification and accepts only string/null results. List assembles the actual tool directory, host and session snapshot logic. Model filtering precedes capability checks; payload property reads preserve inherited and array fields.

Validation: 14 model/capability combinations, 10 approval payload cases and 13 original command traces; real Chromium full list/approve/invoke chain modifies DOM and uses resolved tool identity. Native modelContext, WebMCP.enable and authority are fixtures. Type checks and all 458 reconstruction tests pass. Feature/config/telemetry bootstrap, global command registry/runtime assembly, full injected Playwright helper and native providers remain incomplete.

### 16.143 WebMCP background notifications and browser notification queue

Restored aA/Wue/_x/i6/s6/$ue in `service/webmcp/notifications.ts` and vx/a6/u6/Gue behavior in `notification_queue.ts`. Notification collection merges page changes, pending generations and externally acquired tabs; preserves 250ms idle polling, per-context poll sharing, bounded stale retry, descriptor comparison, callable-name formatting and rejection of late results. The queue drains/filter events before visibility checks, retains per-source replacement/order, checks visibility again after collectors and applies the final publish gate.

Validation: 15 original collection scenarios using actual restored directory/host/catalog with fixture CDP; event/format comparisons; concurrent poll and deadline tests; seven original queue scenarios. Type checks and all 462 tests pass. Host visibility/publish gates and feature/config/telemetry bootstrap remain explicit required dependencies. Production global registry/runtime assembly, full injected Playwright helper and native backends remain incomplete.

### 16.144 Service command registry and restored factory assembly

Restored the ug/l6 registry in `service/command_registry.ts` with all 75 original export names/order and enumerable nonconfigurable getters. Connects 69 existing implementations directly, preserving original Ax/URL export names. `command_assembly.ts` connects five restored command factories using explicit text-paste, bot telemetry and WebMCP runtime dependencies. BrowserAuthHandoff remains a required supplied command, not a placeholder implementation.

Validation: AST inspection of the installed export table verifies names/order, literal command IDs, getter descriptors and array snapshot behavior. Dispatch through the assembled registry reaches the actual restored CUA typing command with its supplied shared text-paste dependency. Type checks and all 464 tests pass. Registry membership does not establish production runtime completion: browser-auth handoff, runtime/context bootstrap, Markdown renderer, full injected Playwright helper and native providers remain outstanding.

### 16.145 Browser-auth field planning and submission validation

Restored ote/Sv/ite/ate/aN/ste/nN/tN/dte/hte/fte/Th with Ga/Vee in `service/browser_auth/field_plan.ts`. Preserves locator uniqueness boundaries, QR-only requests, split OTP grouping and original reference identity, prompt metadata projection, all-or-none grouped option selection, ordinary credential option version gates, required field checks, UTF-16 value length and null-prototype submission records.

Validation: 30 original field-plan configurations plus locator/QR/option combinations, credential option variants, inherited/unknown fields, exact length boundaries, Unicode values and completion errors. Synthetic data only. Type checks and all 468 reconstruction tests pass. This is a prerequisite of BrowserAuthHandoff, not the completed command: broker integration, checkpoint/revalidation, field inspection and delivery orchestration remain incomplete alongside production runtime and native providers.

### 16.146 Browser-auth page, form and option bindings

Restored Ka/Ch/Va/wv/Qee/_f/RD/Rh/iN/eN/Ih/_v/sN in `service/browser_auth/bindings.ts`. Preserves HTTP(S) page-origin checks, document identity, form target/origin agreement, option bindings, nested intermediate-site checks and stable per-window element identities. Revalidation preserves target-before-origin-before-document error precedence and exact catch/propagation boundaries.

Validation: original page-binding matrix and 12 form/option/selector scenarios; real Chromium frame identity and DOM element probes, including rejection after reload. Browser tests use a fixture selector adapter; actual production OOPIF/provider routing is not claimed. Type checks and all 471 reconstruction tests pass. BrowserAuth field inspection/checkpoint/broker orchestration, production runtime, full injected Playwright helper and native providers remain outstanding.

### 16.147 Browser-auth field inspection and page fill callback

Restored Y_ as self-contained `browser_auth/field_page.ts`, including user-visibility tri-state, focused zero-size OTP representation, label opacity fallback, input retargeting, native HTTPS POST form checks, fill fallback, paste cancellation and prototype value setter/input events. Restored oN/rte/nte/vv/Ah/Ph/QM/tte/za in `field_inspection.ts`, preserving strict versus relaxed checks, submit/options ordering, field metadata normalization and required-state strengthening.

Validation: 12 original host traces and 17 original-callback comparisons in real Chromium using synthetic form fields and fixture injected Playwright helper. OTP cancellation, native form rejection, disconnected inputs and successful DOM changes are asserted. Type checks and all 473 reconstruction tests pass. Full Playwright injected helper, BrowserAuth checkpoint/broker/delivery orchestration and production runtime/native providers remain incomplete.

### 16.148 Browser-auth field delivery and submission origin

Restored vf in `browser_auth/submission_origin.ts` and pte/mte in `field_delivery.ts`. Preserves prototype form/submitter lookup, HTTPS and optional POST checks, fragment removal, OTP digit dispatch versus text fill, per-field bound revalidation, final-field submission URL capture, uncertain-fill diagnostics, verified-submission short-circuit and reinspection retry. Default dependencies use actual restored pressLocator and submission-origin implementations.

Validation: 13 original delivery traces and 20 Chromium submission-origin comparisons. Default plain-field delivery uses the restored page callback to modify actual Chromium DOM through fixture binding/injected helpers. Only synthetic values used; real OTP key delivery, full checkpoint/broker integration and production provider routing remain unverified. Type checks and all 475 reconstruction tests pass. Overall runtime/native/injected-helper work remains incomplete.

### 16.149 Browser-auth submission polling and real OTP dispatch

Restored lte/cte/zee/Kee in `browser_auth/submission_status.ts`: missing control/state changes, one-second deadline, 50ms polling and second page-origin check before reporting submitted. Locator probe errors remain inconclusive; CDP page errors propagate as in the installed implementation.

Validation: 48 original control combinations and 10 deterministic original polling traces. Added real Chromium default OTP delivery through restored pressLocator/keyboard dispatch: eight actual CDP key events fill four synthetic inputs; subsequent control removal is recognized. The initial test recorded only callTarget and missed top-level call events; corrected the fixture recorder, without production changes. Binding/focus and checkpoint remain fixture adapters. Type checks and all 478 tests pass. Full checkpoint/broker and production runtime/native implementation remain incomplete.

### 16.150 Browser-auth checkpoint and revalidation state machine

Restored the full yv class in `browser_auth/checkpoint.ts`, using actual reconstructed bindings, field inspection and field planning. Preserves ordinary-field completion, the three-reinspection limit, selected-option projections, reviewed prompt/metadata comparison, native/manual credential branches and action/submission origin checks. Action-review targets dc, credential classification Rc and submission helper pc remain explicit required dependencies.

Validation: 19 original state-transition scenarios compare outcomes, traces and checkpoint state; explicit assertions verify successful normal validation, reinspection exhaustion and successful ordinary refresh. QR-only constructor exception is separately checked. Type checks and all 480 reconstruction tests pass. Tests use fixture action-review/classification/submission dependencies; full BrowserAuth broker, production runtime/context, injected Playwright helper and native providers remain incomplete.

### 16.151 Browser-auth action review and checkpoint defaults

Restored dc/xY/PD/pc in `browser_auth/action_review.ts`: snapshot-root containment through shadow hosts and outer-frame selectors, ordered option/submit metadata, whitespace/80-character accessible-name normalization and null-versus-undefined submission origin. Checkpoint defaults now use these restored action-review and submission helpers; credential classification remains required.

Validation: ten original host traces preserve gate/order/error behavior; real Chromium verifies connected/detached shadow roots, body/head and missing selectors, accessible-name boundaries and complete target collection with native form submission origin. Accessible naming uses a fixture injected utility. Type checks and all 482 tests pass. Full BrowserAuth broker/classification, production runtime, injected Playwright helper and native backends remain incomplete.

### 16.152 Credential classification and complete checkpoint dependency defaults

Restored KT/M8/Rc in `browser_auth/credential_fields.ts`, retaining OTP/new-password exclusion, username autocomplete priority, numeric account-label heuristics, password-only eligibility and option ambiguity rejection. The shared classifier preserves input object references; the auth adapter projects inspected metadata over requested properties. Checkpoint now defaults all three classifier/action-review/submission helpers to reconstructed implementations.

Validation: 1,890 original field type/label/autocomplete combinations, option and duplicate-ID matrices, metadata projection/reference assertions and ordinary checkpoint reinspection through its default classifier. Type checks and all 485 tests pass. Synthetic data only. The full BrowserAuth broker command and production context/runtime/native/injected-helper assembly remain incomplete; these defaults do not establish full end-to-end authentication.

### 16.153 Browser-auth submission orchestration

Restored ute in `browser_auth/submission.ts`: value/option gates, QR-only completion, reviewed presentation retry, manual native submission, action-only options, field delivery, OTP auto-submit polling, ordinary-site verification, scoped bound click/Enter and no retry after the submit action starts. Defaults connect restored fillPlan, submission polling and pressLocator; the private native-submit page callback J_ remains explicitly required.

Validation: 25 original outcome/trace comparisons exercise branch order, rejection precedence, retries, scoped context and one-click behavior after action errors. QR-only is explicitly asserted to perform no host actions. Type checking caught an initial factory-object versus fillPlan wiring error; fixed before publication. Type checks and all 486 tests pass. Tests inject checkpoint/action dependencies; native private submission and full broker/runtime assembly remain incomplete.

### 16.154 Native private auth form submission

Restored J_ in `browser_auth/native_submit.ts` and made it the default submission callback, so createAuthSubmission no longer requires injected dependencies. Preserves same-origin HTTPS POST and exact URL checks, prototype accessor reads, input/form identity, enabled/editable and autocomplete gates, successful-control enumeration, duplicate-name rejection, closed-shadow hidden form creation and finally-block blanking of temporary values. Original visible fields remain unchanged.

Validation: 27 original-versus-restored Chromium cases cover form overrides, unsupported controls, property shadowing, metadata mismatch, dry-run and submit exceptions; captures verify private payload and clearing on success/failure. A separate real Chromium native POST submits synthetic values through an intercepted fixture response. Type checks and all 488 tests pass. Injected selector/state helpers are fixtures; complete BrowserAuth broker and production runtime/native provider assembly remain incomplete.
