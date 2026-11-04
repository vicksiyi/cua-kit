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

### 16.155 Broker credential binding and manual-save preflight

Restored Zee/Jee in `browser_auth/broker_binding.ts`, using actual turn/session metadata, credential classification, option policy, field inspection, HTTPS submission origin and document containment. Preserves private versus ordinary version gates, password-only conditions, field/challenge mapping, private field-name constraints, native dry-run and asynchronous telemetry rejection reporting. Exported the existing metadataSession helper for shared use; telemetry module loading remains a required dependency.

Validation: 52 original private/ordinary preflight traces plus 12 credential-binding cases cover subagent sessions, size limits, optional fields, options, mappings, reinspection, containment and native callback failure. CDP and selector evaluation use fixtures. Type checks and all 490 tests pass. Full BrowserAuthHandoff command, safety review, runtime/context assembly and native providers remain incomplete.

### 16.156 Browser-auth automated safety review

Restored ID/EY/$_/TY/_a in `browser_auth/safety_review.ts`. Uses the restored approval audit/failure runtime and defaults to actual reviewer visible DOM capture. Preserves required authentication-frame presence, empty-snapshot revalidation, prompt-change failure, projected review metadata, concurrent precheck/screenshot settlement and precheck-first rejection precedence. Host documentation loading remains a required dependency.

Validation: 15 original trace/audit/error scenarios and an explicit deferred screenshot test proving that precheck rejection waits for both operations to settle. Type checks and all 492 tests pass. Capture and automated precheck are fixtures in these orchestration tests; no live safety-review service claim. Full BrowserAuthHandoff, QR handling and production runtime/provider assembly remain incomplete.

### 16.157 Auth QR geometry and refresh monitor

Restored QY/HD/WD/oJ/iJ/X_ and cadence constants in `browser_auth/qr_monitor.ts`. Preserves outward integer bounds, synchronous initial publication, 125ms abortable cadence, every-eighth-iteration binding checks, three consecutive absent observations, unknown-result reset, navigation behavior, screenshot timeout/debugger options and swallowed background errors. Decoder remains explicitly supplied.

Validation: 84 original geometry combinations, 15 original monitor traces, synchronous start/stop and real abortable timer. Type checks and all 495 tests pass. Screenshot and decoding use fixtures; actual ZXing/browser fallback decoding, full handoff and production runtime integration remain outstanding.

### 16.158 QR decoder orchestration and monitor assembly

Restored xf/XY/YY/JY/ZY/K_ behavior in `browser_auth/qr_decode.ts`: shared initialization promise including failures, exact two-path WASM asset lookup, owned byte-buffer copy, single-symbol validation, null-versus-undefined fallback and self-contained BarcodeDetector callback with bitmap cleanup. `qr.ts` composes decoder/capture/monitor with shared reader initialization. Host supplies module asset URL and ZXing configure/read bindings.

Validation: 18 original scenarios plus concurrent initialization/byte-view ownership and assembled screenshot-to-decoder checks. Type checks and all 498 tests pass. WASM reader and BarcodeDetector are fixtures; production ZXing/WASM packaging and actual QR recognition are not yet verified. Full handoff/runtime/native providers remain incomplete.

### 16.159 ZXing reader wrapper and QR factory binding

Restored the bundled zxing-wasm 3.1.2 reader wrapper in `browser_auth/zxing_reader.ts`: option aliases/enums/defaults, RGBA grayscale, per-factory weak cache, lazy overrides/equality, input dispatch, WASM allocation/copy/free and result projection. qr.ts now binds the restored wrapper into decoder/capture/monitor through createAuthQrFlowFromWasmFactory. Underlying Emscripten UD remains supplied.

Validation: original option/enum/alias and grayscale comparisons, 28 input/failure traces, cache/promise identity checks and composed screenshot-byte allocation/result test. Type checks and all 502 tests pass. Module tests use a synthetic heap/factory; actual WASM execution, asset packaging and barcode recognition remain unverified. Full handoff/runtime/native provider work remains incomplete.

### 16.160 Real WASM QR recognition and disappearance completion

Added a synthetic QR fixture generated with macOS CIQRCodeGenerator and an integration test that selects only the installed UD factory expression, verifies the installed WASM SHA-256 and uses the reconstructed reader/decoder/capture/monitor chain. No full vendor service/bootstrap execution or vendor WASM publication is involved.

Validation: decodes the synthetic PNG and an actual Chromium JPEG screenshot, verifies bounds, returns null for a blank page and completes after three real absent captures; initialization is shared. Type checks and all 503 tests pass. This establishes real WASM compatibility of the restored wrapper, not reconstruction of UD: readable Emscripten factory, production asset packaging, full BrowserAuthHandoff and runtime/native providers remain incomplete.

### 16.161 Packaged browser documentation lookup

Restored YX/wf/oD/iD/M_/JX/N_/ZX and associated state in `service/context/documentation.ts`. Preserves environment-specific/default bundle selection, explicit root precedence, relative extensionless name validation, ordered directory probes, ENOENT-only fallback, shared failed discovery and JSON manifest parsing/reference identity. createPackagedAuthSafetyReview now connects this loader to the restored review pipeline.

Validation: 13 original lookup/error traces, failed-promise sharing and packaged identity checks, plus real temporary filesystem discovery/read and traversal rejection. Type checks and all 506 tests pass. Host module URL and packaged documentation content remain assembly inputs; production packaging and full BrowserAuthHandoff/runtime/native integration remain incomplete.

### 16.162 Automated review host and auth screenshot integration

Restored Uy/ci/bp/qy/QB/eD in `browser_auth/automated_review.ts`: first-host registration/disposal, captured environment identity, feature gates, tracked elicitation, strict guardian-reviewed acceptance and exact denial/cancel/fail-closed audit routing. Rechecks host binding at invocation. Restored ZM in `screenshot.ts` using actual device-scale capture and observation gating.

Validation: original registry ownership/env/disposal traces, 17 approval/audit/error comparisons and screenshot success/failure traces with actual restored capture and fixture CDP. Type checks and all 509 tests pass. Elicitation is synthetic; no live automated-review service integration claim. Full BrowserAuthHandoff, production runtime/resource/native assembly and readable Emscripten factory remain incomplete.

### 16.163 Full BrowserAuthHandoff control flow and command assembly

Restored rN in `browser_auth/handoff.ts`, including authority/inspection gates, safety review, broker challenge, QR, credential modes, email OTP redemption, submission task, lease/observation cleanup, diagnostics and client-result handling. `handoff_assembly.ts` connects restored helpers and requires host review/QR/telemetry services. `assembleServiceCommandsWithBrowserAuth` now builds the registry's authentication command. Main state variables have descriptive names; dynamic host typing and some nested local names still need refinement.

Validation: 25 original command outcome/trace comparisons plus assembled QR flow through restored bindings, device screenshot, prompt and challenge completion with fixture CDP/decoder. Assembly review caught and corrected SB wiring to observation.resume rather than beginObservation before publication. Type checks and all 511 tests pass. Special native/manual/ordinary credential lease and email OTP paths retain full source control flow but need broader integrated coverage; full production context/runtime, injected helper, native providers, packaging and readable Emscripten factory remain incomplete.

### 16.164 Protected credential lifecycle coverage and readable submission state

Refined handoff submission-task identifiers for delivery, lease, ordinary/private protection, completion, rejection and attempt diagnostics. Dependencies now distinguish callables, capability identity, checkpoint constructors, telemetry and boolean observation-predecessor validation.

Validation: eight additional original protected-mode traces cover private/ordinary/native delivery, rejection race, lease-start failure, failed ordinary result, session mismatch and predecessor failure. Explicit assertions verify ordinary cleanup/restoration, private rejection result and no private interaction restoration after session mismatch. A fixture initially declined protected-mode prompts; corrected its dispatch and added outcome assertions before acceptance. Type checks and all 512 tests pass. Lease/gate services are fixtures in these main-command tests; email OTP and full production credential/provider integration remain outstanding.

### 16.165 Email OTP redemption and approval lifecycle

Refined email OTP locals in BrowserAuthHandoff to describe persistent permission, redemption response/body, approval content and completion status while retaining the original branch and cleanup order.

Validation: 12 original-versus-restored traces cover automatic submission, approval-required fallback, unavailable and broker-unconfirmed submitted status, prompted submission, cancellation, decline, retirement, malformed approval content, preference failure, network failure and HTTP failure. Assertions confirm private email interaction restoration, fallback prompt count, exact autofill error and challenge closure. Type checks and all 513 tests pass. Backend, broker and permission services are synthetic fixtures; real email connectors, production runtime/provider integration and the broader reconstruction gaps remain incomplete.

### 16.166 BrowserContext construction, wiring and disposal

Restored the full ob class as `context/browser_context.ts`: backend-specific network policy and scroll mode, credential navigation binding, tab acquisition, document/site-instruction events, AX options and global observation gate, lazy locale cache, provider delegates, turn-detach cleanup and shared disposal promise with original failure/transport-close semantics.

`browser_context_assembly.ts` connects actual restored preferences, CDP, clipboard, browser-user/UI/input, dev/tabs/lifecycle, Playwright, security, document responses, downloads, site instructions, assets and AX actions/capture. It adapts the explicit injected-source argument and changed constructor order of the restored Playwright class. Host still supplies injected source, localization and telemetry.

Validation: 27 original class comparisons across IAB/extension/CDP cover normal, disabled AX, proxy, cloud, info failure, transport-close and cleanup/detach/disposal failures. An assembly test constructs actual restored services with synthetic transport, verifies dependency identities, metadata/delegates, global credential observation gating and idempotent disposal. Type checks and all 515 tests pass. No real browser execution through this new context is claimed yet; host/runtime bootstrap, full injected helper/native providers and resource packaging remain incomplete.

### 16.167 Privileged host initialization and elicitation telemetry

Restored mH/nhe/ohe/fH/W6/rhe in `runtime/host.ts`: privileged REPL gate, runtime spread with live request metadata getter, bound elicitation and nullish meta normalization, GAAS config/default path/read-parse fallback, optional broker delegates, credential-observation initialization, access assertion and absolute WASM-path validation order, and host-service assembly. Filesystem uses actual Node UTF-8/byte operations. Browser directory, config bridge, access verification, telemetry and broker implementations remain explicit dependencies.

Restored G6 in `runtime/elicitation_telemetry.ts`, using the existing guardian timeout classifier and supplied span implementation. Preserves automatic-review/user-wait names, auth stage, unsupported-over-takeover precedence, reviewer projection and result classification.

Validation: 16 original host traces, real temporary filesystem operations, original REPL-gate comparison and 640 original telemetry combinations. Type checks and all 518 tests pass. This does not establish a runnable privileged production host: directory/transport/config/access verification and runtime bootstrap are still incomplete; no real broker or model request is made.

### 16.168 Browser directory, URL selection and turn-ended lifecycle

Restored yb/mb/fb in `runtime/browser_directory.ts`: shared browser refresh, public listing, default/URL lookup, preferred windows, Dot permission checks, connection sharing, pipe-change replacement, capability validation, close tracking and disposal. Turn-ended tracking removes matching callbacks before awaiting, isolates failures, supports per-session callback replacement and unregisters once.

`browser_selection.ts` restores browser aliases, preference/default ranking, URL matching tiers, local URL preference, hostname hierarchy, tab enumeration and timeout behavior. Directory uses these as real defaults; discovery, transport and browser API adapters remain explicit dependencies.

Validation: 17 original directory traces, original turn-ended lifecycle trace, URL ranking/alias/default/hierarchy comparisons, provider error paths, 30 asynchronous URL-selection traces, deadline and default-directory integration. Type checks and all 521 tests pass. Synthetic providers are used; real inventory/transport discovery, config/access verification and full runtime bootstrap remain incomplete.

### 16.169 Browser discovery and pipe inventory

Restored M6/qle with pipe discovery, concurrent connect/handshake, instance-shared connection ids, existing pipe reuse, stale connection closure, session/build-flavor filtering, surface filtering and diagnostic construction. Preserves repeated turn-metadata reads, default discoveryScope mutation, global-before-session order, ignored handshake sentinel and failure truncation. Pipe listing uses real Node filesystem defaults, explicit platform-specific path parsing and deduplication; error formatting reads each property once.

Validation: 15 original discovery traces cover metadata rejection, subagent session, exact socket selection, listing/connect/factory/handshake/close failures, disabled surfaces, session/flavor mismatch and ten failures truncated to eight. Original platform pipe-listing and accessor-sensitive error comparisons pass. Type checks and all 523 tests pass; the focused pipe oracle was then strengthened to use original ul directly and passed again. Tests use synthetic providers/directory reads. Transport, handshake, surface gates, spans and diagnostic reporting remain host dependencies; production discovery integration is not yet established.

### 16.170 Browser handshake, capabilities and profile enrichment

Restored Hx/Gle/Vle/Bs/C6 in `runtime/browser_handshake.ts`: timed getInfo, profile metadata enrichment with fallback only on enrichment rejection, full-CDP eligibility/permission checks without duplicate capability insertion, and AX feature selection with explicit backend false precedence, cloud/orbit CDP precedence, environment overrides and feature defaults. Enabling AX disables CUA/DOM CUA exactly as the source does. Profile inventory remains supplied; metadata projection retains string-valued last-used/order fields.

Validation: 360 original AX backend/setting/environment and identity comparisons, 160 full-CDP policy/permission cases, eight profile/handshake failure traces and a composed discovery-to-handshake/profile test. Type checks and all 526 tests pass. Tests use synthetic providers/profile inventory; platform profile storage, feature configuration, real transport and full bootstrap remain incomplete.

### 16.171 Platform profile inventory and extension-instance storage

Restored x6/T6/gle/wle/_le in `runtime/browser_profiles.ts`: process-environment platform paths, ordered Local State profile metadata, per-profile failure isolation, optional ClassicLevel loading, temporary storage copy/LOCK removal, UTF-8 instance JSON decoding and original close/remove ordering. Composes directly with restored C6 enrichment. Home-directory lookup remains lazy where the source uses environment overrides.

Validation: original family/platform/env path matrix, 15 instance-read lifecycle/failure traces and profile-list/error comparisons. A real temporary ClassicLevel database created with the installed third-party/native module verifies copied storage reads, metadata enrichment, preservation of the source and temporary cleanup. No personal browser profiles are read. All 529 tests passed; final lazy-home refinement passed focused tests and type checks. ClassicLevel module loading/packaging is host supplied; its native implementation is not reconstructed, and full production bootstrap remains incomplete.

### 16.172 Browser API adapter, bidirectional RPC and managed headers

Restored full id as `runtime/browser_api.ts`: provider method delegates, live/cached/subagent session parameters, Dot preparation/cache/turn checks, request-header preparation, turn-ended draining/cleanup, cached-expression support/refill/fallback, committed-URL fallbacks and close semantics. Restored to as BrowserRpcPeer and VC/u5 header validation/substitution. Directory now defaults to restored BrowserApi and BrowserClientApi. Dynamic API types and some generic nested local names remain to refine.

Validation: 19 original API traces plus explicit branch assertions, header policy matrix and original bidirectional RPC trace. Composed directory → discovery → handshake → BrowserApi → paired RPC test verifies getTabs, session/header payload, turn hook and closure. Transport is synthetic; production socket framing and complete bootstrap remain outstanding.

Type checks and all 533 tests pass. The first full run exposed an existing history-navigation test reading Playwright's separate URL cache before it updated; isolated rerun passed. Changed that assertion to read the committed frame URL through the command's CDP session, retained the expected destination, then verified focused and full suites. No navigation implementation behavior was changed.

### 16.173 Native pipe framing, transport and privileged bridge

Restored cs/ab/sb/kx/Zue/Que/m6 and Vo/ub/rle/tle/h6 in `runtime/native_pipe.ts` and `native_pipe_bridge.ts`. Preserves native-endian 32-bit length framing, incremental chunk consumption/compaction, frame limits, exactly-one-response checks, delivery deferred until close, callback/error conversion, shared close task and listener settlement. Connection factory requires the privileged nodeRepl.nativePipe bridge; static create returns the base transport as in the source.

Validation: original frame byte/chunk/UTF-8/limit/single-response/compaction comparisons and 11 transport lifecycle/error traces, original bridge absence/message checks, plus real local Unix socket carrying restored RPC/BrowserApi getInfo/getTabs and session parameters. Type checks and all 537 tests pass. The real-socket test supplies its own bridge adapter to a synthetic local server; production privileged bridge and full runtime bootstrap are not yet integrated.

### 16.174 REPL config bridge, cache and serialized updates

Restored _6/w6/yu/v6/lle/cle/dle in `runtime/config_bridge.ts`. Preserves global/session TOML paths, session validation, read error causes, per-bridge five-minute snapshots and shared in-flight reads, generation/invalidation checks, refresh replacement and per-host-config/path write queues shared across bridges. Updates merge transformed values, invalidate before writing, and refresh after writing. Host factory now defaults to this bridge.

Validation: six original read/write/error/TTL/session scenarios and four controlled overlapping-refresh traces, plus actual Preferences and host-default integration with synthetic config. The race fixture waits for explicit read-start signals rather than guessing microtask counts. Type checks and all 541 tests pass. No real user configuration was mutated; production access verification, runtime bootstrap and remaining provider/injected-helper work remain incomplete.

### 16.175 Signed browser-access verification and turn cache

Restored H6/Gx/uce in `runtime/browser_access.ts`. Captures the executor setting, validates raw session/turn metadata, shares the request promise per serialized turn (including failures), generates a 32-byte nonce, imports the SPKI public key, verifies the signed payload and requires exact JSON equality for the domain/request/allowed grant. Preserves ten-second close timer and finally cleanup/error precedence.

Validation: 18 original traces cover absent/malformed host configuration, captured executor, missing metadata, RPC/connect/close/timeout failures, invalid signatures, altered/reordered/denied grants and failed-turn caching. Real framed Unix socket with freshly generated synthetic Ed25519 keys verifies signing, nonce length and one request per turn. Type checks and all 543 tests pass. No production identities/settings are used; privileged access-host connection and complete runtime bootstrap remain to assemble.

### 16.176 Surface policy and connected browser host assembly

Restored PA/pl/Is/x5/S5/ro/C5/kA as `runtime/surface_policy.ts`, preserving absent/empty allowlists, aeon_child-only Dot access, backend mapping and primary/legacy extension/window preference keys. `host_assembly.ts` connects restored native bridge, signed access, profiles, handshake, discovery, directory, config/Preferences, credential observation and elicitation telemetry. Uses the installed production deployment literal and original ignored handshake message.

Validation: 126 original surface/metadata combinations and 42 extension/window preference cases, plus a real Unix socket synthetic backend test exercising assembled host creation, shared signed access, inventory/getTabs, managed headers, elicitation metadata and turn/disposal. Type checks and all 545 tests pass. Telemetry SDK/span/feature provider, ClassicLevel loading and auth broker remain host inputs. Full p6 command runtime, injected helper and native-app stack remain incomplete; no production browser session was used.

### 16.177 Full command runtime control flow

Restored the complete p6 factory plus Xue/Yue/Ix/Jue and module state in `runtime/command_runtime.ts`. Preserves invocation setup, shared recorder and one-time notification hook, previous-runtime disposal, documentation manifests/Orbit confirmation policy, management versus browser dispatch, per-backend context cache, download setup barriers, native credential completion callback, tab reclaim, AX initialization, WebMCP recording, manual handoff, response metadata, security error reporting and original finally ordering. Current-URL recording preserves the cache/get-tab/detached/read fallback decisions. Service dependencies remain explicit; no alternate command path or fabricated provider is substituted in the implementation.

Validation: 18 original-vs-readable synthetic runtime traces plus controlled download concurrency for success/failure, disposal-during-lookup and cached disposal rejection. Branch assertions prove contexts/recorders/hooks are reused, errors skip recording, handoff hides results when observation is unavailable, and waiters resume after failed download setup. Type checks and all 548 tests pass; final interface-only refinement passed type checks and focused tests. Dynamic host/provider values retain explicit broad types. These tests use synthetic providers; q3 command scheduling, the documentation controller and recording/telemetry integration still require restoration/assembly. Full production browser/app execution and DeepSeek online validation remain incomplete.

### 16.178 Command scheduling and credential recovery

Restored q3/D3/$o/Je and their exact command sets in `runtime/command_scheduler.ts`. Authentication handoffs share a serial queue across scheduler wrappers; other commands retain original concurrency. Preserves observation tokens, native-credential browser-alias resolution, document invalidation, before/after epoch checks, protected-result filtering, exact new-tab identifier validation and recovery-v1 phase/reason/next-action mapping. Error rechecks can override earlier errors when credential state becomes unavailable. Recovery telemetry failure is isolated and cleanup retains original ordering. Uses actual restored credential observation state, security/recovery error classes and browser inventory schemas.

The p6 runtime now defaults to this scheduler, response-metadata guard and recording guard; V3 dependency is explicitly named `reportCommandRecovery` because it is a recovery callback. Validation covers 280 original trace combinations plus 20 targeted failure/identifier cases, cross-wrapper handoff queue success/failure, actual gate protection/navigation/new-document observation, after-command epoch changes withholding results, and composed p6/scheduler/gate behavior. All 553 tests and type checks pass; final callback-name refinement and added epoch assertion passed focused tests. No real native credentials or user session were used. Documentation controller, recording/telemetry modules, injected helper, native app stack and full production assembly remain incomplete.

### 16.179 Documentation controller and API reference rendering

Restored full ib plus z3/K3/X3/Due/Y3/J3 in `runtime/documentation_controller.ts`, using actual capability definitions. Preserves global-disabled precedence over enabled backend overrides, conditional guidance/lookup selection, visible-declaration reachability, cyclic/missing type handling, manifest ordering and exact output text. The controller maintains read state across selections; excluded included-guidance is marked read even when its body is not loaded, lookup exclusions are not applied, and required-read checks use the full manifest. Failed loading or rendering does not mark newly included guidance as read.

The command runtime now defaults to this controller. Tests connect actual documentation commands, controller and scheduler through p6: unread requirements reject before context creation; selected-browser documentation reads confirmation policy text, renders the API and permits the next command. Validation includes 72 original filtering combinations, eight controller traces, parallel-read/failure cases and 12 comparisons using the installed API manifest. Type checks and all 558 tests pass. Production document assets/loader assembly, recording/telemetry, injected helper, native app stack and full production end-to-end validation remain incomplete.

### 16.180 Command recording, response metadata and screenshots

Restored Z3/Q3/n6/t6 and helpers as navigation, interaction and WebMCP recorders plus after-code aggregation. Preserves origin collapsing, site guidance, manual-handoff priority, same-browser merge, protected handoff, one-shot consumption and a shared 100000-code-unit budget allocated newest-first. Restored bu/Tue/$3 and URL/tab helpers: field whitelisting, URL credential/query/fragment removal, session-owned tab selection, active-tab fallback, failure telemetry and observation rechecks. Screenshot capture defaults to restored Ui. The p6 runtime now defaults to these modules.

Validation: 27 recorder traces, 13 aggregator traces, serialization/budget matrices, 48 handoff combinations, 52 response-screenshot traces and URL/field comparisons against original functions. Runtime after-code-hook composition emits actual WebMCP metadata once. An integration fixture initially assumed the observation guard always received a context; corrected it to match original Je's optional-context contract. Type checks and all 565 tests pass. The screenshot orchestration tests use synthetic providers; this does not establish live production screenshot behavior. Telemetry bootstrap, document assets/loader assembly, injected helper, native app stack and full production end-to-end validation remain incomplete.

### 16.181 Runtime documentation, compatibility and recovery policies

Restored j3/yue document override/rewrite/OTP policy on the actual documentation loader, H3 download compatibility checks, G3 security event mapping and V3 recovery metadata/version allowlists. Runtime defaults now use these checks/reporters and the installed browser-client release. Renamed the H3 dependency to `assertCommandSupported` because it rejects unsupported IAB downloads rather than recording usage. `createDocumentedCommandRuntimeFactory` connects the policy and manifest loader with an explicitly supplied asset module URL/bundle.

Validation: 288 original document policy combinations, temporary filesystem manifest/text loading, 24 compatibility combinations, 150 recovery version combinations and 500 security event combinations. A runtime/scheduler/actual-gate integration verifies default recovery metadata and rejection before context creation. Type checks and all 570 tests pass. Production asset packaging/location, telemetry SDK/bootstrap, injected helper, native app stack and full production end-to-end verification remain incomplete.

### 16.182 MCP Apps command execution and error normalization

Restored TA/EA/m5/f5/h5: per-CDP/per-tab serialization, parsed frame selector segmentation, nested frame preparation/activation, cross-origin authority checks, document-bound Playwright contexts, ancestor pointer translation and clipboard/token cleanup. Preserves reverse release order, cleanup error precedence and original undefined return of the ancestor callback. Restored OA/T5/MA error normalization and extension-UI blocking guidance. Runtime defaults now use this execution wrapper and restored error formatter/classifier/security-reason/URL-policy classes.

Validation: 17 original frame execution traces plus numeric tab edge cases; concurrency verifies separate tabs remain independent and failed predecessors do not poison the queue. Nine actual Chromium DOM cases compare pointer translation and rejection behavior, including transforms/zoom/occlusion/bounds. Error comparisons cover 11 values and six family inputs, identity/cause and getter read counts. Type checks and all 575 tests pass. MCP Apps native prepare/activate/release is exercised with synthetic transport fixtures; real native production integration, remaining runtime assembly, injected helper and full browser/app end-to-end validation remain incomplete.

### 16.183 Connected command runtime assembly

Added `assembleCommandRuntime` connecting restored command registry/auth handoff, BrowserContext, documentation loader/controller, notifications/queue, approval audit sink, capability filters, session/backend metadata, command identities, WebMCP tool lookup and accessibility initialization. Host inputs remain explicit for injected source, localization, telemetry SDK, feature/config services and auth integrations. Restored Wy/vh helpers and corrected the Vp dependency name to `getUserTabContextCommand` (the original command is not tab release).

Validation uses the actual RPC dispatcher/runtime/context/registry/documentation/notification implementations over a synthetic browser provider: setup, management inventory, rejection before required documentation is read, selected-browser documentation, list_tabs, context reuse, response/notification hooks, disposal and post-disposal rejection. Original alias and backend telemetry projections also match. Type checks and all 577 tests pass. This proves the connected service path for those commands, not production host/browser connectivity or every command. Native transport integration with this assembly, production assets/telemetry, injected helper, native app stack and full end-to-end validation remain incomplete.

### 16.184 Host, command runtime and native pipe service integration

Added `assembleBrowserService` connecting the restored host factory, command runtime assembly and RPC dispatcher with one shared runtime lifetime. The privileged native-pipe bridge remains supplied by the host; the implementation does not silently replace that capability with an unrestricted socket backend.

A real temporary Unix socket test now connects the actual signed access verifier, native framing/RPC, discovery/directory/BrowserApi, command runtime/BrowserContext/registry and dispatcher. A synthetic backend verifies inventory, required-documentation rejection before getTabs, selected-browser docs, list_tabs, name_session normalization, backend-error propagation, managed request headers, cached access, turn cleanup and disposal. Denied access on a new turn prevents further getTabs requests. Type checks and all 578 tests pass. The backend, privileged bridge and external host services are synthetic fixtures; this does not establish installed production browser/app connectivity, public CUA/agent end-to-end, full injected helper or native app completion.

### 16.185 Public browser/CUA caller chain and Fh binding correction

Extended the real Unix socket service integration through actual `setup_browser`, `setupBrowserRuntime`, `create_browser_api`, bootstrap emission and `bind_tab`. The public path now verifies getBrowser, listTabs, nameSession, recovery-enabled command transport, documentation/state output and getTab for the original new-tab branch. Test-scoped nodeRepl globals are restored afterward.

Source inspection found and corrected a previous assembly error: Fh is `get_tab`, not `close_tab`. The runtime field is now `getTabCommand`, wired to GetTabCommand. A dedicated original-vs-readable regression uses an attached tab with no cached URL to prove get_tab skips committed-URL fallback, while close retains the normal lookup decision. Wh/Gp/Vp/Mh/Ic/Fh initializer identities were rechecked.

Type checks and all 579 tests pass. The public getTab test uses the original new-tab path, which does not request AX state; it does not prove normal-page observation or click/screenshot behavior. An ordinary-page attempt exposed missing packaged browser-accessibility.wasm.br at the default reconstructed location. AX asset assembly, normal-page/Agent end-to-end, full injected helper and native app completion remain outstanding; no production browser session or real model credential was used.

### 16.186 Accessibility WASM build asset assembly

Added an explicit build-time asset input, `CUA_BROWSER_ACCESSIBILITY_WASM_SOURCE`, for `npm run build:reconstruction`. It accepts an installed `.wasm.br` or uncompressed `.wasm`, validates the WebAssembly module and required exports, and atomically places the compressed resource next to the emitted accessibility loader. Existing compressed bytes are preserved; plain WASM is compressed at Brotli quality 5 to avoid slow default-quality builds. The runtime's original relative asset lookup and `BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH` override remain unchanged. With no build input, source-only builds remain possible, but AX operations require a previously assembled asset or the runtime override. No machine-specific installation path is embedded in production code; the vendor binary remains an external, locally supplied dependency and is not published to GitHub.

Validation covers the actual compiled loader imported from a temporary directory without an explicit source argument, execution of the installed WASM on a synthetic dialog snapshot, compressed byte preservation, plain-WASM conversion, malformed module rejection and missing ABI rejection without replacing a working asset. This establishes packaging and WASM execution, not ordinary-page CDP capture or click/screenshot end-to-end. Full native app support, injected helper restoration, independent WASM implementation and real-model Agent integration remain incomplete.

Type checks pass; all 580 reconstruction tests pass. The build was also run with the actual installed compressed asset supplied explicitly.

### 16.187 Public CUA observation, AX click and screenshot on real Chromium

Extended the existing Unix socket service integration beyond its new-tab branch. An isolated Chromium instance loads a synthetic HTTPS page via Playwright route fulfillment. The test backend forwards real CDP commands and relevant events over the actual native-pipe JSON-RPC transport. Public `cua.getTab`, `getAXState`, `click`, `getScreenshot` and `getAXStateAndScreenshot` traverse the restored client/bootstrap/binder, service dispatcher, command runtime, security, CDP manager, AX/WASM and input/screenshot implementations.

The test first declines the synthetic origin prompt and verifies `user_declined` plus no full AX tree read, then accepts through the test host's elicitation callback. It extracts the button index from actual WASM-rendered AX text, clicks that index and checks the real DOM changed. A subsequent AX capture sees the changed label. Screenshot bytes decode as a 1280×720 JPEG in Chromium; combined state/image capture works, and screencast starts/stops are balanced. Source inspection confirmed the screenshot implementation uses viewport screencast rather than Page.captureScreenshot. Host fixtures now provide the actual config snapshot shape (`config: {}`), command attributes and elicitation timing callback required by these paths.

This verifies one real page across the reconstructed public API and service chain. Browser discovery/access identity, native-pipe endpoint, host policy UI, documentation and telemetry remain synthetic; it is not installed extension/production-host compatibility or Agent/model end-to-end. No personal browser profile or real model credential is used. The supplied Playwright injected helper remains unused in these AX paths; its restoration and the native app stack are still outstanding. WASM remains an external binary dependency.

Validation: `npm run test:reconstruction` rebuilt all three packages with TypeScript checks and passed all 580 tests.

### 16.188 Embedded injected helper: readable text matching component

Extracted the installed service's hF literal for local analysis (154469 characters; raw source stays under ignored research/private). Added `playwright/injected/text_matcher.ts`, a typed reconstruction of O/li/ro/ht/ut/pe with descriptive names and extensionless imports. Preserves optional whitespace caching, quote unescaping, internal JSON parsing, immediate-node versus normalized strict matching, lax text search, regex state, assertion flags/normalization and class-list matching. Original quirks remain: empty regex sources are ignored, string precedence survives simultaneous regex input, repeated global/sticky regex calls retain lastIndex, and invalid partial-class configurations still throw rather than silently succeeding.

Added an AST-only embedded-source reader and differential matrices against the actual selected original functions. The source reader decodes only the hF string literal and does not execute the service or full injected script. This component is not yet assembled into the full injected helper and does not replace the host's required injectedSource; selector engines, DOM/accessibility utilities and the InjectedScript class still need restoration and assembly. Updated source provenance to distinguish this component from full helper completion and record the previous real-page integration results.

Validation: standalone reconstruction type checks and full rebuild/test pass, 583 tests total.

### 16.189 Embedded injected helper: DOM text, root scope and labels

Added readable typed reconstruction of hF qt/q/st/Ar/le/Wr/dn in `playwright/injected/dom_text.ts`, reusing the reconstructed whitespace/text matcher. Covers recursive versus immediate text, skipped head/script/style/noscript nodes, button/submit input values, shadow-root text, none/self/selfAndChildren classification, enclosing query roots, ordered deduplicated ID references, and aria-labelledby/aria-label/native-label precedence. Preserves node-identity caches and the original literal-space IDREF split rather than silently broadening it to all whitespace.

A real Chromium comparison runs selected original expressions and the compiled reconstructed modules against the same synthetic DOM, with explicit expected results for text chunks, shadow labels, form values, matching classification, reference order and cache clearing. No full vendor script is evaluated. The component remains unassembled into the complete injected helper; full selector engines, accessibility utilities and InjectedScript are still outstanding, along with native apps, production host and real-model Agent integration.

Validation: all three reconstructed packages compile and all 584 reconstruction tests pass.

### 16.190 Embedded injected helper: visibility, shadow traversal and style caches

Restored hF xi/St/$/kr/ye/X/Cr/Ze/Q/Nr/_/_t/Tt in typed `playwright/injected/dom_visibility.ts`. Preserves nested shadow-host traversal, containment/scoped closest, computed-style lookup, native checkVisibility versus the browser-name workaround, details visibility, display:contents child ordering, text geometry and tagName handling for forms with a named property shadowing tagName. Style cache lifetime follows the original nested begin/end counter, with separate element/before/after maps and cached undefined values.

Real Chromium differential tests cover both Chromium and WebKit workaround selection (the latter exercises the branch in Chromium, not the WebKit engine), hidden/zero-size/transparent/offscreen elements, text/element display:contents, collapsed details, two shadow levels, missing document views and form tagName shadowing. Explicit assertions establish these are not merely equal empty outputs. Cache tests count actual getComputedStyle calls and verify shared identities, final release/restart and undefined caching across node adoption. Shared test infrastructure now extracts emitted declarations through AST offsets for browser execution, retaining production functions and removing only ESM wrappers.

This remains a component of the original helper; it is not a completed InjectedScript/selector engine. Full helper assembly, native apps, production host and real-model Agent integration remain outstanding.

Validation: three-package TypeScript build and all 586 reconstruction tests pass.

### 16.191 Embedded injected helper: attribute parser and role option validation

Restored hF M/ve/ss as typed `attribute_selector.ts`: named/attribute selectors, dotted and quoted property paths, truthy/comparison operators, escaped strings, regular-expression character classes and flags, optional unquoted strings, primitive coercion and exact parser errors/positions. Matching retains original uppercase case folding, String.match regex behavior and literal-space token splitting. Added `role_options.ts` for source role tables and pn/Be/ce/ue/os validation, preserving role/value/operator check order, level mutation, name flags and repeated-attribute precedence.

Differential tests cover valid selector matrices, 2500 seeded malformed token sequences and both unquoted-string modes, plus attribute comparison matrices. Role tests compare source tables, outputs, exact errors and input mutations, and compose the restored parser with validation. Explicit checks preserve source quirks such as empty numeric input becoming zero, negative/infinite level acceptance by this validator, unsupported-role errors occurring before level coercion, and literal-tab strings not splitting into space-separated tokens. This restores parser/validation components, not the remaining role query engine or full InjectedScript assembly.

Validation: standalone type checks, three-package rebuild and all 589 reconstruction tests pass. Native app support, production host, real-model Agent integration and full injected-helper assembly remain incomplete.

### 16.192 Embedded injected helper: spatial selector scoring and query pipeline

Restored Zi/es/ts/rs/ns/is/fn/Fe and InjectedScript._queryLayoutSelector as typed `layout_selector.ts`. Preserves directional gap/orthogonal penalties, near's summed rectangular gaps and default 50-pixel limit, inclusive thresholds, self exclusion, minimum score across reference elements, optional numeric final engine argument, evaluator score marking and stable sorted Set output. The enclosing selector resolver is an explicit dependency, corresponding to the original class method's querySelectorAll call; this is not a replacement resolver.

Original-function geometry matrices and engine traces cover threshold/zero-size/NaN/Infinity cases, selector argument identity and repeated numeric property reads. Real Chromium compares both evaluator matching/score emission and the original class layout-query method over multiple anchors and equal-score candidates. Added an AST class-method extractor to test the actual original method without instantiating the full vendor helper. Full selector evaluator and InjectedScript assembly remain outstanding, as do native apps, production host and real-model Agent integration.

Validation: three-package TypeScript rebuild and all 591 reconstruction tests pass.

### 16.193 Embedded injected helper: complete selector evaluator and engine assembly

Restored the complete ls class in `selector_evaluator.ts`, typed selector/context/engine contracts and all its non-layout engine objects in `selector_engines.ts`; layout engines use the previously reconstructed module. Preserves the original registry and customCSSNames consistency check, is/where/not/has/scope/light/visible/text/text-is/text-matches/has-text/nth-match behavior, all combinators, scope expansion, shadow-piercing CSS queries, multi-selector DOM ordering and spatial score sorting. The class retains original method names, cache keys, nested cache lifetime, query-versus-matches ordering and failure semantics, including the original score-map state left after a query failure.

Real Chromium compares the actual original class and engine expressions against the compiled reconstructed assembly over document/element/shadow-root scopes with both piercing modes. Tests use original-shaped selector ASTs, not a substitute CSS-string parser. Coverage includes all engines, combinators, errors, nested shadows, duplicates/order, text/visibility/spatial composition, retained cache identity through DOM mutation, release/refresh, custom engine dispatch and cleanup. Explicit expected results complement differential equality. A TSX callback serialization issue was fixed in the test fixture by using method syntax, without altering production behavior.

This completes the evaluator component and connects earlier helper modules. Full CSS tokenization/parsing, role/accessibility query utilities and the enclosing InjectedScript remain incomplete, as do native apps, production host and real-model Agent integration.

Validation: three-package rebuild and all 593 reconstruction tests passed before the dependency-reuse change below.

### 16.194 Third-party dependency audit and upstream reuse

Policy correction: inspect external imports, package manifests and bundled source signatures before reconstructing a component. Reuse the original upstream package where compatible; reconstruct only CUA-owned orchestration and verified upstream differences. An empty manifest dependencies object does not mean a bundle has no third-party code. Installed package presence alone does not establish a runtime dependency. Existing reconstructed vendor helpers remain differential references while replacement compatibility is established; they are not a reason to continue rebuilding upstream wholesale.

| Component | Evidence in the installed application | Decision / current state |
| --- | --- | --- |
| zxing-wasm | Bundled default locateFile explicitly names 3.1.2; qD/jD call the generated reader factory UD. The npm 3.1.2 reader WASM is byte-identical to CUA's asset (SHA-256 0e8d688d71932ebb6b8b33f700d43d3cb997f59ed9cab3c05102d7f10288a392). | @core/browser now pins zxing-wasm 3.1.2. createAuthQrFlowFromZXing imports prepareZXingModule/readBarcodes from zxing-wasm/reader. CUA asset lookup, QR interpretation, native fallback and monitoring remain in our adapter. No reconstruction of the Emscripten factory is needed. Host assembly still must select/provide this flow; this is not full production host wiring. |
| Playwright | Installed playwright/playwright-core are 1.57.0. hF contains the selector evaluator/InjectedScript implementation. Comparing actual source establishes snapshot differences: CUA returns text plus iframeDepths; installed 1.57 returns text without that field; the test project's 1.64.1 uses a different JSON snapshot interface. | Prefer upstream implementation plus an explicit CUA patch/adapter. Exact matching upstream base is not yet established; do not blindly substitute installed/latest version or keep reconstructing every helper. Existing evaluator tests provide a compatibility baseline. |
| classic-level | @oai/browser-desktop declares 3.0.0; browser-service dynamically imports ../node_modules/classic-level.mjs and uses ClassicLevel to read extensionInstanceId from a copied profile database. | Use ClassicLevel, not a new LevelDB implementation. Current browser_profiles already accepts loadClassicLevel as a host dependency; production loader integration remains outstanding. |
| @statsig/js-client | @oai/sky declares ^3.32.6; targets/mac/computer-use-telemetry.js directly imports the SDK. | Reuse the SDK where that telemetry adapter is needed. The manifest range does not prove a single installed version. Do not rebuild the telemetry SDK or assume it is needed for core clicks/screenshots. |
| Zod | Browser-service contains ZodFirstPartyTypeKind and vendor: zod, despite @oai/cua having an empty dependencies map. | A bundled third-party validator is confirmed. Exact bundled version/compatibility remains to establish; root Zod 4.6.7 is not proof of equivalence. Replace extracted validator runtime after schema/error differential checks. |

The application also ships other packages, but they are not automatically counted as used by this execution path. Markdown/sanitization and other bundled dependencies still need the same import/version/behavior audit. Third-party package scopes stay upstream (e.g. zxing-wasm/reader); only reconstructed @oai package scopes become @core. TypeScript imports remain extensionless.

The upstream QR path and retained original-factory path run the same real Chromium screenshot, successful QR decode, blank-page decode and disappearance-monitor scenario. A separate test compares the actual WASM bytes. These tests establish the covered QR behavior, not blanket equivalence of every barcode format or all upstream APIs.

Validation: three-package build passed. The first unconstrained full test run stalled in the unchanged AX asset test and was terminated; that test passed alone. The complete suite then passed with explicit concurrency 4: 595 tests, zero failures. The three real QR/asset tests also passed independently.

### 16.195 Upstream ClassicLevel integrated into host profile loading

Pinned classic-level 3.0.0 in @core/browser, matching @oai/browser-desktop's manifest. Added a lazy import of the real library as the default in createBrowserProfileReader; assembleBrowserHost no longer requires a caller-supplied loader. Explicit injection remains available, including deliberate null/failure outcomes. Import failures still return null at the original boundary, and the source profile-copy, LOCK removal, UTF-8 encoding, JSON interpretation, error reporting and cleanup sequence is unchanged. No LevelDB runtime is reconstructed.

A new integration test creates an isolated real LevelDB with the upstream native package, writes synthetic extensionInstanceId data and Local State, invokes the default reader through readProfiles, checks the returned profile/instance, verifies temporary database cleanup and reopens the source to verify the original data remains accessible. Numeric JSON, malformed JSON, empty and missing values exercise the original null/error semantics with real storage. It reads no personal browser profile. Existing differential lifecycle tests continue to cover injected import failures and operation order. This closes the ClassicLevel loader gap reported in 16.194; production browser host/extension integration as a whole remains incomplete.

Validation: three-package build and complete reconstruction suite passed: 596 tests, zero failures (explicit test concurrency 4).

### 16.196 Replace the extracted Zod runtime with upstream v3

@core/browser now directly depends on zod 3.25.76. The 3,250-line formatted third-party runtime in vendor/bundled_zod.ts is replaced with a five-line upstream re-export, keeping existing application import paths stable. This also restores upstream TypeScript types instead of exporting any. The schema extraction script now emits the dependency adapter and cannot overwrite it with copied vendor implementation. Root/Agent Zod v4 remains separately resolved; browser validation uses its explicitly pinned v3 dependency.

The installed browser-client bundle does not provide an exact historical version marker. 3.25.76 is the selected upstream version validated against the installed implementation, not a proven original version. Existing differential tests cover actual command payload/result schemas and transport; new tests compare 25 validator constructions over a shared valid/invalid value matrix, including parsed data, issue wire data, exact error messages, flatten/format, Standard Schema output and asynchronous nested refinement paths. The initial new test compared nested union ZodError objects across independent implementations and failed on constructors/stacks; it now compares their serializable issue data while still checking error names/messages and format/flatten results. No application behavior was changed to conceal that test-fixture mismatch.

This removes the copied browser-client validator dependency. It does not claim byte-identical upstream source or full equivalence of every Zod API, nor does it complete the remaining service bundle/Playwright/native/runtime work.

Validation: three-package build passed; full suite passes with 598 tests and zero failures (concurrency 4).

### 16.197 Full upstream Playwright injection replaces the missing default helper

Correcting the inference in 16.194: iframeDepths is also present in upstream Playwright 1.59–1.61, so its absence in the application's separately installed 1.57.0 does not prove a CUA-specific modification. Examined injected sources from 1.57.0, 1.58.2, 1.59.0, 1.59.1, 1.60.0 and 1.61.1. A minification/identifier-insensitive method-shape comparison points to 1.59.x as closer than the surrounding releases; this heuristic is not a proof of semantic equivalence or exact historical provenance. Several differing method shapes are ordinary minification differences (e.g. has-engine local variables and fill branching).

Pinned playwright-core 1.59.1 in @core/browser, separately from the root test browser package. upstreamPlaywrightSource lazily loads the complete upstream generated injected asset and wraps its exported accessor exactly as the CUA wrapper expects. It checks the package version and fails explicitly if the internal asset layout changes. No browser launch or source extraction from ChatGPT.app is needed at runtime. assembleBrowserContext now defaults to this full source while permitting an explicit injected source. Existing CUA installation, credential-field protection, CDP contexts, retry logic and policy layers remain in place. The service assembly integration fixture no longer supplies a synthetic injected helper.

A real Chromium differential test installs both full sources into fresh pages and compares selector resolution (including roles, text, has/has-not, nth and Shadow DOM), full/incremental ARIA snapshots, iframe refs/depths, form fill success/errors, hit-target results and installation of the CUA credential hook. Explicit expected values complement source equality. This demonstrates the covered behavior of the complete upstream helper, not a handcrafted replacement API. Previously reconstructed vendor helper modules remain reference/test material and are not assembled into the default injected source.

The precise historical version of CUA's embedded helper remains unproven, and this scenario does not exhaust all Playwright actions, accessibility edge cases or browser versions. Production extension/native host and real-model integration remain incomplete. The important implementation change is that the default browser context now has a real full injected implementation rather than requiring a missing source supplied by the caller.

Validation: three-package build and full reconstruction suite passed: 599 tests, zero failures, explicit concurrency 4.

### 16.198 Public Playwright actions through the assembled RPC/CDP stack

Extended the existing service assembly integration scenario beyond AX actions to the public pageTab.playwright API. With no injectedSource override, domSnapshot, getByRole(...).click and getByLabel(...).fill now run through the public CUA binding, command transport/recovery RPC, actual Unix socket backend, original authority checks, assembled service and real Chromium CDP. Assertions verify DOM snapshots, a second physical button click counter and the actual date input value. The unchanged origin-rejection checks still precede approved page access.

The same scenario navigates to a fresh synthetic document, confirms the old helper is absent, obtains a new public snapshot and verifies another installation happened. A public role locator then clicks successfully in the new document. This exercises automatic reinjection instead of relying on a preinstalled helper in each test page.

Two fixture gaps were exposed and fixed: its ad-hoc telemetry stub omitted currentPlaywrightOperation and startLocatorRetry, so it now uses the restored default performance span and a traced retry recorder; its native backend event relay omitted Fetch.requestPaused/network events, causing the service-owned response interception to stall navigation. Those events are now forwarded and the test asserts Fetch.continueResponse. No production interception or authority checks were disabled. This records an important backend contract: enabling interception requires forwarding paused-request events through the native RPC bridge.

Browser discovery, host approval, telemetry sink and documentation remain synthetic test dependencies. This is an end-to-end execution check of the restored public/browser service stack with a real browser, not proof of the installed production extension or native application bridge. No model credentials or personal browser profiles were used.

Validation: expanded isolated integration scenario passed; complete suite remains 599 tests, all passing (concurrency 4). Production code is unchanged in this verification step.

### 16.199 Default host command timing and performance assembly

Restored Vx/$6/cce/dce/pce in runtime/command_timing.ts using Node's AsyncLocalStorage. Commands track their start time, subtract elicitation wait time in finally (including rejected requests), clamp/round the resulting duration and emit browser_use_agent_command with the original shape. Locator retry tracking begins only at the first failed attempt; finish is idempotent per retry tracker and aggregates success/timeout counts and elapsed time. Command finish itself remains non-idempotent, matching source. Concurrent and nested command contexts are isolated, and wrappers outside a command still execute normally.

At this stage assembleBrowserHost provided the original command timing implementation and the generic K2 pass-through performance fallback. This was not the production host I6 tracing implementation; section 16.206 corrects that assembly mismatch. Overrides remain available. The public Unix socket/Chromium integration test removes its temporary timing/performance substitutes and checks emitted real command outcome events instead; snapshot, role click, label fill and navigation reinjection still pass using the defaults. This reduces required caller wiring without replacing privileged host capabilities or auth services.

Differential tests execute the actual selected original symbols under a deterministic clock and compare exact event payloads, rounding, failure identity, repeated finishes, no-context behavior, successful/time-out retries, concurrent commands and nested contexts. Explicit count/duration assertions complement equality. Telemetry export SDK and privileged runtime/backend dependencies remain separate outstanding integrations.

Validation: three-package build passed; all 601 reconstruction tests pass with concurrency 4.

### 16.200 Default authentication QR flow uses the upstream packaged WASM

Added createPackagedAuthQrFlow, resolving zxing-wasm's exported reader WASM asset with Node package resolution and passing its file URL into the existing CUA asset loader. The actual bytes are still read through context.filesystem; the adapter does not bypass host filesystem permissions, fetch a CDN or read ChatGPT.app assets. assembleBrowserAuthHandoff now uses this flow unless an explicit QR implementation is provided. The service assembly integration fixture no longer has to supply placeholder QR methods.

An isolated test decodes the synthetic QR using the actual npm asset, checks its file URL/package path, repeated result equality, nonempty geometry and single host read. The assembled auth-handoff test now removes its fake decoder too: its screenshot fixture supplies actual QR image bytes, the default library decodes them, the prompt receives the correct payload, and a synthetic user decline completes/closes the challenge. Existing real Chromium screenshot tests continue to cover capture/blank-page/disappearance-monitor behavior. No real credential or authentication submission is performed.

This closes the explicit production QR selection gap recorded in 16.194; auth safety review, broker/privileged host, production extension/native providers and live-model integration remain outstanding. Three-package build and 602-test suite passed. After replacing the handoff test's decoder fixture, its four focused tests also passed.

### 16.201 Upstream markdown-it and default text input assembly

Source evidence identifies ur/t_/N9 as markdown-it (the bundled configure errors name it explicitly), not marked. Pinned markdown-it 14.1.0 in @core/browser and added its TypeScript declarations. The exact historical bundle version remains unproven. markdownTextPaste constructs the upstream renderer with the original N9 options (breaks true, html/linkify/typographer false), then reuses the already restored whitespace, document policy and clipboard execution. assembleServiceCommands now defaults coordinate/DOM typing and locator fill to this implementation instead of requiring a caller-supplied typeText callback.

A differential test evaluates only the original contiguous Markdown-library source segment plus its selected export/punycode helpers, without executing browser-service startup. It compares original renderer output with the upstream dependency across formatting, lists, headings, code, raw HTML escaping, entities, links/invalid schemes, Unicode domains, tables, strikethrough and whitespace; plain clipboard output is checked too. Unrelated manifest/environment initializers are inert in that isolated oracle.

The full public API/socket/CDP test removes its placeholder typeText. It fills a real input with Chinese/emoji text, verifies locator.fill keeps Markdown literal (as required by original includeRichText:false), then uses cua.type to render bold/italic HTML in a real contenteditable editor. An initial test incorrectly expected locator.fill to format Markdown; corrected the expectation and used the proper rich-typing API without changing production semantics. Runtime.bindingCalled is now included in the test backend's clipboard event relay. Existing authority/interception and navigation tests remain active.

This closes the default renderer/text-input assembly gap; it does not establish a different historical parser version as identical for every possible input. Production privileged host/extension/native backends and live-model integration remain incomplete.

Validation: three-package build and 603 reconstruction tests pass (concurrency 4).

### 16.202 Reconstruct the cua-repl package launcher and instruction loader

Added readable index/launch/instructions TypeScript under @core/cua-repl, its original-style bin, exports, package instruction imports and 27 instruction/banner assets with @oai scopes remapped to @core. The reconstruction build/check now includes this fourth package. launch retains absolute-executable validation, surface normalization/deduplication, platform/cloud/orbit guidance, optional audio instructions, allowlist augmentation, trusted-service/banner override precedence, tool metadata, inherited stdio, signal forwarding/listener cleanup and child exit propagation. No model-specific protocol is introduced.

Instruction differential tests compare all supported platforms plus an unsupported platform, environments and guidance modes. Real temporary executable fixtures compare the original and reconstructed launcher environment/tool payloads, missing/relative executable errors, missing/unknown/empty surfaces, deduplication, audio, overrides including empty strings, nonzero exits and signal termination. Only selected synthetic environment values are captured. The original source accepts empty surfaces despite its README claiming otherwise; the implementation behavior is retained.

This restores the actual JavaScript launcher package rather than implementing a substitute MCP shell. The external NodeREPL engine is not contained in these three JS files and is not reconstructed by this step. Default @core/browser-desktop/service, @core/sky/service and @core/cua/tinyskyAlt entry wiring remain incomplete, so the package does not yet constitute a standalone working computer-use server. Existing browser service and AgentLoop work remains separate until those boundaries are connected.

Validation: four-package build passed. Initial full run had one failure in the unchanged timer-sensitive WebMCP background-poll test (604/605); its four focused tests passed on retry, and the full suite then passed all 605 tests with concurrency 4. No WebMCP production/test logic was changed.

### 16.203 TinySky factory and global import entry connected

Restored create_tinysky_alt and globals, exposed @core/cua/tinyskyAlt in the package, and preserved the original initialization order: browser/computer provider setup runs via Promise.all, initial bootstrap emits documentation without inventory, browser API is bound to the same provider and global agent, native target-specific methods use the existing app binders, and globals aliases initialize to getState before publishing cua. Surface configuration is read from nodeRepl.env, normalized/validated exactly as in the installed source, including empty surfaces. Browser setup imports @core/browser; Sky remains deferred so browser-only mode does not require the unfinished native package.

An original-source/compiled-source differential matrix covers all three native targets plus unsupported target, enabled/disabled surface combinations and valid/invalid/missing window references, comparing call order, outputs and errors. Providers/binders are test dependencies for that matrix; it does not establish native OS behavior. The public service integration now directly imports the actual package global entry instead of manually building its browser API/bootstrap. It verifies no initial tab enumeration, initialize/getState identity, repeat-import identity and explicit fresh inventory, then runs the existing real Chromium snapshots, AX/locator actions, Unicode/rich typing and navigation reinjection through global cua.

Browser global initialization is now executable against the supplied trusted browser RPC. This does not supply the external NodeREPL engine, browser-desktop/sky trusted service exports or standalone native provider. Package root/other alternate entry points also remain outside this newly completed subpath and require further reconstruction.

Validation: four-package build passed; full suite passes 606 tests with concurrency 4.

### 16.204 Reuse the bundled Sentry light SDK for the host error reporter

Trusted-service entry inspection identified another bundled third-party dependency: the service's SDK version marker is 10.48.0, and its init implementation explicitly selects node-light/node-core with the light integration list. Pinned @sentry/node-core and @sentry/core 10.48.0 and use their public light/init and createTransport APIs. No Sentry internals are reconstructed.

Restored the CUA cH/dH wrapper in runtime/error_reporter.ts: module-lifetime initialization, exact literal-1 ambient-network opt-out, retry after initialization failure, original production/release/PII options, GAAS versus Node REPL user selection, and exception/user/tag forwarding. The transport calls the privileged runtime's fetch, preserving headers/body/keepalive/referrer policy and mapping status/rate-limit response headers. Host assembly now defaults to this reporter while retaining explicit injection. The original destination is retained for source fidelity; standalone telemetry destination/policy remains a deployment concern, not implicitly replaced by an unrestricted network client.

Differential tests compare the original selected functions against the restored wrapper, including disabled-then-enabled state, repeated calls, initialization failure, user matrix, transport options and fetch error identity. A real upstream SDK test serializes an exception envelope through a synthetic host fetch and verifies user/tag metadata; it sends no external requests. The real Chromium service integration removes its reporter stub and sets the original ambient-network disable flag. This closes the reporter dependency in mH, not the remaining runtime telemetry/configuration, trusted-service module export, external NodeREPL or native provider gaps.

Validation: four-package build passed; all 609 reconstruction tests passed with concurrency 4.

### 16.205 Upstream Statsig and original browser telemetry lifecycle

The browser-service bundle explicitly sets SDK_VERSION to 3.33.1. @core/browser now pins @statsig/js-client 3.33.1; this is evidence from the browser bundle, independent of Sky's broader ^3.32.6 manifest range. Restored CUA's fv/gh/KM/WM/hv/$M/bh/GM/VM/zM and gv/Sh/xh/dt/Gee orchestration using the actual SDK. Initialization and current-user readiness remain separate; gate reads wait for the latest update, enforce Ready/success/Recognized, and preserve original deadline errors. The service-lifetime identity cache, user/backend updates, disabled ambient networking, event prefix/metadata precedence, and exception sink are retained. Network requests use host fetch; original SDK key/endpoints are retained as source behavior, not a new standalone telemetry policy.

Host assembly now defaults its error sink and feature checks to the shared telemetry instance. Command-runtime assembly defaults its telemetry callbacks to that same instance, with optional partial overrides. The full Chromium service fixture removes five telemetry placeholders plus the host gate/error placeholders; ambient networking remains disabled, and its event observer still records internal event attempts explicitly.

Original-function differential tests cover normal/GAAS initialization, disabled mode, user caching/update, backend deduplication, gate validation, timeout/failure propagation, event metadata, and a race where an old user response finishes after a newer update starts. A real Statsig SDK test reads synthetic gate values and caller identity solely through a local host-fetch implementation, verifies gate evaluation, and shuts the client down. No request is made to original telemetry endpoints. SDK internals are reused, not reconstructed.

Validation: four-package build and all 613 reconstruction tests pass (concurrency 4). This closes the main Statsig runtime callback defaults; production trusted-service exports, remaining host/config/localization/auth wiring, NodeREPL and native providers are still incomplete.

### 16.206 Correct the host performance default to original I6 command tracing

Source mH explicitly installs I6, not the generic K2 pass-through fallback previously selected in section 16.199. Restored mn/Ele/I6 and their command/result attribute helpers in runtime/performance_span.ts. Host assembly now defaults to I6; discovery/elicitation spans and service setup likewise default to its withSpan. The K2 fallback remains available in the lower-level accessibility service where originally applicable.

The implementation uses Node AsyncLocalStorage and the existing nodeRepl.telemetry capability; there is no new OpenTelemetry SDK. It preserves delegated withSpan behavior, startSpan/end fallback, primitive-only attribute filtering, swallowed start/end failures, propagated action/result-mapping failures, command context isolation, numeric tab/timeout projection, origin-only URLs, auth-result schema projection, snapshot counts and cycle-safe result string counting. All original command mappings are retained.

Three differential tests evaluate the original selected functions, compare every original mapped command over malformed/normal payloads and varied results, verify delegation/error behavior, and test concurrent/nested command contexts. The initial oracle construction evaluated the map before its function bindings and hit a temporal-dead-zone error; ordering was corrected without changing production behavior. The public service integration removes its pass-through span overrides, supplies only a capture-capable host telemetry sink, and verifies actual setup/click/snapshot spans from the real Chromium flow.

Validation: four-package build and all 616 tests pass with concurrency 4. This corrects a production assembly discrepancy; discovery failure reporting, localization/auth/config defaults, trusted-service exports, NodeREPL/native providers and live-model integration remain unfinished.

### 16.207 Upstream FormatJS localization and remaining context telemetry defaults

The source's nb/R3/k3 path uses @formatjs/intl and @formatjs/intl-localematcher. Added pinned 3.1.8 and 0.6.2 dependencies respectively, and decoded the original P3 translation table into readable Unicode TypeScript (64 locales). The exact historical vendor versions are not marked; these selected upstream versions are behavior-checked against the installed bundled libraries. Original k3's underscore normalization, best-fit matching, RangeError-only English fallback, shared formatter cache and formatMessage delegation are retained. ICU formatting and locale matching remain upstream library code. The test oracle uses explicit dev dependency tslib 2.9.1, matching the installed helper version used for validation.

Browser context assembly now supplies real localization, the shared exception sink and Statsig page-asset event adapter by default; command runtime no longer requires a context placeholder. Restored Zle discovery-failure projection and made it the host default. This intentionally uses low-level bh/logEvent, preserving the unprefixed event name and lack of an additional ambient-network check at that wrapper; SDK/client state still controls actual event handling. Counters are converted to strings and failure details projected exactly as in source.

An isolated oracle evaluates only the bundled FormatJS library segment, never browser bootstrap. Differential tests compare the full translation data, every locale plus language/region/underscore/invalid fallback cases, ICU plural/select/rich text, missing arguments and warning codes, and discovery-failure events. The real Chromium service fixture removes discovery reporting and all context/localizer placeholders. Translation default-message tests intentionally suppress expected missing-translation console warnings; a separate test checks error codes and fallback results.

Validation: four-package build and all 619 reconstruction tests pass with concurrency 4, including a repeat after explicitly declaring the oracle's tslib dependency. Default browser context/localization and discovery reporting are now wired; auth/config/native broker boundaries, actual trusted-service exports, external NodeREPL/native providers and real-model integration still remain.

### 16.208 Restore native auth broker client and wire GAAS host defaults

Restored original b6/lb/Bx/sle/ale/Dx in runtime/auth_broker.ts. Native observation queries retain the socket/session checks, 1 KiB single-response transport, exact two-key status response, three-second timeout and generic unavailable failure. The challenge client preserves 128 KiB framing, registration fields, challenge/option validation, null-prototype field maps, delivery-mode compatibility checks, predecessor receipts, submission/completion promises, password metadata negotiation, QR messages and original close/failure/idempotence behavior.

The broker uses the existing privileged ub-style connector from createBrowserPipeClass, not a new unrestricted socket client. assembleBrowserHost now defaults both native broker callbacks to this restored implementation; all host options are optional, and service assembly can omit its host overrides. The public Chromium fixture drops its unused broker callbacks. This is the JavaScript client side of the native broker, not the native credential store/service implementation.

Differential tests execute the original selected bindings and compare registration/submission/completion traces, all delivery-mode combinations, invalid IDs/fields/options/statuses, terminal failures, strict observation replies, send/close errors and a mocked three-second timeout. A real isolated Unix socket fixture exercises the default assembled GAAS host: status query, registration, synthetic submission and completion with password metadata. It supplies only the privileged connection capability; no personal credentials or installed native service are used.

Validation: four-package build and all 623 tests pass with concurrency 4. Host broker callbacks are now connected; auth safety/config/WebMCP command defaults, trusted-service module exports, external NodeREPL, native providers and live-model integration remain unfinished.

### 16.209 Default auth safety, WebMCP configuration and command telemetry wiring

Command-runtime assembly now supplies the packaged auth safety review using the same documentation module URL/bundle as runtime instructions. Auth preflight/handoff and bot-detection events default to the shared browser telemetry module. Command/context/host callbacks can now all be omitted; documentation remains an explicit packaging input. The real public Chromium fixture removes its entire commands override block.

Restored WebMCP defaults bind exactly to Ar, gh, $M and dt: the ambient-network opt-out, initialized-client feature gate reader, dynamic configuration and event emitter. Corrected the misleading dependency name isLocalRuntime to ambientNetworkDisabled throughout production code and fixtures. The original checks disabled ambient networking, not local execution. Importantly, Bh calls gh directly rather than Gee's caller-identity wrapper; default gate lookup therefore requires Statsig initialization but does not add an extra caller-identity gate. Explicit command and safety overrides remain supported.

New tests compare the ambient switch to original Ar, use the real upstream Statsig client with synthetic host-fetch responses to verify default gate/config access without caller identity, and verify packaged auth safety rejects missing/empty instructions before capture or approval. Existing WebMCP original-function comparisons retain their behavior after the dependency rename. The safety module's original jn initialization corresponds to an already-evaluated ESM import; the retained initializer hook is documented accordingly.

The first new SDK test cleaned up via StatsigClient.instance, which is unsupported in Node and returned a different client. Assertions passed but the worker remained alive; the two known affected workers were terminated, so that run is not a passing suite. The test now captures the actual client during its real initializeAsync call and shuts that instance down; focused tests then exit normally. Production behavior was not changed to hide the cleanup issue.

Validation: four-package build passed; final full suite passes all 625 tests with concurrency 4. Remaining service work is now principally the actual browser-desktop exports and packaged environment documentation/assets, followed by external NodeREPL/native provider and real-model integration. Passing default-assembly fixtures does not establish those external layers.

### 16.210 Real browser-desktop exports and environment documentation

Added @core/browser-desktop root setupBrowserRuntime and service handleRpc/classifyError exports, preserving a module-lifetime service dispatcher. The package delegates restored logic to @core/browser; no third-party implementation is duplicated. Added a typed @core/browser/service facade and a fifth package build/type-check target.

The installed desktop service SHA256 is 0c1cb5b13bbe6ae70cea751740e537885a12d53cd076c864cd9154ef6e86e3bb and its client is c1ca88410dab039d763e668ecc561b4cc1e041bfa289e318a9244c600c373c10. These differ from the CUA-embedded bundles. Desktop includes default plus codex-app/cloud/orbit/training documentation (29/24/24/15 environment Markdown documents). A new Acorn extractor statically decodes the literal bundle without executing vendor runtime; tests compare every environment manifest and document against installed files, with only scope mapping.

Public-package tests compare actual desktop client RPC sequences against the installed desktop client across recovery protocol versions and orbit selection. The actual compiled service entry initializes all four environments with synthetic privileged capabilities and no browser/network/approval calls, checking disabled members, error boundaries and lifecycle hooks. Two once-per-runtime hooks are expected: response recorder (10 seconds) and notifications (12 seconds). Initial compiled imports exposed six directory specifiers that TypeScript source tests had tolerated; explicit extensionless /index specifiers now produce valid Node ESM. This is representative compatibility evidence, not proof of complete equivalence between the two original bundle variants; browser metadata and other variant differences remain to audit.

Validation: five-package build and type checks passed; all 628 reconstruction tests passed with concurrency 4. The external NodeREPL engine, native Sky provider, separate AX WASM asset, remaining desktop/embedded variant audit and real-model integration remain open. No personal browser state, tokens or external model requests were used.

### 16.211 Desktop discovery audit and first native Sky service implementation

Directly compared the installed desktop catalog (dp/HE/WE/si/pp/sc), profile-path function T3 and pipe enumeration Vce/Kce/Xce with the restored implementation. All five browser families, extension-distribution metadata and shared references agree. Profile tests cover four platforms, environment precedence and empty variables; discovery tests cover configured paths, duplicates, invalid relative/whitespace paths, directory enumeration and failures. This resolves the catalog suspicion from the previous literal inventory: additional literal occurrences did not prove different catalog values. It does not establish whole-bundle equivalence.

Started restoring @core/sky from its actual 0.7.13 JavaScript and declarations. create_service.ts implements the service closure: lazy platform client, retry after construction failure, setup method discovery, own-value-descriptor dispatch, receiver binding, exact screenshot/window/audio wire projection and Linux drag handles. Handles are stored only after successful start, reused for repeated starts, and removed only after successful end. Failed move/end retain handles, matching the original. The audio model policy parses the original SKY_AUDIO_MODEL_ALLOWLIST and reads trusted turn metadata anew on every recording request; inherited/getter methods cannot be executed through this dispatcher.

Four original-code differential tests cover malformed catalogs/metadata, live model changes, platform variants, media projections, initialization failure, property access boundaries, repeated drag operations and failures. Only inspected original service/policy declarations are evaluated, with synthetic clients and real upstream tslib for the original compiler helper. No installed service bootstrap, native app, personal state or audio recording is run.

Six-package build and type checks pass; all 635 reconstruction tests pass with concurrency 4. Sky remains an internal service factory with explicit platform-client construction, not a complete @core/sky public entry or trusted service. Next is restoring platform clients/native transport (the installed Mac target has 20 JS modules), alongside the remaining NodeREPL engine, AX binary dependency and real-model integration. Dependencies remain reused, including Sky's declared Statsig dependency when its telemetry module is restored.

### 16.212 Mac native-pipe transport and host-service protocol

Restored installed Sky 0.7.13 native-pipe.js as readable targets/mac/native-pipe.ts, retaining its privileged nodeRepl bridge rather than substituting unrestricted net access. The implementation includes 8 MiB little-endian framing, buffered partial frames, JSON-RPC response validation, sequential requests with execution-time deadlines, metadata decoding, pending-request cleanup, API-version ping, connection retry/startup and late-connection cleanup. Default socket/group-container and application identifiers remain original protocol values. The transport uses Node standard libraries; there is no new third-party transport implementation.

Host-service exchanges preserve ensureService and attachComputerAudio IDs/timeouts, listeners and connection cleanup. Ambiguous audio attachment failures retain the original warning not to retry; explicit server errors remain distinct. Startup prefers the desktop host service, otherwise the original launchServices application-path/CODEX_HOME/bundle-ID resolution. Original native error codes and error classes are restored. Installed errors.d.ts declares formatOSStatus but errors.js does not export it, so no invented runtime export was added; source hashes are recorded in reconstruction/sky-native-source.json.

Six tests compare framing/error shapes, request queue/metadata/server failures, write/parse/close/error/timeout behavior, host reply/listener behavior, version mismatch and startup retries against the original installed module. An additional scenario within those tests uses the restored transport against an isolated real Unix socket for fragmented ping and queued RPC. Tests use only synthetic server messages, paths and launch callbacks; no personal application, real native service, model request or audio recording is started.

Validation: six-package build/type checks pass; full suite 641/641 passes with concurrency 4. This establishes the JS transport layer, not the native executable or complete Mac client. Platform command adapters, client lifecycle/policy/telemetry, public Sky assembly, external NodeREPL and real-model integration remain incomplete.

### 16.213 Mac client operation protocol and window results

Restored MacComputerUseClient and its singleton from installed client.js/client.d.ts. All native methods now build the original request types/actions: apps/policy/start/state, audio, click/drag/paste/secondary action/key/scroll/value/selection/text. Preserved element-ID versus coordinate targeting, alias normalization, explicit validation, omission of undefined object fields, positional action payloads, API/timeout defaults and metadata precedence. Native protocol types retain their original ComputerUseIPC names.

The per-version transport-promise cache deduplicates concurrent creation, removes rejected promises only if still current, loops past closed transports and separates API versions. Request metadata is read after acquiring transport, so the trusted current turn remains authoritative unless explicitly overridden. The restored client uses the actual restored MacNativePipeTransport; no fake production backend was introduced.

Restored window_result: native screenshot/text/instruction validation, nullable screenshot URL, per-app instruction suppression using bundle ID or original fallback identity, and the original Numbers exception. Four differential tests compare complete native envelopes/default/invalid argument cases, metadata/pruning, failed/closed/concurrent connection caching and window instruction behavior against installed modules. The isolated real Unix socket integration now additionally exercises MacComputerUseClient getAppState and click through actual ping/framing/transport, checking emitted native payloads. These are synthetic app identifiers only, not real desktop operations.

Validation: six-package build and type checks pass; all 645 tests pass with concurrency 4. Public Mac adapters still require the original app-policy approval wrapper, telemetry and audio/file handling; these must be connected before public Sky assembly. Native executables, other platforms, external NodeREPL and real-model integration remain incomplete.

### 16.214 Mac approval policy and upstream Sky telemetry

Restored computer-use-policy and lazy-client. App inputs are snapshotted from own data descriptors before lookup/approval, rejecting accessors and inherited app properties. Successful approval binds the operation to the policy result's canonical app path, preserving immutable descriptors and original response metadata. Denied/forbidden policy decisions and non-accept elicitation outcomes prevent execution. Persisted-state telemetry suppression, approval persistence, call-ID fallback, audio approval and native cancellation classifications follow the original implementation.

Restored computer-use-telemetry with its original structured event fields, module-lifetime client/launch state, analytics and ambient-network switches, build tier, host fetch, identity update and live turn metadata. Sky's installed @statsig/js-client resolves to 3.33.3 (manifest range ^3.32.6), so Sky now pins upstream 3.33.3 independently of the browser bundle's 3.33.1. No Statsig code is reimplemented. The original nested protobuf metadata exceeds the SDK's string-map TypeScript declaration, so the transport preserves the actual original value with a documented type assertion rather than flattening it.

Five new tests compare original policy/telemetry with the reconstruction across all approval actions and policy decisions, persisted state, accessor rejection, input mutation during approval, immutable canonical inputs, audio call-ID selection, native cancel/failure, disabled/re-enabled analytics, identity initialization failures and logging failures. A real upstream 3.33.3 SDK test uses synthetic host fetch for initialization/user identity, exercises structured logging and shuts down the actual instance. No original network endpoint is contacted during tests.

Validation: six-package build/type checks pass; full suite passes 650 tests with concurrency 4. Policy and telemetry defaults are ready for Mac operation-adapter assembly; public Mac client factory/audio handling and complete Sky/NodeREPL/native/model integration remain unfinished. Original analytics destinations and plugin identity are retained for fidelity; standalone deployment policy is not silently redefined.

### 16.215 Mac operation adapters, audio flow and factory

Restored all Mac operation adapters and create_client using the installed module boundaries, extensionless imports and original window declarations. Field mappings preserve snake_case public inputs versus native camelCase payloads, and each app operation invokes the restored approval policy before obtaining/using the client. list_apps retains the original public projection and nullish fallback behavior. Each factory owns its own instruction-seen set; audio methods appear only for literal SKY_ENABLE_AUDIO=1.

Restored audio start/stop and core/uint8 with Node standard libraries. Start preserves default/bounded integer duration and approval order. Stop suspends the host timeout when available, requires a local file URL, reads its bytes, creates an audio/wav data URL, and conditionally checks model/turn metadata before the original attachComputerAudio host request. Session/turn field names, JSON error propagation and attachment uncertainty behavior remain original. No real audio is recorded in tests.

Three new differential tests exercise the complete original factory and every adapter using synthetic native clients and host approvals, including per-factory instruction state, feature flag values, duration/approval matrix and temporary audio files with attachment/model/metadata failures. Real isolated Unix socket integration now exercises the public Mac factory through native policy lookup, approval, canonical app binding, get_app_state and click; all actual restored client/policy/transport layers run, with only the external host/server supplied by the fixture.

Validation: six-package build/type checks pass; all 653 reconstruction tests pass with concurrency 4. The Mac JavaScript factory is now assembled, but not verified against an installed native executable. Other platform clients, top-level Sky service/client routing, external NodeREPL, AX binary dependency and real-model integration still prevent claiming complete standalone computer use.

### 16.216 Sky RPC proxy, Linux accessibility presentation and config selection

Restored sky.js state as createSkyProxy with an explicit direct-client constructor pending complete platform routing. It captures the host at construction, attempts setup once, defers setup errors to missing method calls, binds forwarded functions, preserves reflection traps, restores media bytes and Linux window AX presentation, and generates independent RPC drag handles. The factory returns a wrapper containing sky so an arbitrary remote then member is not accidentally assimilated by the factory Promise; the original exported proxy behavior is unchanged. This is not yet the package root singleton/export.

Restored Linux accessibility_tree: nonenumerable render/inspect methods on every node, original data retention, container flattening, redundant text removal, text-run merging, interaction/state/action descriptions, escaping and focused-modal prefix. Restored load_options with the original trimmed OAI_SKY_CONFIG_PATH precedence, raw JSON behavior and platform selection; no new validation/default policy is invented.

Four new tests compare original module behavior for 300 deterministic varied trees, rendering and descriptor/data preservation; all platform proxy media/method/reflection paths; Linux handle identity; setup failures, direct laziness and invalid hosts; and temporary config files. The tree generator was strengthened to avoid low-bit LCG branching bias and the focused suite rerun successfully. The real isolated Unix socket integration now adds restored RPC proxy -> Sky service -> Mac factory -> approval -> native client/transport, validating state reads and canonical element actions without a direct-client fallback.

Validation: six-package build/type checks and full 657-test suite pass (concurrency 4); strengthened focused tree/proxy suite also passes. Remaining work includes full Linux/Windows platform clients, top-level Sky exports/routing, external NodeREPL, native executable validation, AX binary dependency and real-model integration.

### 16.217 Linux helper transport and client state

Restored ElementIds with monotonically assigned compact IDs, per-window native mappings, retained mappings on filtered refresh, stale removal on full refresh and numeric-ID resolution errors. Restored ActionSettler's mutable options reference, non-shortening deadline, default/clamped delay and repeated wait checks; failed sleeps preserve the deadline for retry.

Restored SkyLinuxTransport using Node child_process rather than a replacement RPC library. It starts a lazy persistent helper, sends numeric-ID JSON lines, parses fragmented output, retains an 8192-character stderr tail, refs active children/unrefs idle streams, matches replies, rejects pending requests on malformed output/process errors and recreates terminated helpers. Explicit restart errors retain child-specific pending rejection and old-process isolation. sky_linux preserves binary/argument-keyed caching, mouse-size arguments, null input default and JSON-string output. package_bin retains override bypass and nearest-package binary lookup/existence checks; native binaries are still separate prerequisites.

Eight new tests compare the installed implementations for IDs/refreshes, deadlines/extensions/sleep failures, real synthetic helper subprocesses (fragments, unknown IDs, ordinary failures, malformed responses, exit/restart, missing executable), package resolution and actual wrapper reuse across mouse-size configurations. Temporary helper executables run only fixture Node code and exit explicitly; no original Linux desktop binary is run.

Validation: six-package build/type checks and all 665 reconstruction tests pass with concurrency 4. Linux command adapters/factory, Windows client, top-level Sky routing, external NodeREPL, native binary validation, AX asset and real-model integration remain incomplete.

### 16.218 Linux operation and observation adapters

Restored all non-audio Linux operation modules using original declarations and module boundaries: activation, pointer/key/text operations, clipboard, app/window listing, screenshots/window state and drag handles. Preserved differences between wait/defer behavior (clipboard_release does neither), compact-ID resolution only for applicable commands, defer-before-JSON-parse ordering for clipboard_read/type_characters, and no deferred delay after pure observations. Window state loads screenshot bytes before updating element IDs, then restores AX presentation; filtered-query detection remains trimmed truthiness.

Drag handles preserve idle/dragging/ended transitions only after successful native commands, exact repeated-start/move/end failures and original point-spread precedence. Screenshot files are loaded concurrently with Promise.all and converted using the original image/jpeg data-URL behavior. Full-desktop declarations and Point are restored; all their relative imports were checked for existing targets.

Two new differential integration tests exercise every adapter and drag lifecycle against original modules through real synthetic helper subprocesses, capturing emitted requests and wait/resolve/assign/defer traces for success and native failure. They verify screenshot bytes, missing-file errors, window presentation and operation state after failures. An initial fixture object was missing a closing brace; fixed before tests ran, with no production change made to accommodate it.

Validation: six-package build/type checks and all 667 tests pass with concurrency 4. Linux audio subprocess behavior and factory assembly are next; Windows, top-level Sky routing, external NodeREPL, native binary/AX assets and actual-model integration remain open.

### 16.219 Linux audio lifecycle and complete factory

Restored core/cli using Node child_process with original environment merge, command logging, Windows .cmd selection, optional stdin, output trimming and exit-check behavior. Node's SpawnOptions expresses the original type-only spawn argument utility without reconstructing a third-party runtime. Restored Linux audio's starting/active state, duration validation, pactl default sink lookup, ffmpeg pulse-monitor arguments, progress=continue readiness, completion tracking, graceful q stop, error text and local WAV result. State clearing/wait order and original temporary-file lifetime are retained.

Assembled the Linux factory with copied options, shared ActionSettler/ElementIds, all operation methods in original insertion order and literal SKY_ENABLE_AUDIO=1 optional audio methods. The real-helper adapter test now additionally invokes the factory's window-state/click/screenshot sequence and mutates caller options after construction to verify isolation.

Three new tests compare original implementations with actual subprocesses: CLI input/env/output/exit handling; synthetic pactl/ffmpeg executables for concurrent starts, invalid durations, readiness, successful stop, early exit, failed stop and empty/failed sink discovery; and factory method order/audio flags. Only synthetic helper code is placed at the head of test PATH, recordings are fixed temporary bytes, and environment/temp files are restored afterward. No real audio or PulseAudio session is accessed.

Validation: six-package build/type checks and full 670-test suite pass with concurrency 4. Linux and Mac JS factories are now assembled. Windows client, top-level Sky export/routing, external NodeREPL, native executable/AX resources and actual-model integration remain incomplete; native desktop behavior has not been proven by synthetic helper tests.

### 16.220 Windows approval and turn-scope protocol

Restored Windows codex_turn_metadata merging: environment metadata then host request metadata, nested turn fields, removal of the wrapper key and preservation of a nonempty outer approved-app value. Restored helper protocol pieces for approved-app/request-budget metadata, approval parsing, app/audio elicitation, audio/no-persistence rejection of global/always approvals, and original caller-ID prompt behavior.

Restored turn-scope/home helpers: Windows/UNC normalization, /mnt drive conversion, WSL path translation/fallback, USERPROFILE/home defaults, unchanged nonempty session/turn values, NUL-separated scope keys and sanitized interruption-marker paths. Marker access and swallowed write failures preserve the original semantics. The physical-Escape stop message and marker protocol are retained, but transport enforcement is still to be wired in the next stage. Tests inject filesystem/process capabilities, never touching personal interruption records or launching WSL.

Four tests compare original selected functions for metadata precedence, app/audio approval matrices, request-budget insertion, home/path/WSL normalization, scope keys and marker helpers. Initial oracle selection accidentally chose an outer function containing the parser; selecting the smallest matching function fixed the fixture without changing production code. The strengthened budget oracle test also passes.

Validation: six-package build/type checks and full 674-test suite pass; focused protocol tests pass after oracle strengthening. Windows helper transport/client/factory, top-level Sky exports, external NodeREPL, native/AX resources and actual-model integration remain incomplete.

### 16.221 Windows helper transport lifecycle

Restored WindowsHelperTransport with original lazy subprocess creation, JSON-line request IDs and metadata budgets, request/event/exit dispatch, helper unref and parent-exit cleanup, stderr error details, and scoped pending-request cleanup. Approval replies invoke the existing restored approval protocol and replay only after acceptance with approved-app metadata. Turn changes send end_turn with the previous metadata; unrelated end_turn requests are ignored. Both explicit stop responses and exit code 130 persist the scoped interruption marker, blocking subsequent instances in the same turn while allowing another turn.

Timeout behavior preserves the original option: normally kill/reset the helper and reject its pending siblings; preserveHelperOnTimeout only rejects the timed-out request. Malformed JSON rejects pending requests without replacing the helper. No new third-party implementation is introduced; the transport uses Node child_process and the reconstructed protocol helpers.

Four differential tests execute both the installed original class and reconstructed class against real synthetic Node helper processes. They compare approval/request traces, budgets, turn transitions and events; verify approval denial without replay, malformed-JSON reuse, both timeout policies, sibling rejection, synthetic stop responses and exit-130 persistence across instances. CODEX_HOME points to a disposable relative directory, avoiding personal markers and WSL conversion. These tests prove the covered JavaScript transport semantics, not actual Windows native-helper interoperability.

Validation: six-package build/type checks and all 678 reconstruction tests pass. Windows computer-use base/client/factory, Sky public entry routing, external NodeREPL, native executables/AX resources and actual-model integration remain incomplete.

### 16.222 Windows base client and Window2 contract

Restored WindowsComputerUseClientBase and extracted readable window_protocol helpers from its original module: window/app/ID validation, coordinate rounding, legacy element aliases, click routing, input methods, app/window listings, secondary actions, value assignment and result normalization. State parsing preserves original accessibility validation, optional fields and screenshot defaults; screenshot emission prefers nodeRepl and falls back to codex using the original payload. Restored optional audio start/file loading and the literal SKY_ENABLE_AUDIO=1 method exposure rule.

The base retains host turn-ended registration, metadata capture on each request, suspended-timeout wrapping, duplicate end-turn suppression, retry after end-turn failure and identity-based cleanup that cannot erase a newer captured turn. Close is idempotent, unregisters the hook and delegates transport disposal. Copied all original Window2 declarations with extensionless imports, verified all relative import targets, and recorded original module/declaration hashes. No new dependency was reimplemented.

Four differential tests compare the original class and the readable class: operation request/validation matrices; malformed state/list response projections and both image-output hosts; synthetic WAV bytes/audio flags and turn-end deduplication; failed end-turn retries and an overlapping newer turn. No real app or recording is accessed. Six-package build/type checks and the final full 682-test suite pass with concurrency 4, including the additional turn-race test.

The concrete Windows client still needs its native-pipe transport and shared helper selection/refcount logic. Windows factory, Sky public exports, external NodeREPL/native/AX resources and real-model integration remain incomplete.

### 16.223 Windows native pipe and concrete client assembly

Restored the native-pipe branch of computer_use_client as readable WindowsNativePipeTransport: trusted host/config/path checks, captured intrinsic Promise.then, lazy connection with late-arrival disposal, per-client serialized requests, 4-byte little-endian JSON-RPC framing, original 8 MiB outbound/64 MiB inbound limits, incremental decoding, stale-connection guards, response errors and reset/reconnect behavior. Approval requests retain AsyncResource-bound caller context, suspend pending request timers while the host UI runs, send the original error envelope when UI is unavailable, and restart timers only for the current connection.

Restored WindowsComputerUseClient transport selection and shared helper reference counting. Explicit transport wins; the literal trusted-host native-pipe flag selects the pipe; otherwise helper settings determine the shared transport cache. Original helper path/command precedence, parent PID arguments, architecture-specific binary selection, environment override and frozen class are retained. The factory now returns the original Window2 client contract and constructs the concrete client.

Six differential tests exercise original and reconstructed clients through fragmented synthetic native-pipe connections and real synthetic subprocess helpers. They verify sequential calls, request/approval envelopes, caller context, approval duration exceeding request timeout, missing UI/trust/path rejection, invalid JSON and oversized input, timeout reconnection, late connections, intrinsic-then protection, outbound frame limits, close during connect, shared helper identity and last-reference disposal. The Windows factory is exercised using the synthetic trusted host. These checks do not establish real Windows native-service interoperability.

Six-package build/type checks and all 688 reconstruction tests pass with concurrency 4. Sky top-level routing/exports, external NodeREPL, native executables/AX resources and actual-model integration remain incomplete.

### 16.224 Sky public package, platform routing and CUA integration

Added original-shaped root/service exports: @core/sky exports the singleton sky proxy and SkyClient type, and @core/sky/service exports singleton handleRpc. The platform dispatcher selects the restored Linux/Mac/Windows factories; root setup captures the host at import time while direct client construction remains lazy, and service construction uses the actual load_options/platform factory. Restored SkyClient/Options namespace declarations and original overloads. The original mirror_map side-effect import only creates/reads a local demonstration map; no public behavior or initialization dependency is lost by omitting it.

Publishing actual Sky types exposed earlier CUA binders' broad Record<string, unknown> argument builders. Replaced those annotations with Parameters<typeof computer.method>[0] and derived Linux/Windows window/state/screenshot types from the real client contracts; runtime operation logic is unchanged. Six-package build and type checks now pass with the published type surface.

Four subprocess tests compare the installed and reconstructed package entries for trusted RPC, lazy direct Linux selection, setup failure and untrusted-host rejection. A fifth integration test imports the public @core/cua/tinyskyAlt global, follows cua.getApp through the assembled Sky service and Windows native pipe, then clicks and reads screenshot bytes. The initial fixture incorrectly requested emit:false for Windows screenshots; the original binder disallows this. The test now asserts that rejection and uses the supported default, preserving implementation behavior.

Validation: all 693 reconstruction tests pass with concurrency 4. This proves the tested public JS package chain with a synthetic Windows host; installed native-service interoperability, external NodeREPL/native/AX resources and actual-model integration remain incomplete. Updated the root README to distinguish current status from historical milestone notes.

### 16.225 Embedded NodeREPL source discovery and first worker helpers

Read-only inspection establishes that cua_node/bin/node_repl is a 19,310,480-byte Mach-O arm64 executable with Rust source-path evidence and embedded readable JavaScript. Added an extraction script for nine resources: kernel.js, diagnostics.js, privileged-node-repl.js, privileged-node-repl-config.js, realmChecks.js, meriyah.umd.min.js, tracing.js, trusted-worker.js and worker-runtime.js. Each resource occurs twice; extraction verifies both copies are identical, parses every source with Acorn, and records exact byte offsets/lengths/SHA-256 plus the binary hash. Raw extraction stays outside the repository; the binary is not executed or redistributed.

Created @core/node-repl as a separate worker reconstruction workspace, preserving the distinction from the @core/cua-repl launcher. Restored cross-realm ArrayBuffer brand checking through the native byteLength getter, and diagnostic source redaction for bindings, literals, templates, regexes, comments and truncation. The embedded Meriyah header identifies 7.0.0; pinned upstream meriyah 7.0.0 and use it directly in parser/redaction comparisons, rather than reconstructing the parser. Kernel integration of that dependency is still pending.

Three tests verify extraction provenance and duplicated resources, realm/spoof cases, and original-vs-restored diagnostics using both the embedded and upstream parsers. Initial extraction assumed unique markers; the two copies disproved that assumption, so the extractor now checks identical ordered copies. The first diagnostic oracle omitted collectPatternNames; including that original helper fixed the fixture. Neither issue required changing restored runtime semantics.

The binary supervisor remains native; embedded JavaScript recovery does not recover its Rust implementation or establish a running MCP/isolated execution server. Kernel, worker runtime, trusted bridge, process/isolation integration, native/AX resources and actual-model integration remain open. Seven-package build/type checks and all 696 reconstruction tests pass with concurrency 4.

### 16.226 NodeREPL worker values, background tracking and execution context

Restored worker-runtime helpers as readable TypeScript modules. worker_values preserves descriptor-only error-property lookup with proxy rejection, original broad non-array object predicate, cycle-safe freezing (including already-frozen early return), log formatting, byte-view offsets and PNG/JPEG/WebP inference. Image normalization retains exact data/file URL restrictions, explicit bytes/mimeType shape checks and errors; only temporary fixture files are read in tests.

background_operations restores deferred rejected thenables and pending-task observation tracking: then/catch/finally mark an operation observed, while the internally tracked promise records success/failure without rejecting. exec_context uses Node AsyncLocalStorage with the original distinction between originating async state and current active ID. Late callbacks can still inspect their old store but cannot claim current-output authority; clearing an old ID cannot erase a newer active call.

Four differential tests use the extracted original worker functions and original realm helper. They cover inherited/accessor/proxy error properties, frozen cycles, cross-realm views, media signatures and invalid inputs, thenable settlement/observation combinations, and overlapping asynchronous call contexts. The worker bridge, request settlement/JSONL listener, kernel and trusted capabilities are still pending; these helper tests do not prove a complete NodeREPL server.

Validation: seven-package build/type checks and all 700 reconstruction tests pass with concurrency 4. Native supervisor/process isolation, full worker/kernel integration, native/AX resources and actual-model integration remain incomplete.

### 16.227 Shared NodeREPL worker runtime assembly

Restored createWorkerRuntime and its nodeRepl bridge using the preceding value/context helpers. Includes write item validation/output events, image/audio request counters and response callbacks, optional audio method exposure, metadata cloning/freezing, original extra-field overrides, descriptor-safe error classification in a private WeakMap, console routing, and repeated background-task draining with unobserved rejection tagging.

Preserved JSONL process behavior: stdin bytes are buffered until newline so split UTF-8 survives; CRLF and blank lines are handled; malformed JSON frames are ignored; pending response resolvers are removed before invocation. EOF exits even with user-created live handles. stdout EPIPE exits cleanly; other stream errors remain fatal. No substitute transport or parser protocol was introduced.

Three tests run both extracted original and reconstructed runtime in disposable Node subprocesses, compare metadata/error/output/drain results, exchange fragmented real stdin/stdout media requests, verify request success/failure and pending cleanup, and check EOF/EPIPE/non-EPIPE termination. The tests do not run the installed supervisor, access a real app, or record actual audio.

Shared worker assembly is now present, but kernel execution/module loading, privileged bridge, trusted-worker orchestration and the native supervisor/security boundary remain incomplete, as do native/AX resources and actual-model integration.

Validation: seven-package build/type checks and all 703 reconstruction tests pass with concurrency 4.

### 16.228 Privileged NodeREPL configuration bridge

Restored createPrivilegedNodeReplConfig as readable TypeScript with the original frozen method surface: readToml/writeToml/read/readRequirements/writeValue/batchWrite. Preserves operation names, async argument awaiting, exact TOML path guard, cloning, recursive JSON compatibility checks, key-path retention, upsert/replace defaults, expected-version handling, reload flag and snake_case host request payloads. The existing broad isPlainObject semantics and sparse-array behavior are preserved rather than silently tightened.

The bridge only constructs requests through an injected privileged-operation handler; it does not itself read or write configuration files. The remaining privileged runtime must still supply context, authorization and response handling. Restoring this API does not create an unguarded direct filesystem configuration writer.

Four differential tests compare original and restored modules across TOML path/value cases, read/requirements option matrices, JSON/merge/version validation, getter access order, batch ordering, sparse edits, cloned payload isolation and deferred arguments. All requests use in-memory fixture handlers; no personal configuration is accessed or changed.

Kernel, the remaining privileged host bridge/trusted worker, native supervisor/process isolation, native/AX resources and actual-model integration remain incomplete.

Validation: seven-package build/type checks and all 707 reconstruction tests pass with concurrency 4.
