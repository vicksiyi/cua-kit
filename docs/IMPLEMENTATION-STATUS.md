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
