# Implementation status

## Current native-protocol checkpoint (latest: 2026-11-06)

Older dated sections below are development history, not the current completion
claim. The default demo has not been switched to a fully independent App runtime.
An opt-in Rust + Swift demo route now passes native inventory through a real
DeepSeek-issued tool call; screenshot/input and mixed surfaces remain unaccepted.

| Original Sky request area | Current independent native route | Actual evidence / remaining gap |
| --- | --- | --- |
| Inventory, version negotiation | Swift service supervised by Rust | Original/restored client and real MCP worker paths pass. |
| App policy and approval | Swift explicit rules; original Sky TS approval flow | Decline and policy denial verified; vendor native rules/authentication not recovered. |
| Explicit AppStart | Swift LaunchServices | Both clients launch/reuse/retire an owned fixture; no proof of implicit GetSkyshot startup behavior. |
| App skyshot | Shared Swift AX + window PNG capture | Protocol/permission errors pass; real screenshot gate blocked by host permissions in last explicit run. |
| setValue, selectText, secondary action | Shared Swift AX engine | Envelopes/guards and mapping tests pass; real input effect not accepted. |
| type, pressKey, click, scroll, drag, paste | Shared Swift keyboard/mouse engines | Protocol/mapping/release tests pass; actual UI and screenshot-coordinate effects not accepted. |
| audio | Existing engines partially available, original-protocol dispatch pending | Not complete. |
| Source/language parity and legacy retirement | JS-derived TS retained; native responsibilities migrating to Rust/Swift | Whole-repository per-file review, original hidden semantics, production integration and old adapter retirement remain open. |

## Rust MCP checkpoint (2026-11-06)

Rust MCP now uses rmcp 1.5.0 and the observed four-tool schema snapshot. An
external TypeScript MCP client passes real stdio execution, reset, module
registration/replay, metadata/named outputs, elicitation refusal, media, turn
lifecycle, timeout and in-flight cancellation. Two cases verify owned worker
cleanup on EOF and SIGTERM; the latter interrupts a running trusted RPC.
All 23 Rust tests and both external MCP cases pass.

SIGTERM cleanup ordering and Tokio blocking-stdin shutdown were corrected from
failing integration tests. The integration example accepts explicit worker
specifications and uses network-denied test workers; it does not construct the
full native sandbox policy. Production demo selection, continuous between-cell
routing, authenticated fetch and full original-language/native App fidelity
remain incomplete. No installed supervisor is used by this MCP harness.

## Rust media composition checkpoint (2026-11-06)

Actual data-URL image/audio envelope decoding and a config/media deployment
host now exist in Rust, using observed URL/percent/base64 libraries. HTTP/file
fetches are rejected. Twenty-four cases compare Rust output/errors against the
existing TS/Node adapter; malformed padding and spaced base64 flags were fixed
from that evidence. Real restored kernel emissions return image/audio content
through the composed handler. All twenty-three Rust tests pass.

This proves envelope transport for fixture payloads, not image/audio codec
validation or real capture. The library still needs MCP/sandbox integration,
continuous background routing and remaining native protocols before replacing
the demo runtime. Full original-language and behavior fidelity remains open.

## Rust configuration storage checkpoint (2026-11-06)

The configuration host now reads actual TOML and persists explicitly mapped
preferences in Rust, reusing observed toml 0.9.11. Private-directory checks,
protected config/requirements, link rejection, size bounds, parser-error redaction,
serialized atomic commits and precommit cancellation are implemented. Three
storage tests plus a restored-worker disk roundtrip pass; all twenty-one Rust
tests pass. Main configuration/requirements are not rewritten.

This migrates the independent explicit-source storage adapter, not Codex full
configuration layering/resolution. MCP, sandbox composition, real media adapters
and continuous between-cell event routing still prevent replacing the demo
runtime. Original-language audit and native App acceptance also remain open.

## Rust host callback checkpoint (2026-11-06)

Explicit execution-scoped host handlers now route media, elicitation, config and
launch-service messages. Side/execution/request identity is checked; form support
is explicit, replies preserve refusal/errors, content is bounded, and callback
futures are aborted on retirement. Three added real-worker tests verify refusal,
config/media transport and callback cancellation; all seventeen Rust tests pass.

This provides the host protocol boundary, not actual Rust TOML storage, media
encoding/validation, MCP approval UI, authenticated fetch or native app actions.
Those adapters and continuous between-cell routing/MCP/sandbox composition
remain required before replacing the transitional TS runtime.

## Rust turn-ended checkpoint (2026-11-06)

Rust host lifecycle routing now dispatches `turn_ended` to the actual restored
trusted worker, validates response identity, preserves host request metadata,
merges bounded response metadata and supports nested timeout suspension. Success
is deduplicated by session/turn even across reset; timeout failures remain
retryable after worker retirement. Two new integration cases cover these
behaviors and invalid input; all fourteen Rust tests pass.

This supersedes the earlier basic turn-ended/metadata gap. Approval/media/config,
module registration, continuous between-cell routing, MCP and sandbox assembly
still prevent replacing the existing demo runtime. No new browser/desktop or
DeepSeek acceptance is claimed by these local-worker tests.

## Rust dual-worker routing checkpoint (2026-11-06)

The Rust manager now drives both reconstructed Node workers: persistent cells,
service RPC/hooks, host request metadata, reset, timeout/cancellation recovery
and nested timeout suspension. It also routes native-pipe requests and events
through the trusted worker to an actual allowed Unix socket (315,000-byte echo).
Four new integration tests pass; all twelve Rust tests pass. No browser or
DeepSeek/MCP acceptance is implied. Dropped caller futures mark the generation
for retirement before the next cell.

Remaining Rust migration includes continuous background routing between cells,
turn-ended/module registration, media/approval/config/authenticated fetch, MCP
and native sandbox composition. Unsupported host requests fail explicitly;
this library is not yet selected by the demo. Existing TS runtime remains
transitional, not a completed original-language implementation.

## Native process and repository audit checkpoint (2026-11-06)

The language audit now inventories existing package source, legacy src, native
code and build/deployment scripts, with hashes and review queues. See
`reconstruction/LANGUAGE-BOUNDARY-AUDIT.md`. Inventory coverage is not proof that
every file has been semantically audited or migrated. Fourteen TS supervisor
files are in the confirmed native-responsibility migration queue; twenty-one
Native Host/App boundary files require more original-language evidence.

Rust process transport now drives the actual reconstructed kernel and preserves
bindings across two executions. Eight Rust tests pass (three pipe, five process),
covering real sockets/Node workers and descendant cleanup. A Darwin exit/reap
race was corrected by reaping owned leaders while retrying transient EPERM.
Full native session/MCP/sandbox migration remains incomplete.

## Original-language migration checkpoint (2026-11-06)

User clarification: installed JS must still be restored as readable TS; other
languages must follow original CUA layers. A fresh static audit of the installed
`node_repl` records Rust compiler/module paths and dependency versions in
`reconstruction/native-language-evidence.json`. The older protocol snapshot has
a different binary hash; its provenance must not be silently relabelled.

`native/runtime-supervisor` starts the Rust migration with Unix native pipes,
using observed direct dependency versions. Three real-socket tests pass, covering
large payload round trips, ordered close events, explicit close/teardown, and
rejection of unapproved paths/invalid or oversized payloads. This Rust library
is not yet wired into the JS worker or MCP demo. TS supervisor remains a
transitional runtime; no claim of completed migration or recovered Rust source.

## Independent extension transport checkpoint (2026-11-06)

Both packaged native/full extensions now pass the complete MCP/CUA operation
acceptance with the independent sandbox supervisor and deliberately nonexistent
installed executable paths. Local-page capture, navigation, click results and
screenshot media are verified in isolated Chromium profiles. This exposed and
fixed an endpoint path bug: macOS `/tmp` and `/private/tmp` aliases previously
failed textual parent-directory comparison after sandbox canonicalization. The
host now emits canonical paths; the connector compares canonical parent paths
and still checks private ownership, file/socket types and same-directory scope.
Old descriptors with ancestor aliases remain supported. Twelve endpoint/host
regressions cover this and rejection of a socket in another directory.

This is not daily Chrome cold-start/recovery or native App acceptance. The
independent extension scenario uses deterministic MCP calls, not DeepSeek; the
separate real-DeepSeek acceptance remains the isolated CDP form scenario.

## Independent demo runtime checkpoint (2026-11-06)

The real demo entry now supports opt-in `CUA_RUNTIME_SUPERVISOR=independent` on
macOS for the browser surface. It no longer needs the installed supervisor on
that selected path. Validation includes: CDP browser-only CLI preflight with an
intentionally nonexistent installed supervisor path; real demo/MCP/sandbox/CDP
form submission with a local model-protocol fixture; the same task using actual
DeepSeek; and nine existing preflight/startup regressions. The real-model test
verified the submitted page's random result marker, not a canned final answer.

The installed supervisor remains the default. Independent demo composition does
not yet support native Apps, existing Codex preference reuse or authenticated
backend-service fetch. Daily Chrome extension acceptance and arbitrary external
website tasks are not established by the local CDP fixture. Full-goal completion
is still unproven; see the agent-loop README for the opt-in command and limits.

## Startup hardening integration checkpoint (2026-11-06)

After commits through `a3842c4`, a fresh reconstruction build and both real
`extension-native-controller.test.ts` deployments (`native` and `full`) passed:
2 tests, 0 failures, 0 skips. Each uses an isolated Chromium profile and the
actual packaged extension/native host/MCP chain to exercise CUA page operations;
this run did not use DeepSeek, external websites or the user's daily Chrome.
These results validate compatibility of the recent discovery/preflight changes
with the complete extension transport. They do not establish the default macOS
launcher cold-start behavior against a closed daily Chrome instance.

Implemented startup additions now include authenticated live endpoint discovery,
a two-second transport retry, original-script-derived profile/extension checks,
read-only native registration checks, explicit existing-profile launch, and one
read-only MCP inventory retry retaining initial API documentation. Local host
lifecycle diagnostics and caller-configurable browser-origin approvals are also
available. Source profile selection was differentially tested against bundled
browser plugin version `26.1027.30824`; the Core deployment adapter remains
separate from source-faithful CUA modules.

Outstanding acceptance: closed daily Chrome startup and wrong-profile behavior
on the user's machine without overlapping interactive runs; recovery after an
MCP process dies; native App UI permission/action acceptance; complete source
parity and standalone default runtime deployment. This is not full-goal completion.

## Latest browser startup checkpoint (2026-11-06)

The default DeepSeek prompt entry now requests macOS to open Google Chrome when the configured extension endpoint directory exists but is empty, then waits up to 15 seconds for a descriptor before the existing MCP browser preflight. Check-only mode remains read-only. Missing installation, invalid permissions and explicit endpoint configurations do not trigger this startup path. Timeout explains extension/profile diagnosis and the explicit `--cdp-browser` alternative; there is no automatic profile/backend switch.

Validation: seven startup/diagnostic tests and agent-loop type checking pass. A real default-entry DeepSeek run started from no discovered connection, opened Chrome, passed MCP browser preflight, accessed Google search for 米可世界, and returned a sourced summary with exit 0. The answer used search-result snippets; linked-page verification and comprehensive company research were not established. A separate check-only invocation before this run still observed no connection, so persistent connection availability and the original disconnect cause are not yet proven fixed. The change fixes startup orchestration, not every extension lifecycle failure. Raw logs remain local and ignored.

The sections below include historical checkpoints and are not a current aggregate completion report.

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

### 16.229 Privileged lifecycle hooks and host operations

Restored lifecycle handler registration with exact run/positive-integer timeout validation, per-run hook snapshots, deletion callbacks, best-effort exceptions/timeouts and serial/concurrent execution. Timeout does not cancel the underlying handler, matching the embedded implementation.

Restored host elicitation and authenticated-fetch adapters. Elicitation requires current active execution and MCP form capability, validates/clones the original request fields, emits the original IDs/messages and tracks background observation. Fetch uses the originating async context, Request/Response normalization and base64 bodies, preserves empty-body status handling, and deliberately does not join the current execution's drain set. Both adapters use supplied host message callbacks, not a new network or approval implementation.

Four original-function differential tests cover hook validation/order/removal/snapshots/timeouts/concurrency; elicitation context/capability/input and response matrices; and fetch method/header/body serialization, stale active-ID behavior, statuses 200/204/205/304 and failure responses. Responses are synthesized in memory and no HTTP request or real approval prompt is sent. Full privileged-worker assembly, native-pipe host bridge, kernel, supervisor isolation, native/AX resources and actual-model integration remain incomplete.

Validation: seven-package build/type checks and all 711 reconstruction tests pass with concurrency 4.

### 16.230 NodeREPL native-pipe host bridge

Restored createNativePipeBridge: connect/write/close host messages, request IDs and settlement, per-connection listener sets and execution state, base64 byte transport, and pendingClosures for peers that close before connect resumes. The returned APIs are frozen; writes capture the latest optional async context before byte validation. Data callbacks run synchronously in connection context, while terminal listeners are queued with swallowed failures and remain observable when attached late.

Preserved original edge cases instead of silently redesigning them: duplicate listeners are ignored, end still sends a close request after terminal state, write rejection marks the connection closed but leaves its map entry until a host close event, and data arriving during that interval still dispatches. Connect response validation precedes the required async-context lookup, exactly as in source.

Three differential tests cover path/result/context errors, bytes and listener/context ordering, removal, early close, late terminal listeners, write rejection, synchronous data exceptions and unrelated messages. A fourth integration test places this bridge beneath restored WindowsNativePipeTransport and exchanges fragmented framed RPC through synthetic host messages. No OS pipe or real application is opened.

Full privileged-worker assembly, kernel/trusted-worker execution, native supervisor/isolation, native/AX resources and actual-model integration remain incomplete.

Validation: seven-package build/type checks and all 715 reconstruction tests pass with concurrency 4.

### 16.231 Complete privileged host API assembly

Restored createPrivilegedWorkerRuntime and the composed Node REPL bridge. It inherits the base worker bridge and freezes the original own-property descriptors for config, launchServices, environment, elicitation/fetch, nativePipe, response metadata, content items, timeout suspension, lifecycle hooks, telemetry and best-effort audit logging. Telemetry/config getters retain live lookup behavior; privileged operation IDs and exec_id are bound to the captured active execution.

LaunchServices validation preserves the exactly-one-target rule and trimming. Config/application requests use the restored host operation protocol and original missing-value/error fallbacks. withSuspendedTimeout sends resume in finally, including callback rejection, and remains a tracked background operation. Response metadata is cloned/merged and exported while content items and lifecycle hooks retain their original state/ordering.

Three differential tests compare the complete original module and reconstructed factory using an in-memory base host: frozen descriptors/prototype inheritance, live getters, metadata/content/audit projection, application/config payload and response matrices, failure-safe timeout resume, hook registration/removal and composed elicitation. No configuration, app, approval UI or external network is touched.

This completes the privileged API factory, not the trusted-worker executable entry or security supervisor. Kernel/module execution, trusted-worker orchestration/tracing, native supervisor/isolation, native/AX resources and real-model integration remain incomplete.

Validation: seven-package build/type checks and all 718 reconstruction tests pass with concurrency 4.

### 16.232 Response metadata tracing

Restored embedded tracing.js as readable typed tracing.ts using Node AsyncLocalStorage and performance. Enablement retains explicit configuration or a string traceparent in current request metadata. Nested async operations retain parent span IDs; completed spans are sorted by start time, rounded to microsecond precision in milliseconds, and consumed on buildTrace.

Preserved limits: 1024 completed spans, 32 supported primitive attributes, 128 Unicode code points for names/keys and 256 for string values. End attributes override start attributes; invalid values are omitted; overflow increments dropped_span_count. End is idempotent. Result-attribute callback failures are swallowed while operation errors retain identity and record error.kind. Detached ends after buildTrace do not recreate the deleted execution entry, matching original behavior.

Three differential tests execute the original extracted module and restored implementation with the same deterministic clock. They cover nested async spans, error/result handling, enablement, Unicode/attribute limits, overflow, freeze/idempotency and trace cleanup. Seven-package build/type checks and all 721 reconstruction tests pass. No external telemetry backend is contacted.

Trusted-worker entry/module enforcement, kernel/module execution and native supervisor/isolation remain incomplete. This is the original local trace collector, not a substitute telemetry SDK or a claim of complete runtime integration.

### 16.233 Trusted worker process entry

Restored trusted-worker.js as typed trusted_worker.ts, retaining its process entry and initialization order: cwd, canonical trusted roots, synchronous module resolve hook, environment snapshot, worker/privileged API assembly and immutable globals, service promise cache, JSONL dispatch and lifecycle handlers. Source imports remain extensionless; emitted imports are produced by the existing reconstruction build.

Service names resolve through explicitly configured module directories; file URLs and absolute paths still pass the global canonical-path resolver. Symlink escapes are rejected. Node built-ins pass through exactly as in the original. This is module-location enforcement, not a claim that trusted service code is sandboxed. Loaded service failures remain cached; classifyError failures preserve the original exception. Service requests retain active execution until hook/turn processing, background operations drain except for run_hooks, and traces are exported during run_hooks.

Three differential subprocess tests run the original extracted JS and restored entry with disposable synthetic services: cached handlers, execution metadata/console/write/content, image acknowledgments, hooks, trace export, missing/invalid services, error classification, symlink escape rejection, configured package resolution and allowed transitive/builtin imports. No installed native executable, personal app or external model is used. Integration exposed two original type allowances now represented explicitly: homeDir may be null and lifecycle run may omit its event.

Kernel execution/module machinery, native supervisor/isolation, native/AX resource provisioning and real-model integration remain outstanding.

Validation: seven-package build/type checks and all 724 reconstruction tests pass with concurrency 4.

### 16.234 Kernel binding analysis and commit instrumentation

Restored kernel_bindings.ts and kernel_instrumentation.ts directly from the embedded kernel functions. Binding analysis handles destructuring, top-level declarations/var loops and prior-const reassignment with the original block/function/loop shadowing rules. The AST is supplied by upstream Meriyah 7.0.0; no parser is reimplemented.

Instrumentation retains original generated source for declaration commit markers, function/class markers, one-time loop guards and direct top-level writes to future hoisted vars. Logical assignment rewrites preserve short circuit and result values. Its allocator is supplied by the kernel so a single salted counter can remain shared across cells. The original deliberately limited nested-write recovery and empty-loop failure behavior are preserved. Namespace reads distinguish inaccessible/TDZ bindings from accessible undefined values.

Three differential tests compare original functions extracted from kernel.js and reconstructed functions. Tests compare binding results and generated text, then execute synthetic generated programs in disposable VM contexts to compare commit marker sequences and errors. Cases cover partial initialization, destructuring failures, empty/populated loops, logical assignments, failed writes, shadowing and unsupported nested recovery. Kernel module assembly, linking/evaluation and cell state integration are not yet complete.

Validation: seven-package build/type checks and all 727 reconstruction tests pass with concurrency 4.

### 16.235 Kernel module source assembly and committed bindings

Restored kernel_module_builder.ts from buildModuleSource/canReadCommittedBinding/collectCommittedBindings. It combines upstream Meriyah, restored binding analysis/instrumentation and diagnostic redaction. Previous state and the shared internal-name allocator remain owned by the kernel and are supplied to the builder. Generated source preserves the @prev prelude, const reassignment downgrade/warnings, current-binding overrides, merged exports, and import.meta marker aliasing/deletion before submitted code starts.

Committed binding collection retains prior bindings, includes explicitly marked declarations/writes, and recovers readable lexical namespace values even when a later step in the same destructuring declaration throws. Unmarked hoisted var/function values do not count as initialized. Parser calls retain the original runtime options and token record handling; an explicit TypeScript boundary accounts for upstream declarations that describe tokens differently and omit the source's legacy disableWebCompat option.

Three differential tests compare original extracted functions and restored functions, including generated source, diagnostic redaction, warning sets and salted allocator progression. Generated modules are also linked/evaluated with actual Node SourceTextModule/SyntheticModule in disposable subprocesses: prior x=4 becomes x=6/answer=12, private import.meta hooks disappear, partial destructuring leaves a readable while b remains in TDZ, and writes before future var declarations retain their markers. These tests do not implement or claim the complete kernel linker/execution loop.

Remaining: kernel module resolution/linking/evaluation orchestration, cell-state promotion/recovery, native supervisor/isolation and real-model integration.

Validation: seven-package build/type checks and all 730 reconstruction tests pass with concurrency 4.

### 16.236 Kernel module resolution

Restored kernel_module_resolver.ts from the embedded kernel: configured search-base normalization/deduplication and cwd ordering; builtin normalization with the narrow process denylist; explicit file versus bare-package classification; canonical file checks; package-root containment; ESM/CommonJS classification; error-kind tagging and import.meta projection. Node fs/path/module/url provide the actual resolution behavior. The source's require.resolve conditions argument is preserved through a typed boundary, without substituting a new resolver.

Package imports use the referring package directory while submitted code searches configured bases. Canonical paths prevent package dependencies escaping configured node_modules through symlinks. Direct local imports retain original .js/.mjs-only and no-directory rules. import.meta.resolve returns the original projection, including the bare specifier for packages; it is not silently changed to Node's usual URL result. Native loading, module caches and link/evaluation scheduling are still to be connected.

Three differential tests compare original extracted functions against the restoration on temporary files/packages: builtin errors, unsupported specifiers and file validation, search precedence, ESM/CJS classification, missing/nonexported packages, package-context containment and symlink escape, and import.meta fields. A test assertion initially compared /var and /private/var spellings on macOS; fixture root canonicalization fixed that assertion without changing implementation behavior.

Validation: seven-package build/type checks and all 733 reconstruction tests pass with concurrency 4.

### 16.237 Kernel module loading/linking/evaluation

Restored kernel_module_loader.ts and connected it to the original resolver. Node SourceTextModule handles file/ESM-package source, while SyntheticModule bridges native-import namespaces for static links. Builtins and CommonJS packages retain the original native dynamic-import path. Module contexts preserve the distinction between submitted-code files and persistent package files while sharing the runtime context.

File module instances are cached before recursive linking, retaining cycle support. Per-context link tails serialize link work and recover after rejection; failed link attempts remove only newly created matching cache entries. Evaluation promises are cached, including failures. Local cache clear removes local file/evaluation entries while preserving package entries and native caches. Dynamic import returns namespaces as the original does; the TypeScript boundary accommodates Node's broader runtime return contract.

Three differential subprocess tests execute original extracted functions and restored loader/resolver with real Node VM modules and temporary synthetic files/packages. Verified circular imports, concurrent evaluation identity/count, dynamic and builtin imports, CommonJS namespace handling, local cache invalidation versus package persistence, link-failure repair/retry and evaluation-failure persistence until cache clear. No installed native executable or personal app is used.

The standalone loader is complete at this layer; kernel bootstrap, complete execution/response loop and failed-cell state promotion/recovery still require assembly. Native supervisor/isolation and real-model integration remain outstanding.

Validation: seven-package build/type checks and all 736 reconstruction tests pass with concurrency 4.

### 16.238 Complete embedded JavaScript kernel entry

Restored kernel.ts and assembled the previously restored builder, resolver, loader and worker runtime. The process entry preserves bootstrap argument validation/cwd switching, runtime globals and code-generation settings, filtered environment snapshots, banner execution, locked nodeRepl/tmpDir globals, serialized exec queue, named/default output rendering, trusted-service request/hook routing, media settlement, source redaction and fatal asynchronous-error reporting/exit.

Each cell imports a synthetic snapshot of prior bindings. Successful cells promote their namespace; failed cells retain initialized bindings and recover shadowed-but-uncommitted prior values through a synthetic module. Link failures keep the last usable module, and a failed cell that updated carried values after its prelude can still promote state. Original per-cell local-module cache clearing and package persistence are retained.

Three differential tests launch the complete original embedded kernel JS and the reconstructed entry in separate Node processes. Multi-cell scenarios verify const reassignment/warnings, failed shadow recovery, partial destructuring, static-import failure followed by valid state, dynamic local imports and future-var recovery without ghost functions. Host fixtures exercise banner-once behavior, environment allowlisting, RPC output/content, hook responses, named output and media acknowledgments. Bootstrap failures and a fatal asynchronous exception are also compared through process exit and JSONL output.

The embedded JavaScript kernel entry is now runnable. This does not replace the compiled Rust supervisor, its isolation/permissions or MCP lifecycle; trusted-worker routing in these kernel tests uses a synthetic host. Native supervisor implementation/integration, actual kernel-to-trusted-worker service routing, native/AX resources and real-model end-to-end validation remain outstanding.

Validation: seven-package build/type checks and all 739 reconstruction tests pass with concurrency 4.

### 16.239 Two-worker Sky integration and service export correction

Connected actual kernel and trusted-worker subprocesses through a test-only JSONL relay, then loaded the restored @core/sky public client and @core/sky/service. The relay forwards real service requests/responses and hooks; only the native pipe peer is synthetic. Both original embedded workers and restored workers run against the same restored Sky packages, and their resulting outputs and native protocol requests are compared.

This integration exposed a real package-export mismatch: the original Sky/browser-desktop manifests use unconditional runtime exports, while reconstructed import-only exports prevented the trusted worker's createRequire.resolve from locating services. Added default runtime targets alongside types/import for both packages. A regression test resolves both public service entries with createRequire. Workspace packages/dependencies are copied into temporary installed node_modules trees for the integration test; symlinked workspace sources are not incorrectly treated as installed package roots.

The end-to-end worker test verifies setup/list_windows, retained client state across cells, rounded click coordinates, screenshot state and image acknowledgments, unavailable-method errors, and after-submitted-code hooks. The fixture sends fragmented native frames. During fixture development, missing image acknowledgment caused a timeout; the relay now acknowledges the actual trusted worker media event instead of bypassing it.

This proves two-worker JavaScript/Sky protocol integration, not native desktop actions or a production supervisor. The relay is test infrastructure, not reconstructed Rust supervisor code. Native supervisor permissions/isolation, MCP lifecycle, browser/native/AX resource provisioning and real-model end-to-end validation remain outstanding.

Validation: seven-package build/type checks and all 741 reconstruction tests pass with concurrency 4.

### 16.240 Native supervisor protocol and real MCP integration

Audited the installed native boundary and a pinned, non-truncated openai/codex public tree. No standalone supervisor source was found in those bounded locations; binary Rust unit strings are not treated as recovered code. Recorded the native initialize/tools-list schemas and binary hash in reconstruction/node-repl-native-protocol.json, with scope and provenance in node-repl-native-boundary.md.

Confirmed the existing NODE_REPL_WORKER_WRAPPER launch contract and used it in an explicit integration test to substitute the reconstructed kernel under the actual installed native supervisor. With temporary HOME/CODEX_HOME/TMPDIR and outer macOS network denial, actual MCP js calls produced 40 then 42, js_reset spawned a new restored kernel, and a subsequent call returned undefined. Public response contents match the original kernel. Installed files and user configuration were not modified; no disable-sandbox flag was used.

Validation: the explicit native-supervisor.integration.ts test passes. The unchanged default reconstruction suite remains at its previous 741 passing tests; it was not rerun solely for this opt-in probe/documentation addition. This is real native-supervisor/MCP integration of the restored kernel, not a native supervisor source reconstruction. Full permissions/isolation, privileged host functions, native desktop/browser/AX and actual-model validation remain incomplete.

### 16.241 Native timeout and cancellation recovery

Extended the explicit native supervisor integration test beyond execution/reset. The actual MCP js tool times out a suspended cell at 100 ms; the next call succeeds and the timed-out variable is absent. The cancellation case writes a start marker inside isolated TMPDIR before notifications/cancelled is sent, proving it cancels an executing cell rather than a request that never started. The following request succeeds with the cancelled binding absent.

Original and restored kernels produce matching public responses. The wrapper records four kernel launches: initial, after reset, after timeout and after cancellation. The explicit native integration test passes; a scoped process check after completion found no remaining test supervisor/kernel workers. No runtime implementation was changed, so the unchanged default synthetic suite was not repeated (last full run: 741 passing tests).

This validates these lifecycle paths with the original native supervisor. It does not reconstruct its Rust implementation or establish complete cancellation/permission/isolation parity across platforms, concurrent calls, native actions or arbitrary privileged operations. Those and actual model integration remain outstanding.

### 16.242 Both restored workers under the native supervisor

Extended the native integration probe to configure a temporary trusted service and route nodeRepl.rpc through the actual native supervisor. The existing worker-wrapper hook is invoked for both kernel.js and trusted-worker.js; both entries are now substituted with reconstructed JS in the probe. The configured service returns value 17 and confirms that the privileged config API is present, without accessing real configuration.

The original and fully substituted worker pair produce identical public MCP responses. Reset, timeout and cancellation cause four launches of each worker across the sequence. Initial assertions expecting only four total launches exposed the previously unverified trusted-worker lifecycle; the assertion now verifies four per worker kind. Native JSON object ordering is reflected in the observed RPC result rather than assumed from the in-memory fixture.

Validation: explicit native-supervisor.integration.ts passes with both reconstructed workers; the unchanged default suite was not repeated (last full run: 741 tests). The native supervisor remains an external binary and no claim is made that privileged operations, permissions, browser/native resources or actual model integration are complete. This establishes the worker-substitution path needed for a runnable demo launcher, which is not yet packaged.

### 16.243 Reusable restored-worker demo adapter

Added independently authored @core/agent-loop native-supervisor.ts integration glue and restored-demo.ts. The adapter requires an absolute, hash-verified native supervisor, checks built worker entries, rejects wrapper conflicts, substitutes both worker paths while preserving native flags/bootstrap arguments, and forwards process signals/exit status. It keeps protocol stdout untouched and strips DeepSeek/CUA_MODEL configuration from the native child. The provider-neutral AgentLoop and MCP client remain unchanged.

Added mcp:restored and demo:restored commands with explicit environment wiring. The latter selects the adapter for the existing generic demo; it does not bundle or reimplement the Rust supervisor. CUA banner/services/installed-package roots and actual backend resources remain explicit separate requirements, so the basic runnable example is a JavaScript tool task rather than an unverified page/app analysis claim.

Two default tests cover native argument preservation and refusal of ambiguous launches, conflicts and unverified executables. The opt-in native suite now also connects the actual McpToolClient to the packaged adapter under network denial with isolated homes: both workers execute trusted RPC, reset succeeds, and fake model credential/config values are absent from the worker environment. This complements the original/restored lifecycle comparison; it does not perform a live model call.

Validation: agent-loop type check, all 743 default reconstruction tests and both opt-in native integration tests pass. The source-restoration package build was unchanged in this adapter-only change.

### 16.244 Deploy installed dependencies for the restored-worker demo

Added an independently authored runtime package stager to the AgentLoop demo. It copies resolved installed packages into a temporary node_modules store and uses only internal relative links. Canonical package paths stay inside the deployment rather than escaping to workspace sources, satisfying the restored kernel's package containment checks. Packages are keyed by canonical source directory, so distinct installed versions survive while cycles terminate. Runtime dependencies, installed optional dependencies and required peer dependencies are followed; development dependencies, nested node_modules and .git are not copied wholesale. No dependency install scripts or network fetches run. Native addons/WASM assets are copied as installed, without claiming cross-platform or cross-ABI rebuilding.

The initial actual dependency traversal exposed a Node built-in name collision: require.resolve.paths('buffer') is null even though abstract-level declares the npm buffer package. Resolution now obtains package search roots through a non-built-in sentinel and checks the requested manifest. The complete actual CUA dependency graph then stages successfully, retaining Browser Statsig 3.33.1 and Sky Statsig 3.33.3.

`demo:restored` stages CUA, browser-desktop and Sky roots, prepends the deployment root to NODE_REPL_NODE_MODULE_DIRS, and disposes it after the MCP client closes. Existing explicit search paths are retained. This does not automatically provision the CUA banner, trusted services or real host resources.

Validation: two new staging tests cover real dependencies plus a fixture with two versions and circular dependencies; fixture sources are deleted before deployed modules execute, proving no dependency on original files. Missing-dependency failure cleans up its temporary tree. AgentLoop type checking passes; all 745 default tests pass. Both opt-in native MCP integration tests pass. The actual native supervisor with restored workers imports the staged @core/cua/tinyskyAlt, emits its API documentation and exposes getState. With explicitly empty enabled surfaces, getTab/getApp are absent as specified. No browser/app action or real model call is claimed. Native supervisor source recovery and full backend/model integration remain outstanding.

### 16.245 Reuse original launcher bootstrap in the AgentLoop demo

Extracted the environment-assembly portion of the restored cua-repl launcher into exported create_launch_environment. This is a refactoring boundary, not an original upstream export. launch still validates its executable first, then uses the same platform/browser guidance selection, surface normalization, audio attachment description, service map, banner override, untrusted-environment allowlist and tool/server override payload. Existing tests compare its actual child environment and error/exit/signal behavior with the installed original launcher, including empty surface and override values.

AgentLoop now declares @core/cua-repl as a workspace dependency and imports the helper by package name. demo:restored opts into the CUA bootstrap when CUA_REPL_ENABLED_SURFACES is explicitly present in CUA_MCP_ENV; absence retains generic JavaScript mode. Empty surfaces offer an actual CUA bootstrap with no desktop/browser backend activation. Browser/computer selections supply their original service defaults, while explicit service/banner overrides are preserved. Package staging from 16.244 still handles module deployment. Real backend endpoints, binaries and assets are not automatically discovered or fabricated.

The actual native MCP integration now verifies exact js/js_reset descriptions from the launcher, automatic documentation/global setup on the first call, no repeated documentation on the next call and reinitialization after js_reset. The custom trusted RPC and model-key isolation assertions remain active. This probe uses network denial, isolated homes, restored workers, staged packages and empty surfaces; it does not claim a real webpage/app action or model run. Build and all seven reconstruction type checks pass, as does the AgentLoop type check. Original-launcher differential checks and both native MCP tests pass; full default regression results are recorded below.

Full default regression: 745 tests passed, zero failed. The two native integration tests passed separately.

### 16.246 Real browser-service startup exposes deployment and request-context gaps

Enabled the original default @core/browser-desktop/service through actual native MCP rather than the temporary fixture or disabled surfaces. The first probe failed with trusted package resolution: the demo supplied module search paths but omitted trusted code roots. demo:restored now adds the staged package tree to NODE_REPL_TRUSTED_CODE_PATHS, retaining explicit existing roots. The worker's original canonical-path checks are unchanged.

The next probe exposed a second gap: getState catches browser discovery errors, so merely checking isError=false or the presence of getTab was insufficient. Its returned state contained "Missing required Codex turn metadata: session_id, turn_id". McpToolClient now accepts a generic host-provided requestMeta callback and transmits its result as MCP tools/call _meta. Metadata never comes from model tool arguments. demo.ts reads optional caller-side CUA_MCP_REQUEST_META; restored CUA demo mode generates a fresh session/turn pair for its one-question run unless explicit metadata is supplied. Other agents retain control of session and turn lifetimes through the callback. This is protocol context, not permission or policy bypass.

The final actual native MCP probe enables browser surfaces, uses the default service, isolated homes, network denial and explicitly empty backend paths. It requires the complete returned state to contain empty apps/browsers with no errors. This now passes. A separate real MCP stdio test verifies host metadata changes across calls while tool arguments remain empty. Existing native worker lifecycle, default-banner/reset, trusted RPC and model isolation tests still pass. AgentLoop type checking and six targeted tests pass. Full regression results follow.

Connected browser discovery, native-pipe backend actions, complete host resources, generic turn_ended lifecycle dispatch, real DeepSeek and readable native supervisor source remain outstanding. Empty discovery proves service startup and context propagation, not successful browser operation.

Full default regression: 746 tests passed, zero failed. All three opt-in native integration tests passed in the targeted run.

### 16.247 Native MCP reaches isolated Chromium through the actual native pipe

Added two opt-in integration cases using the actual supervisor native-pipe bridge and the default restored browser trusted service. A temporary Unix-socket backend speaks the original framed browser RPC and forwards CDP to isolated Chromium. Real getInfo/getTabs discovery now precedes actual page observation/actions, rather than replacing the privileged bridge with a test JavaScript socket adapter. Native MCP retains IP-network denial with Unix-socket outbound allowance. Chromium serves only a local fixture response; other routed requests abort.

McpToolClient now accepts an optional host elicit callback and advertises MCP form elicitation only when that callback exists. This keeps confirmations outside model arguments and provides a standard integration point for different agent UIs. The command-line demo still needs its own interactive approval UI; there is no default auto-accept.

One case declines origin access and verifies no Accessibility.getFullAXTree is sent. A separate fresh-home case accepts fixture access, obtains an indexed AX state, clicks the identified button, confirms actual DOM text changes, and receives PNG/JPEG screenshot bytes over MCP. The initial attempt to decline then accept within one home correctly encountered persisted denial, so the tests use independent contexts rather than editing policy or weakening runtime gates. Enabling TinySky AX is required for indexed clicks; with it disabled the original fallback is a non-indexed DOM snapshot. Screenshot capture can use the original screencast cache; the test validates this supported path too.

The supervisor, Node executable and AX WASM remain explicit installed resources. The socket backend is an integration fixture, not a reconstructed production extension. All permission flows, real extension installation, native app operations, turn_ended orchestration, model integration and readable supervisor source are not claimed complete. Validation results follow.

Validation: AgentLoop type checking passes; all 746 default tests pass; all five explicit native integration tests pass. The new browser cases verify both decline and accept paths in separate isolated homes.

### 16.248 Host-controlled turn completion

Added an optional endTurn lifecycle capability to the agent-neutral ToolClient interface. AgentLoop now completes the host turn after successful execution or any rejected execution path (including cancellation and budget exhaustion). It uses no cancelled model/tool signal for cleanup. Original failures remain visible; simultaneous execution and cleanup errors are preserved in AggregateError rather than masking one another.

Added independently authored NodeReplTurnClient, wrapping a generic client for one turn. It hides turn_ended from model tool discovery, rejects direct model calls to that lifecycle operation, snapshots/validates the exact three-field native event schema, and deduplicates completion via a cached promise. CUA demo configuration derives the event session/turn from the same request metadata and uses the demo label turn_ended, verified against the actual native server. This does not claim to recover Codex's exact internal hook label. Generic demo can accept an explicit CUA_MCP_TURN_EVENT; long-lived agents can construct a fresh wrapper per turn around a shared connection.

Five new lifecycle tests cover success, failure, cancellation, cleanup failures and invalid/model-controlled events. The existing native Chromium accept/decline cases now run the actual AgentLoop completion path and verify exactly one browser backend turnEnded event with matching session_id/turn_id, including repeated host endTurn calls. No native worker/runtime behavior or original gate is changed. Full validation follows.

Remaining work includes real backend/extension deployment, native app integration, an actual caller approval UI, real-model end-to-end validation and the native supervisor's readable source. This completes the tested demo's host turn dispatch, not the entire requested system.

Validation: AgentLoop type check passed. All 751 default tests and all five opt-in native integration tests passed.

### 16.249 Interactive demo form elicitation with upstream validation

Added independently authored promptElicitation and createTerminalElicitation. The generic demo automatically attaches the host callback only when stdin and stderr are TTYs. It presents the server message and schema, requires an explicit accept/decline/cancel choice, and collects field values as a JSON object. It reuses AjvJsonSchemaValidator from the already-installed MCP SDK, including JSON schema constraints and formats; no custom validator or vendored third-party implementation was introduced. Schema defaults are not auto-applied.

The terminal adapter serializes requests, strips terminal control sequences from server-provided display text and cancels on EOF, prompt interrupt or caller cancellation. Non-interactive streams expose no terminal UI capability. URL elicitation is not advertised and the handler returns cancel if called with it. The injectable IO interface leaves model and transport contracts unchanged and lets embedding agents supply their own interaction layer.

Three new tests cover explicit choices/EOF/URL, JSON and schema retry without defaults, terminal escape removal and non-TTY behavior. Native Chromium accept/decline scenarios now use this actual form logic with scripted fixture IO instead of returning fixed ElicitResult objects. A real PTY run detected the terminal, rejected count=0 for minimum=1, accepted count=2 and returned cancel on EOF during the next request; the process exited cleanly. The PTY probe used no model or browser action. Full regression results follow.

The caller now has a working terminal confirmation flow. Remaining major gaps are production browser/desktop deployment, real-model validation and readable native supervisor source; the test socket backend and installed binary/WASM dependencies remain explicit.

Validation: AgentLoop type check passed; all 754 default tests and all five native integration tests passed.

### 16.250 Installed extension source and native messaging transport

Located a previously unexamined production-side source artifact: installed Chrome extension hehggadaopoacecdllhhajmbjkdcmajg version 1.26.1102.11740, background.js (546422 bytes; SHA-256 3ccdc7a853700c9fdd8acf8356db33ef18615d17c8a6d2b0054cafe65eb6c7b9). The native messaging manifest points at the separately installed ChatGPT for Chrome executable. This inventory did not execute or modify the real extension, host or browser profile. The extension snapshot is newer than the recorded desktop artifacts; production cross-version compatibility is not assumed.

Created @core/browser-extension as a distinct reconstruction package, not a claim of an original @oai package and not a relabeling of the old independent extensions/chrome implementation. Restored GE and its qE/HE/Ei/zE error/type helpers as readable NativeTransport TypeScript. It preserves immediate connection/alarm registration, host request IDs and response/error semantics, timeouts, post/disconnect failures, late replies, stale ports, explicit reconnect, missing-host-only candidate fallback, retry counters, five-second timers and half-minute alarms. It uses Chrome APIs and standard timers; no third-party transport is reimplemented. Separately bundled Sentry 10.48.0 was identified but not copied.

Three differential tests extract the inspected original bindings without running extension startup and compare request outcomes, callbacks, ordered timer/alarm/port traces and status snapshots. Cases cover successful/error/invalid responses, timeout and late response, reconnect/disconnect pending rejection, fallback exhaustion/recovery, alarm failure, post failure and snapshot copying. Source hash/version and remaining work are recorded in extension-source.json. The new package is included in reconstruction builds and type checks, with extensionless TypeScript imports.

DeepSeek credential check: no matching credential was found in the current environment, checked shell/config files or relevant local env/config search results. A prior deployment report refers to a successful DeepSeek run but contains no inline secret; it is not a usable credential. No unrelated provider credential was used or printed. This is a bounded search result, not a claim that no key exists anywhere on the Mac.

Remaining extension work: dispatcher/browser operations, session/auth/security orchestration, manifest/build/install integration and the native messaging host implementation. This component is not an installable production extension. Native supervisor readable source, real desktop integration and live-model validation also remain incomplete. Validation results follow.

Validation: all eight reconstruction package builds/type checks passed, and all 757 default tests passed. Native integration was not rerun because the new extension component is not yet connected to that runtime; the previous five-test native result remains scoped to its recorded implementation.

### 16.251 Extension bidirectional RPC and browser-event facade

Restored original extension fc/pc. Inspection showed fc and browser-service to share request/notification/error methods, so moved the existing peer implementation into @core/core/browserRpcPeer and kept the browser service's old import path as a re-export. Both browser and browser-extension declare the core dependency. This is a deliberate shared-code factoring boundary, not an assertion about the original package imports; no third-party RPC implementation was copied or rebuilt.

A differential test caught a real distinction between artifacts: browser-service to creates transport before its other fields, whereas extension fc assigns it afterward. The class factory preserves both orders and field property descriptors, including class-field behavior in the presence of subclass prototype setters. This avoids forcing one artifact's observable initialization onto the other.

ExtensionBrowserPeer restores handler registration/binding, ping, CDP/detach/download/page notifications, tab-mention invalidation error suppression, and moveMouse/WebMCP event dispatch. It intentionally preserves the original difference between synchronous moveMouse throws and asynchronously rejected work. Shared peer tests also check string errors, unknown methods, in-flight responses after closure, pending rejection and failed sends.

Four new tests compare original extension/service bindings and exercise restored NativeTransport + ExtensionBrowserPeer together. Host IDs native-host:* and numeric browser IDs resolve independently; inbound getInfo reaches a supplied handler and replies over the same port. This fixture does not substitute for the still-missing production command handler/session/auth/security implementation. Manifest/install packaging, native host and native supervisor readable source remain incomplete. Validation: reconstruction build and all eight package type checks passed; all 761 default regression tests and all 5 opt-in native-supervisor integration tests passed. Native integration remains an isolated fixture-backed Chromium flow, not a recovered production Chrome extension/session backend.


## 16.252 Full extension browser-command dispatcher translation

Translated every method of original extension `pE` into readable TypeScript in
`packages/browser-extension/src/command_handler.ts`. This extends the restored
native transport and browser RPC facade with the actual command-dispatch layer:
focus/attach/detach/CDP, passive reads and tab context, tab creation/finalization,
management capabilities and viewport commands, session resolution/activation/end,
SIWC delegates, cursor movement/arrival/timeout, browser metadata, downloads and
child-popup ownership/cleanup. It preserves validation before activation, cached
session rejection, original empty-string ID behavior, readonly-operation ordering,
and cleanup after failed or lost child claims.

A required dependency factory keeps the production `wd` session and related
security/authentication/lease/overlay implementations explicit. It does not supply
allow-all replacements or claim that dependency injection alone completes the
extension. Original bindings and readable names are recorded in
`reconstruction/extension-command-handler-dependencies.json`. Inspected `qy` is the
foreign-extension-frame monitor initializer and `Cy` the popup interceptor
initializer; neither is mislabeled as a download initializer. Broad `any` payload
types remain a documented limitation until protocol contracts are recovered.

Four differential tests compare the pinned original class with the reconstruction:
method inventory and field order; session/CDP validation and delegation; passive
reads/capability gates; cursor arrival/cancel/timeout; download transitions and
popup cleanup. A fifth test sends actual RPC envelopes through the restored
ExtensionBrowserPeer into the handler and checks replies and validation errors.
Fixture sessions and Chrome APIs isolate behavior without modifying the installed
extension. These are dispatcher tests, not production security/session verification.

Validation: all eight reconstructed packages built and passed type checks; all 766 default regression tests and all 5 opt-in native-supervisor integration tests passed. The new RPC composition test initially omitted JSON-RPC envelope fields in its expected value; corrected that test expectation to the existing protocol, without changing the implementation. Production extension/session integration remains incomplete.


## 16.253 CDP security and extension event subscriptions

Restored original Qp/Xp/Yp and the complete helper closure in `cdp_security.ts`,
then replaced command-handler validation/filter dependency injection with direct
imports. Disallowed debugger exposure fails before creating or activating a
session. Reply filtering removes the SIWC bootstrap cookie from cookie collections
and network resource headers; event filtering preserves each original CDP shape,
filters nested resource/header/cookie issue data, and drops tunneled target-message
events. Unknown methods retain original identity and behavior. The implementation
preserves malformed-value handling, own-property dispatch, capitalization rules,
whitespace/separators, raw-header removal and object-reference behavior. It is an
application-specific rule set, not third-party code and not a universal scrubber.

Extracted six original dR listener registrations into `registerBrowserEventListeners`:
debugger detach/event, handler download change, Chrome download created/changed,
and created navigation target. The filtered event reaches every supplied peer;
failed navigation-target processing remains swallowed exactly as in the original.
This is a startup component, not the complete startup function. Instance-ID setup,
runtime subscriptions, kernel/native connection routing and lifetimes remain outside
this component and must be composed later.

Added differential tests for every original CDP filter branch with valid, malformed,
nested and prototype-sensitive payloads, comparing outputs, mutations and identity.
A source helper extracts exactly one instance of each inspected subscription from
the pinned dR AST and executes only those calls for event-order comparison. A real
RPC-facade/handler test proves the guard runs before activation and filtered cookie
results reach the reply envelope. Production session/authorization implementations
are still pending; these tests do not establish that whole-system completion.

Validation: all eight reconstructed packages built and passed type checks; all 771 default regression tests and all 5 opt-in native-supervisor integration tests passed. The native tests still use an isolated fixture-backed browser backend and do not prove full production-extension integration.


## 16.254 Shared request-header validation and persisted extension policy

Inspected the original extension's `cs/ls` template parser/resolver and found the
same behavior already restored from browser-service `VC/u5`. Moved the common
implementation to `@core/core/requestHeaders`, retaining the browser's existing
re-export and adding the extension alias `parseRequestHeaders`. This avoids two
copies of application logic; the shared package export is a project refactoring,
not a claimed original package boundary. These functions use built-in primitives,
not a third-party header parser.

Restored original `uS` into `createRequestHeaderPolicyClass`, and replaced the
handler's injected RequestHeaderPolicy constructor with this direct implementation.
Chrome storage access remains lazy at method execution. The exact persisted key
and monotonic enable/cache behavior are preserved: false does not revoke a true
policy; a failed write leaves the in-memory flag false. No local Chrome storage
or user configuration was modified during tests.

Three new differential tests cover input structure, inherited fields/symbols/sparse
arrays, reserved headers, count and name/value/total limits, session placeholders,
post-expansion collisions, literal replacement metacharacters, storage errors,
restart reads and sticky cached decisions. Existing handler differential tests now
use the actual original and restored policies rather than a fake constructor.

Remaining: session `wd` must use the restored parser/resolver and policy in its
turn activation flow; tab leases and request-header DNR reconciliation remain
unrestored production dependencies. This change does not claim network-rule setup
or full production-extension readiness.

Full regression initially exposed a pre-existing wall-clock-dependent WebMCP deadline test: the original and restored runs observed different support traces around a 30ms cutoff. Replaced real Date/setTimeout timing in that test with the test runner controlled clock and explicit expiry, preserving implementation code. Targeted tests passed, followed by all 774 default regression tests. All eight reconstructed packages built and passed type checks, and all 5 native-supervisor integration tests passed. Native tests remain fixture-backed and do not prove production extension completion.


## 16.255 Full browser-session lifecycle translation

Translated every method of original extension `wd` to readable TypeScript in
`browser_session.ts`, including its original fields and constructor initialization
order. The restored session implements lifecycle serialization and recovery after
rejection, active/cached/ended turn checks, request-header parsing/inheritance/
clearing, handoff resumption, logical active-tab handling, agent/user/child tab
claiming, ownership guards, CDP attach/detach/timeout cleanup, network-policy
ordering, popup/header readiness, viewport changes and turn finalization.

Turn finalization preserves handoff/deliverable/close/release partitioning and
parallel-vs-sequential cleanup, best-effort error handling, resource release and
request-header reconciliation ordering. The session calls the restored shared
header parser/resolver directly; it does not bypass validation or invent a new
ended-turn policy. Runtime dependencies remain explicit and mapped in
`extension-session-dependencies.json`.

Added `createBrowserCommandHandlerWithSession` to compose the real restored session
with the dispatcher. Four differential scenarios compare the complete method
inventory, field order, results, errors, dependency traces and final state against
the pinned original wd, including malformed marks/headers, denied ownership,
debugger timeout, popup preparation failure, handoff stale tabs and queue rejection.
A fifth test sends getTabs/executeCdp/turnEnded RPC through the restored facade,
dispatcher and session, while using fixture lower-level browser/lease dependencies.

Not complete: production lease/group/favicon, debugger transport/network policy,
overlay/monitor and SIWC implementations, full startup and extension installation,
native host and real desktop/DeepSeek integration. The production session class is
now translated, but the injected lower-level fixtures are not production readiness.

Validation: all eight reconstructed packages built and passed type checks; all 779 default regression tests and all 5 opt-in native-supervisor integration tests passed. Native integration remains fixture-backed; this does not prove complete production extension behavior.


## 16.256 Chrome debugger execution runtime

Restored the debugger state closure and original fE/yd/mE/Sd/Ed/Td/_E/yi/kd/Va/Pd
plus timeout/error/viewport helpers into `debugger_runtime.ts`. It provides the
actual Chrome debugger calls, separate tab/target serialization queues, attached
state and target ownership, detach-event cleanup, viewport set/clear, timeout
normalization and CdpCommandTimeoutError. It preserves exact conflict handling,
raw-vs-timed command selection, Target.getTargets adaptation and targetId-only
routing. Timed requests race rather than cancel underlying Chrome commands.

The factory returns methods/state compatible with the session dependency boundary.
Production composition must share one runtime across all sessions and dispatcher
initialization, preserving the original globals' lifetime. There is no silent
fallback backend. The two original queue functions share one generic implementation
inside this project factory; their scheduling and rejection recovery are compared
with the original functions.

Three differential tests compare attachment failures and viewport handling,
timeout/error/late completion, same-key queue serialization, cross-key parallelism
and recovery. A fourth test composes the restored session and debugger runtime to
verify attach → viewport → CDP → detach Chrome calls. Chrome itself is a fixture
in this component test; this does not claim an installed extension has connected.

Remaining: tab leases/groups/favicons, network policy, overlay/monitor/SIWC,
full startup/manifest/native host and real desktop/DeepSeek integration. The
debugger methods are now restored but production shared-lifetime wiring is pending.

Validation: all eight reconstructed packages built and passed type checks, and all 783 default regression tests passed. The separate native-supervisor integration suite was not rerun in this turn; its last five-test pass remains the preceding milestone, not evidence of a production extension connection.


## 16.257 Chrome tab/window creation and new-tab preparation

Restored original vE/yt/Id/Ad/za/bE/wi/Jr into `tab_runtime.ts`. The runtime uses
Chrome tabs/windows directly and retains the original preferred/focused/fallback
window selection, narrow retry on a changed preferred window, unfocused window
creation, inactive tab creation, undefined-only ID checks and tab metadata shape.
New-tab preparation updates to about:blank and preserves the original 25ms polling,
5000ms deadline and read/check ordering (including a blank result at the deadline).

Three differential tests cover window disappearance, fallback/no-retry cases,
created window/tab errors, immediate/polled/failed navigation, null/undefined/zero
IDs and metadata fields. A fourth test composes the restored session with the
restored tab runtime to create an agent tab and claim a new-tab user tab via the
actual translated helpers. The Chrome and lease collaborators remain isolated
fixtures; no real user tabs/windows are mutated.

No third-party tab library is present in this inspected closure: it directly uses
Chrome APIs, Promise/timers and Date. The project factory exposes that host boundary
without inventing different browser behavior. Remaining production work includes
lease/group/favicon, network policy, overlay/monitor/SIWC, full startup/install and
native host plus real desktop/DeepSeek integration.

Validation: all eight reconstructed packages built and passed type checks; all 787 default regression tests passed. The separate native-supervisor suite was not rerun for this component-only change, and no production-extension connection is claimed.


## 16.258 Request-header DNR coordinator and lease codecs

Restored original vy into `request_header_rules.ts`, including grouping by serialized
session/header configuration, locale-sorted groups and numeric tab sorting, paired
resource conditions, extension-initiator exclusion, priority/header operations,
owned rule ID range 1000000–1004999, capacity check, forced live-tab filtering,
serialized-rule cache and failure-report suppression/reset. Like the original,
synchronize returns an Error rather than throwing for caught DNR failures; the
lease manager decides when to propagate it. No unrelated rule IDs are removed.

Restored Du/Sy/Ey/Ty/Iy and the origin/state/mark checks in `lease_codec.ts`. Persisted
lease decoding uses the shared original-derived header parser, preserves null vs
missing viewport, rejects malformed entries, matches numeric storage keys to tabId,
and keeps the original source-lease identity fields (excluding mutable headers,
viewport and marks). It does not introduce stricter positive/safe-ID semantics.

Three differential coordinator tests cover grouping/cache/forced sync, missing
permission/query/read/update failures, duplicate-log suppression and recovery,
5000-rule boundary, malformed headers and cyclic configuration. Two codec tests
cover persisted structure, sparse/malformed fields, numeric boundaries, inheritance,
viewport decoding and lease identity. Tests never install actual user browser rules.

The st mutation/storage/listener manager remains to be translated and connected
with these components. The separate ar Browser Use network-policy manager is also
still pending; this request-header coordinator does not replace it. Full production
startup/install/native-host and real desktop/DeepSeek integration remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 792 default regression tests passed. The separate native-supervisor suite was not rerun for these components, and production DNR/lease integration is not yet established.


## 16.259 Full tab lease manager and session/DNR composition

Translated all original st/wn methods into `tab_leases.ts` and wired the restored
lease codecs, shared header resolver and actual restored DNR coordinator directly.
The factory owns the original singleton scope; startup must share the returned
class across dispatcher/sessions. Chrome storage, clock and instance-ID source are
explicit host dependencies, with no fixture defaults.

Preserved lazy initialization and cached rejection, ownership/child-source checks,
claims/active-turn updates, handoff/resume, header settings, viewport consumption,
marks, stale-tab release, tab removal/replacement subscriptions, serialized mutation
and shallow rollback on mutation/storage failures. DNR errors retain original
method-specific propagation and do not roll back already-persisted state. Active
lease notifications use the original changed-ID ordering and Promise rejection
handling; synchronous listener throws are not newly swallowed.

Four differential scenarios compare complete method/field inventories, dependency
traces, outputs/errors, in-memory maps and persisted storage against the pinned st
with its real original vy. They cover cached load, claims/collisions, headers,
handoff, viewports, stale tabs, event callbacks, save rollback, DNR errors and
recovery. A fifth test composes restored BrowserSession → TabLeaseManager →
RequestHeaderRules over isolated Chrome fixtures, proving agent-tab claim creates
header rules and turn end releases both persisted lease and rules.

Remaining: production shared startup and instance-ID source, group/favicon,
separate Browser Use network policy, overlay/monitor/SIWC, full extension install/
native host and real desktop/DeepSeek integration. No user Chrome storage/rules
were mutated in these tests.

Validation: all eight reconstructed packages built and passed type checks; all 797 default regression tests passed. The separate native-supervisor suite was not rerun for this component composition; production extension startup remains unverified.


## 16.260 Shared browser foundation and extension instance identity

Restored Be/Kg/gc/us/Pp into `instance_id.ts`. Valid stored IDs are returned verbatim
with original nonblank/128-code-unit/well-formed-UTF16 checks, without requiring UUID
syntax. Concurrent callers share the same Promise, successful reads remain cached,
and rejected attempts clear the cache. Missing/invalid identity follows the original
ordered cleanup of session nodeReplTunnel and local browserUseTunnels, then UUID
generation and persistence. No real user storage was accessed by tests.

Added project-authored `createExtensionBrowserFoundation` to compose the restored
identity reader, lease singleton, debugger and tab runtimes with session/dispatcher.
It fills these known dependencies after caller residual dependencies so extra fields
do not accidentally override restored components. One foundation preserves the shared
state scopes expected by the original application. It remains a composition helper,
not a replacement for the full original dR startup or installable extension.

Three differential identity tests cover stored value boundaries and malformed
surrogates, concurrent Promise identity, cleanup order, cached success and retry at
each storage failure boundary. A fourth test uses the foundation and restored RPC
facade to run createTab/attach/executeCdp/turnEnded: getInfo and lease identity agree,
UUID is generated once, debugger listener is registered once across handlers, and
turn end removes lease/header rules/debugger state. Chrome and remaining peripheral
services are fixtures; this is not a production-extension end-to-end claim.

Remaining: group/favicon, Browser Use network policy, overlay/frame monitors, SIWC,
capability/session messaging and full dR startup, manifest/install/native host,
real desktop/DeepSeek integration. The original native supervisor binary is still
external rather than recovered readable Rust source.

Validation: all eight reconstructed packages built and passed type checks; all 801 default regression tests passed. The separate native-supervisor suite was not rerun for this assembly; production extension and live DeepSeek integration remain unverified.


## 16.261 Browser Use network-policy manager

Translated every original ar/op method and _d/mi/oE helpers to `network_policy.ts`.
It preserves the singleton, serialization queue, attaching cancellation flags and
attached-policy cache; positive-safe tab IDs and 1..30000ms timeout checks; no-op
allow-all policy; permission/resource availability checks; closed-tab cleanup;
owned rule range 2000000–2999999; default/allow/block priorities; acknowledged
install/removal; active-page enforcement before attached state; cancellation and
rollback AggregateError including original cause ordering.

The network policy's Vp compiler, Wp predicate and JS active-page enforcement remain
required host dependencies. Inspection shows compilation includes pattern
normalization/intersection and budgets, so no simpler allow/deny implementation is
substituted. The manager is application code directly using Chrome DNR/permissions;
this change does not assert that those pending closures are third-party or complete.

Three differential tests compare full method inventory, traces, results/errors and
state across validation/dedup, stale-rule removal, permissions/API/resource failures,
acknowledgement failure, cancellation during enforcement and failed rollback. A
fourth composition test verifies the restored BrowserSession awaits restored manager
installation/enforcement before debugger attach, and detach removes its rules.
Chrome/compiler/enforcer fixtures isolate these tests; real URL enforcement remains
unverified until the pending original closures are restored and integrated.

Remaining includes those compiler/enforcement closures, group/favicon, overlay/
frame monitors, SIWC, full dR/capability messaging, manifest/install/native host,
real desktop/DeepSeek integration and readable native supervisor source.

Validation: all eight reconstructed packages built and passed type checks; all 805 default regression tests passed. The separate native-supervisor suite was not rerun; real network enforcement and production extension startup remain unverified.


### 16.262 Network policy hostname intersection

Restored the complete original Fp/Bp/jp closure and alphabet, escaping, repetition
and budget helpers as readable hostname_intersection.ts. This is the compiler's
UTF-8 wildcard intersection algorithm, including apex/subdomain expansion, literal
fast paths, memoized product-state traversal, DNS/IPv6 alphabets, branch ordering
and shared state/output budgets. The inspected closure uses standard JavaScript;
no third-party implementation or additional dependency was identified here.

Differential tests compare exact generated regex arrays, errors and remaining
budget counters against the hash-pinned installed extension. The matrix covers
22 patterns in pairwise combinations for both hostname kinds (968 comparisons),
plus multi-pattern and exhausted-budget cases. Explicit disjoint/literal assertions
complement the source comparisons. This restores an internal compiler component;
Vp normalization/rule assembly, Wp URL predicate and JS active-page enforcement
still require integration. No claim of real browser network enforcement is made.

Validation: all eight reconstructed packages built and passed type checks; all 807 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.263 Network policy compiler and URL predicate integrated

Restored Vp/Wp and Ac/Cc/kc/Rc as readable network_policy_compiler.ts. The manager
now defaults to these implementations instead of requiring compiler/predicate
injection. Preserved normalized policy/pattern deduplication and ordering, conjunctive
allowlist intersection, independent deny rules, exact document URL handling,
protocol/port restrictions, regex generation and all policy/pattern/input/intersection/
compiled-output budgets. The prior hostname-intersection implementation is used directly.

Inspection established shared host/origin parsing with browser-service. Moved that
existing implementation to @core/core/originPatterns and retained the old browser
path as a re-export, avoiding a second parser implementation. A differential matrix
checks ic/up/gp behavior on wildcards, IDN, whitespace, ports, IPv4/IPv6 and invalid
patterns. Compiler tests compare exact rules/errors and URL decisions against pinned
original Vp/Wp, including mixed domains/origins, document URLs, deduplication and
budget failures. A manager composition test omits compiler/predicate overrides and
verifies allowed/blocked decisions during enforcement and owned-rule cleanup.

The inspected compiler closure uses standard JS and the already restored shared
parser; no additional third-party library was identified or reimplemented. JS
active-page enforcement remains required and is still a fixture in manager tests.
Production extension startup/native host and real desktop/model integration remain
incomplete; this milestone does not establish real site enforcement.

Validation: all eight reconstructed packages built and passed type checks; all 811 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.264 Active-page network policy inspection

Restored the complete JS/XS inspection closure and YS/QS/eE/dd/tE/hd/Kr/fd/Zr/
rE/nE/Ha/iE/sE/pd/Ae helpers as network_policy_enforcement.ts. The network manager
now defaults to the restored enforcer, compiler and predicate. The enforcer uses
Chrome debugger and standard timers directly; no additional third-party runtime
was identified in this inspected closure.

Preserves temporary debugger attachment, iframe auto-attach and recursive session
removal, loading/context events, stable frame-tree sampling, blank/source/blob
origin resolution, opaque standalone blank-page exception and exact rejection
messages. It neither stops nor reloads the page automatically. Deadline races
remove listeners immediately, while late debugger attachment is still detached;
normal cleanup and detach failure semantics match the original.

Public-entry differential scenarios compare full command/listener/timer traces,
URL predicate inputs, errors and cleanup against the pinned bundle. They cover
HTTP(S), rejected origins, srcdoc/cycles, blob/data, blank/inherited/ambiguous
contexts, iframe sessions, navigation/loading events, malformed trees, API failures,
detachment and an attachment that finishes after timeout. Manager composition
uses the real restored compiler/predicate/enforcer with fixture Chrome, checks
allow/reject decisions and DNR rollback/owned-range cleanup.

These tests do not establish actual installed-extension DNR enforcement. Full
startup/native-host packaging, remaining group/overlay/SIWC/monitor components,
real desktop/DeepSeek integration and native source reconstruction remain open.

Validation: all eight reconstructed packages built and passed type checks; all 814 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.265 Shared foundation network-policy wiring

The browser foundation now constructs a single restored network-policy manager
and supplies it to both command handler and sessions. Compilation/predicate defaults
and the restored inspector are used, with the foundation's host clock/timers.
Residual dependency types no longer require networkPolicy; accidental extra injected
fields cannot replace the shared instance. This closes the assembly gap between
the individually restored policy components and the existing RPC/session path.

Expanded the foundation RPC composition test to use all restored policy components.
It first rejects attachment when the existing frame is outside policy, confirms
policy rollback without losing request-header rules, then attaches under a matching
policy. It checks the inspector's detach occurs before session debugger attachment,
both DNR ownership ranges coexist, and turnEnded cleans leases/rules/debugger state.
Chrome permission/debugger/DNR/storage APIs remain explicit fixtures; this is not
a claim of live installed-extension enforcement or full original dR startup.

Full extension packaging/native host, remaining group/favicon/overlay/SIWC/monitors,
real desktop/model integration and native source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 814 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.266 Managed tab groups restored and composed

Restored every original bS/yn method plus Da/vS/La title and color behavior as
tab_groups.ts. The shared foundation now supplies this singleton to all sessions.
Preserved legacy/current storage, lazy cached initialization/rejection, managed-group
lookup/reuse, title defaults, palette selection, group removal listeners, stale
cleanup and best-effort ungrouping. The inspected closure directly uses Chrome
APIs and standard JS; no additional third-party library is needed.

Three differential tests compare full method inventory, traces, storage and state
across creation/reuse/release, title normalization, migration, cached failures,
persistence failures, optional APIs, stale groups and removal notifications. The
foundation RPC composition now exercises real restored groups with fixture Chrome,
checking creation/persistence and empty-group cleanup at turnEnded. Its Chrome
remove fixture now actually removes tabs, matching the intended API state change.

Real tab-group UI/installed-extension validation, favicon/overlay/SIWC/monitor
components, production startup/native host, desktop/model integration and native
source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 817 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.267 Favicon resource loading

Restored the complete pS/mS/gS/_S resource closure as favicon_resource.ts, retaining
extension favicon URL construction, size=32, credentials omission, 2-second abort,
MIME checks/fallback, 64 KiB declared and streamed limits, cancellation and chunked
base64 output. The original closure uses fetch, Web Streams, AbortController and
standard encoding; no third-party image library was found or reimplemented.

Differential tests compare data URLs and exact read/cancel/timer/fetch traces with
the pinned original across boundary lengths, missing/bad/case-sensitive MIME types,
invalid length headers, absent streams, transport/read/cancel failures and deadline
abort. These tests use synthetic responses and do not contact user pages.

Ma's badge state/cache/publication manager and its consumer remain to restore and
integrate; this helper alone does not display a favicon badge. Production extension
startup/native host, remaining UI/auth/monitor components, real desktop/model
integration and native source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 819 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.268 Favicon badge manager and content readiness

Restored the complete Ma/Kt manager with original fields, methods and event callbacks
as tab_favicons.ts. It directly composes the restored resource reader and new
content_runtime.ts (Mu/Ta/_y/de/Ea/gy plus Gu/rS). Content readiness preserves
ping-before-injection, per-tab in-flight deduplication, original script path, follow-up
ping, null timeout and late work behavior. No third-party runtime is reconstructed.

Manager state and publication queues remain distinct; active leases override
finalized badges, visible tabs clear unseen state, cache reads verify URL/icon
stability, events invalidate caches and migrate/remove badges, closing suppresses
publication, and failed close clears closing state. Original eager initialization,
storage validation, mutation-before-save failure, queue recovery and disposal are
preserved. Timeouts do not silently become cancellation of underlying operations.

Three content-runtime differential tests verify injection/timeout traces and badge
URL recognition. Three manager tests compare all prototype methods plus full traces,
state/cache/storage against the pinned original, using restored resource/readiness
logic over fixture Chrome/fetch. They cover visibility, active leases, publication,
navigation races, events, persistence failures, close/restore failure and recovery.

Shared foundation wiring and the actual content-script badge consumer remain
pending; this does not demonstrate visible badge UI or complete extension startup.
Native host, remaining overlay/auth/monitor components, real desktop/model
integration and native source reconstruction also remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 825 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.269 Favicon manager foundation wiring

The foundation now creates a shared restored favicon manager using the same lease
singleton as sessions. Handler favicons and session tabFavicons are supplied
automatically; residual caller fields cannot replace this shared implementation.
Resource fetching defaults to host fetch/global fetch and supports explicit host
injection for tests. Original initialization still occurs when the singleton is
first requested, not when merely constructing the foundation.

The RPC composition fixture now uses restored manager/resource/readiness code and
real restored lease subscriptions. After createTab it observes an active badge with
the decoded fixture favicon. On turnEnded it verifies clear-badge messaging before
Chrome tab removal and removal-event cleanup of the cache and closing-tab set.
Fixture storage now keeps lease and badge keys independently, and tab-removal
events propagate to registered listeners rather than silently mutating a map.

The installed content-scripts/codex.js artifact exists and is the next page-consumer
source to inspect. It is not yet reconstructed or assembled, so these tests do not
prove rendered favicon UI. Production startup/native host, remaining overlay/auth/
monitor components, real desktop/model integration and native source remain open.

Validation: all eight reconstructed packages built and passed type checks; all 825 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.270 Page-side favicon rendering and messages

Inspected and hash-pinned installed content-scripts/codex.js (35191 bytes, SHA256
168b307ff1e936bcfdc9344f4e668b4767cf91b6ac8d7dd868e927c9474c9221).
Restored Et/Rt and the complete DOM/SVG helper closure as favicon_badge_dom.ts,
sharing existing badge-URL recognition. It preserves tracked/stale links, original
href metadata, site-authored icon changes, created-link deletion, temporary rel
changes and deferred cleanup, plus exact SVG shapes/colors/opacity/escaping.

Un/Fn/Gn/je message initialization/guards are restored with the original one-listener
and repeated-overlay-setup behavior. Q overlay initialization remains an explicit
required dependency; the full content script entrypoint is not replaced. These
closures use DOM and standard JS without a third-party renderer.

A real Chromium differential test compares exact link DOM/SVG URLs with original
inspected bindings for existing/missing icons, all three badges, page changes,
clear/reapply races and message return/acknowledgement behavior. It caught and
resolved a browser timer receiver issue: the injected timer is called unbound,
matching the original global setTimeout rather than as a host-object method.

Full overlay/content entrypoint assembly, installed-extension packaging/native host,
remaining auth/monitor components, real desktop/model integration and native source
reconstruction remain incomplete. This milestone verifies page DOM behavior, not
full browser tab-strip rendering or the complete installed-extension workflow.

Validation: all eight reconstructed packages built and passed type checks; all 826 default regression tests passed, including the real Chromium page-DOM comparison. The separate native-supervisor suite was not rerun.


### 16.271 Overlay root lifecycle

Restored content-script Q/T/Hn/ze as createOverlayRoot. Preserved closed shadow
root/style/container creation, existing owned-root replacement, foreign root-ID
collision handling, observer targets/retargeting, renderer cleanup, and suppression
after the page removes the root until documentElement changes. The original Dn
renderer remains required; no empty production renderer is substituted.

A real Chromium differential test compares original and restored DOM/lifecycle
traces across normal, stale, foreign div/non-div, reparented, removed and replaced
document roots. Explicit assertions complement exact trace equality for removal
suppression and document replacement recovery.

Startup tail inspection also found wxt:locationchange and wxt:content-script-started
signatures in its lifecycle wrapper. Upstream package/version compatibility needs
verification before reuse; this framework wrapper is not being reconstructed from
scratch. No third-party library was found inside the inspected root-DOM closure.

Cursor renderer/content startup assembly, installed extension/native host, remaining
auth/monitor components, real desktop/model integration and native source remain
incomplete. Tests use the original renderer boundary with an explicit tracing fixture.

Validation: all eight reconstructed packages built and passed type checks; all 827 default regression tests passed, including the real Chromium overlay-root comparison. The separate native-supervisor suite was not rerun.


### 16.272 Overlay state and message controller

Restored Dn/Pn/qe/wn as overlay_controller.ts. It retains state normalization and
finite-coordinate checks, top-frame-only animator creation, original asset URL and
glow color, visibility/turn keys, viewport dimensions, arrival notifications,
request generation checks, pageshow refresh, resize handlers and disposal ordering.
The rn animation engine remains an explicit required factory; no simpler animation
is substituted. The inspected controller uses DOM/Chrome APIs and standard JS.

A guard matrix compares original normalization. A real Chromium differential test
runs top and child frames, comparing exact DOM and message/animator traces, including
stale initial responses, out-of-order pageshow responses, arrival identity and late
responses after disposal. The animator itself is a tracing fixture in these tests.

Animation, complete content startup/framework reuse, production extension/native
host, remaining auth/monitor components, real desktop/model integration and native
source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 829 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.273 Cursor spring integration

Restored R/v/I/An/We/Ye/N as readable cursor_spring.ts. The module preserves field
initialization/reset, 1/240-second integration order, stiffness cap, response and
damping calculations, script/simulation clocks, long-frame catch-up, rest snapping
and unwrapped shortest-angle targeting. The zero-target rest rule is deliberately
retained, including its unusual acceptance of nonzero distance at zero velocity/force.
No external package call appears in this inspected numerical closure.

Two differential tests compare complete spring states at each of 9000 trajectory
steps across six parameter sets and five start/target pairs, with dynamic targets,
resets, zero/negative frame durations and long frames. Boundary comparisons cover
rest velocity and +/-180-degree wrapping; an explicit convergence assertion prevents
relying solely on equality with extracted source.

This is the original animator's numerical component, not a completed animation
engine. Motion state/geometry, DOM renderer, full content startup/framework reuse,
production extension/native host, remaining auth/monitor components, real desktop/
model integration and native source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 831 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.274 Cursor paths, motion state and DOM animator

Restored the complete inspected geometry closure as cursor_path.ts: 20 candidates
in original order, single/two-segment cubic paths, boundary preference, sampled
curvature cost and path-dependent spring response. cursor_motion.ts consumes the
restored spring module and preserves 196px scoot/bezier selection, dynamic targets,
arrival/reset behavior, visibility/stretch/rotation integration and thinking motion.

createCursorAnimator restores rn/sn and rendering/frame helpers: exact DOM/styles,
viewport clamping, first-frame timing, requestAnimationFrame/timer fallback, turn/
sequence arrival deduplication, hidden reveal, no-cursor thinking and destruction.
The overlay controller now uses this restored animator by default; its optional
injected factory remains available for host-boundary tests. No third-party calls
appear in these inspected geometry/animation closures; WXT startup is still pending
upstream verification rather than being independently reimplemented.

Differential tests compare 108 path cases and samples, 4320 complete motion frame
states with retarget/reset/arrival, and actual Chromium DOM/arrival/frame traces
under both animation-frame and timer scheduling. The DOM test uses a deterministic
clock/scheduler and covers interrupted movement, both modes, immediate/clamped
positioning, hide/reveal, repeated sequence keys and destruction during motion.
An additional real Chromium composition test uses the default restored animator,
comparing controller DOM and exact AGENT_CURSOR_ARRIVED messages to the original.

Full content startup/framework reuse, extension production assembly/install/native
host, remaining auth/monitors/mentions, real desktop/model integration and native
source reconstruction remain incomplete. These tests do not establish an installed
extension end-to-end run.

Validation: all eight reconstructed packages built and passed type checks; all 835 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.275 Content entry assembly and direct upstream WXT reuse

createCodexContent now composes the restored root/controller/default animator and
favicon/message handlers. codex_entry.ts preserves Vn/Kn options and constructs a
real upstream ContentScriptContext before main. The bundle exposes the original
startup Promise shape; original production logging is a no-op. The build now emits
dist/content-scripts/codex.js using esbuild and production/entrypoint defines.

Audited upstream WXT releases: 0.20.11 uses a different postMessage lifecycle;
0.20.25 matches the inspected context/location/event closure; 0.21.5 introduces an
additional option. Directly reuse pinned WXT 0.20.25 (locked @wxt-dev/browser 0.1.43),
not a rewritten framework. This does not prove the original historical version.
File hashes, mapping and official source references are in extension-wxt-provenance.

Full original hash-verified content startup and the reconstructed bundle are compared
in isolated real Chromium top/child frames, including shadow content, favicon
changes, cursor messages/arrival, repeated injection and removed-root suppression.
Repeated injection retains the original old ping listener behavior; main does not
register context cleanup. Separate upstream WXT differential coverage includes
runtime selection, timers/frame/idle cancellation, invalidation, self/foreign events,
Navigation API and polling location watchers.

The complete installed-extension background/manifest/assets/native-host workflow,
other content scripts, auth/monitors/mentions, real desktop/model integration and
native source reconstruction remain incomplete. This is fixture integration of the
complete codex content entry, not production installed-extension validation.

Validation: all eight reconstructed packages built and passed type checks; all 837 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.276 Background overlay management and cursor roundtrip

Restored aS/Hu/nS/sS as OverlayManager, preserving session insertion priority,
per-turn cursor clearing, linked tabs, request counts/AbortSignal, stop/finish
distinctions, activity edge notifications, hidden cursor projection and bounded
publication. Restored oS/zu/cS as ObservedTabs: active tabs in every window count
as observed, independently of focused-window status; event registration/disposal
and changed-tab order are retained. fR is the cursor state/arrival message router.

Foundation now shares one observed-tabs/overlay instance between handler and
sessions and one content readiness/injection runtime between overlay and favicons.
It exposes the bound message router; initialization/listener installation remain
startup responsibilities. Observed-tab audio muting/restoration from the original
change callback is still outstanding, so this is not full dR startup wiring.

Differential tests compare every manager prototype method, state/publication traces,
priority across overlapping sessions, aborted requests, turn resets, missing tabs,
failed/non-boolean acknowledgements, message validation, multi-window changes and
listener disposal. A real Chromium roundtrip uses the restored background manager,
actual bundled content script, animator and original-derived command arrival waiter:
notifications resolve the waiter before timeout, while observation loss hides the
cursor and stopping aborts the request. This test does not exercise full RPC/session
activation; the separate foundation RPC test verifies actual shared overlay state.

Production background startup/manifest/native host, frame monitors, audio handling,
auth/mentions/other content scripts, real desktop/model integration and native source
reconstruction remain incomplete. The browser host transport is a fixture, not an
installed production extension.

Validation: all eight reconstructed packages built and passed type checks; all 841 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.277 Background-tab audio and observation race handling

Restored Vu/lS/Wu/Ku and Ra/Oa in createTabAudioController, including active/already-
muted guards, extension-ID/reason ownership checks, best-effort tab errors, parallel
restoration and pending-mute cleanup. The original hi.setChangeHandler callback is
now composed: newly observed tabs mark any pending mute for subsequent restoration,
while overlay publication and audio restoration run concurrently. Foundation passes
the same mute operation into session create/child-claim paths.

Differential tests extract the original audio functions and the actual top-level
change-handler registration, comparing active/muted ownership cases and failed tab
access/updates. Deferred updates verify activation during muting restores audio
after completion and clears tracking state on both success and failure. Foundation
RPC integration verifies mute on tab creation and restoration on observation.
No release-time unmute is invented; the inspected source uses observation changes.
These tests use explicit Chrome API fixtures rather than actual user audio tabs.

Full background startup, frame monitors, auth/mentions/other content scripts,
manifest/native host and installed-extension validation, real desktop/model
integration and native source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 843 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.278 Foreign-frame DOM, content entry and background lifecycle

Restored shared background jy/content R as self-contained foreign_frame_dom.ts,
including own/foreign URL filtering, iframe srcdoc/legacy frame handling, open/closed
shadow traversal, mutation watching, state guards and cleanup. The new foreign-frame
content entry preserves original options and Promise startup, directly reusing
WXT 0.20.25 with ENTRYPOINT=foreign-frame-monitor. Its installed artifact is hash-
pinned separately (5158 bytes; recorded in extension-source.json).

createForeignFrameMonitor restores the background lifecycle: event registration,
lease identity, document cache, direct injection, fallback ping/file injection,
navigation/debugger invalidation, replacement/removal, concurrent preparation and
cleanup waiting for bounded in-flight work. Timeout does not cancel Chrome execution.
Foundation creates one monitor with the provided original-derived browser-family/
internal-URL helpers when creating a handler class; handlers initialize it and
sessions share track/ensure/remove using actual shared leases/content runtime.

Differential tests cover complete lifecycle traces and injection/removal/retracking
races. Isolated Chromium tests compare original and rebuilt full entry plus serialized
installers for open/closed shadow capabilities, dynamic frames, mutation, removal
and reinjection. The closed-shadow Chrome capability is an explicit fixture.
Foundation RPC integration verifies document injection on claimed tabs and all-frame
cleanup on turn end. No real installed-extension permission behavior is proven.

Full background startup, popup interception, authentication/mentions/other content
scripts, production manifest/assets/native host and installed-extension E2E, real
desktop/model integration and native source reconstruction remain incomplete.

Validation: all eight reconstructed packages built and passed type checks; all 846 default regression tests passed. The separate native-supervisor suite was not rerun.


### 16.279 Popup MAIN/isolated bridge and session integration

Restored Ny/Uy/$y/Fy/By as self-contained popup_dom.ts. MAIN world retains window.open
and anchor interception, reserved/named-target and URL rules, cancellation and
noopener/noreferrer return semantics. Isolated world retains userActivation checks,
one-request allowance and trusted click/keydown reset. Removal preserves a site
replacement of window.open instead of overwriting it.

createPopupInterceptor restores Cy..Dy tracking, pending injection deduplication,
ordered world preparation, navigation/replacement/removal and waiting for pending
work before cleaning both worlds. createPopupMessageHandler restores Oy plus the
original dR popup branch; the existing command handler performs lease/session/URL
checks and child-tab creation/claim/navigation. Foundation now shares the interceptor
with handlers and sessions and exposes the message route.

Differential tests compare lifecycle traces, acknowledgement/failure conditions,
removal/retracking races and the actual extracted dR listener branch. Real Chromium
MAIN and CDP isolated contexts compare the DOM event bridge, trusted versus synthetic
reset, duplicate requests, target/features return semantics, a real intercepted anchor
click, additional direct anchor guards and cleanup/ownership preservation. Foundation
RPC fixtures also verify child-tab claim/navigation and two-world turn cleanup.

The full installed-extension listener/startup, authentication/mentions/other content
scripts, manifest/assets/native host, real desktop/model integration and native
source reconstruction remain incomplete. Browser runtime APIs in these tests are
fixtures, not proof of installed-extension permissions or complete end-to-end delivery.

Validation: all eight reconstructed packages built and passed type checks; all 850 default regression tests passed. The separate native-supervisor suite was not rerun.

### SIWC account context, browser grants and cookie installation

Restored background Kp/Oc/Zp/Jp/Pc, Qc/el/Pr and py/xu/Pu into
`packages/browser-extension/src/siwc.ts`. The service reads the ChatGPT session,
checks the committed origin and incognito state, hashes the original account identity,
rechecks the page origin, issues a bounded browser grant, and installs its bootstrap
cookie. Cookie installations share one queue across instances within a runtime
factory. Account/page changes after installation delete the cookie; all service
errors retain the original generic error. Foundation supplies this actual service
instead of requiring an external SIWC stub. The original auth request counter is
exposed as an instrumentation hook for the still-unrestored auth cache/lifecycle.

Four differential tests exercise account/grant/cookie traces, origin/account changes,
HTTP failure and body cancellation, auth decoding, expiry boundaries, and serialized
cross-instance installation with failure recovery. All HTTP/CDP inputs are fixtures;
no real account grants or cookies were created. This inspected closure uses browser
platform APIs directly and introduces no third-party dependency.

Validation: eight-package build/type checks and 854 default regression tests pass.
After removing the obsolete Foundation test stub, targeted tests and extension type
checks also pass. Full auth cache/lifecycle, mentions, startup/install, native host,
real desktop and model integration remain incomplete; native-supervisor tests were
not rerun.

### Shared authentication cache and Chat API request lifecycle

Restored Xc/Ss as a cached-reader factory and shared request generation in the SIWC
runtime. Direct session reads invalidate existing reader caches, origin changes cause
new reads, and a cached rejection persists until invalidation. Aborting a waiter does
not abort the shared fetch. The actual generation now replaces the prior standalone
instrumentation placeholder; the optional observer remains available.

Restored Dn/Yc/Zm as ChatApiHttpError, createChatApiClass and readChatRetryability.
Requests preserve account/header overrides, composed cancellation, timer cleanup,
HTTP retry metadata, JSON/custom response parsing, and disposal. Foundation exposes
the host-bound ChatApi class; full authentication orchestration is still not wired.
No additional third-party library is used by these inspected source closures.

Two differential tests compare cache generation/cancellation/rejection behavior and
13 client scenarios, including caller cancellation, disposal, timeout during transport
or response processing, HTTP body formats and custom readers. Fixtures never contact
real authentication endpoints. Full startup/auth orchestration, tab mentions, extension
installation/native host and desktop/model integration remain open.

Validation: eight reconstructed packages build/typecheck successfully; all 856 default
regression tests pass, with zero failures or skips. Native-supervisor tests were not rerun.

### Tab mention provider, search and favicon update lifecycle

Restored Xu/RS/OS/Yu and Ju/fi/yS/Na/SS/ES/TS/Rp into tab_mentions.ts.
The provider persists its generation, shares/retries identity reads, validates queries,
filters private/unsupported/ChatGPT tabs, sorts by recency with original tie-breakers,
and caps mention results at 100. Generic search retains original zero-limit behavior;
the provider's zero-limit path returns before querying tabs. Existing UTF-16 and stored
identity validators are reused rather than duplicated.

Favicon warmups preserve four concurrent reads, per-tab/page deduplication, candidate
updates, and one invalidation when a successful batch drains. kS event observation
preserves first-event 50ms coalescing, registration order and cleanup. Foundation now
uses the actual provider instead of requiring a stub, exposes its class/observer,
and the integration fixture checks persisted generation and provider tab identity.
Full dR notification fanout and side-chat content-message wiring remain unfinished.

Four source-differential tests cover guards/search/caps, identity failure recovery,
warmup scheduling/subscriptions and event coalescing. No real user tabs or browser
profile are read; Chrome APIs are fixtures. These source closures have no external
library dependency. Native/platform and installed-extension/model delivery gaps remain.

Validation: all eight package builds/type checks and all 860 default regressions pass
(zero failures/skips). Separate native-supervisor tests were not rerun.

### Tab mention runtime/port message bridge

Restored Nc/_s/cn/If, Tf/KC/ZC and hR into tab_mention_messages.ts.
The bridge preserves extension/frame/lifecycle/origin checks, production versus
non-production loopback rules, strict message parsing, current-tab exclusion and
search overfetch/caps. A matching port accepts only its first message, streams
favicon candidate updates after a successful search, and unsubscribes on disconnect
or post failure. Disconnecting during a pending search suppresses its reply and
prevents creating a candidate subscription. Invalidation notifies the peer then
runtime, retaining the original asynchronous failure handling.

Foundation exposes host-bound message-router and invalidation helpers. Four
source-differential tests cover sender gates, search replies/errors, port lifecycle
races and notifications. An additional integration test composes the actual restored
provider with the port router, checks provider IDs and favicon updates, then checks
subscription cleanup after disconnect. Chrome APIs remain explicit fixtures.

Full dR registration/peer fanout and side-chat content scripts remain outstanding;
this is not a complete installed-extension startup. No new third-party dependency
was required by the inspected closures. Native and real model/desktop integration
remain unfinished.

Validation: all eight reconstructed packages build/typecheck successfully; all 865
default regressions pass with zero failures/skips. Native-supervisor tests were not rerun.

### Side-chat tab mention content script

Restored content-scripts/side-chat-tab-mentions.js W/u/U/L/J.main as readable
side_chat_mentions.ts and its production entry. The entry directly uses upstream
WXT ContentScriptContext and defineContentScript, with original allFrames, matches,
includeGlobs, document_start and ISOLATED settings. Build now emits a third standalone
content script. Query validation reuses the shared restored helper.

Search requires a trusted interaction within five seconds and consumes that allowance.
The active port owns candidate publication; old/disconnected results are ignored.
Candidate attributes exist only during synchronous DOM event dispatch. Parent capability
handshake, extension ancestry/private-context guards, status publication and invalidation
are preserved. No copied framework runtime or new dependency was introduced.

Three tests compare inspected source with reconstruction: real Chromium trusted
clicks, synthetic-event rejection, expiry, single-use allowance, old-port suppression,
failure and DOM cleanup; parent capability handshake under explicit host fixtures;
and full original/built WXT startup outside extension ancestry. The eligible parent
handshake is not yet tested in an actually installed extension iframe. Full background
startup/fanout, remaining content scripts, auth orchestration, native host and real
model/desktop integration remain outstanding.

Validation: all eight package builds/type checks and all 868 default regressions pass
with zero failures/skips. The separate native-supervisor suite was not rerun.

### MAIN-world work preload and media permission bridge

Restored codex-work-preload.js v.main and the production MAIN-world entry. Valid
extension ancestor origins set the non-writable/non-enumerable/non-configurable
side-chat marker before the surface/media guards. Matching surfaces wrap getUserMedia,
query requested microphone/camera permissions, register one-shot change listeners for
prompt states before notifying the parent, and call the captured bound media method
after permission changes. Denied changes retain the original NotAllowedError. An
already-denied permission is passed through to the native method, as in the source.
No new timeout, retry, cleanup or permission policy was invented.

The build emits codex-work-preload.js as a fourth content script. The MAIN wrapper
uses upstream defineContentScript directly and deliberately does not construct the
ISOLATED-world ContentScriptContext, matching the installed artifact.

Two tests compare full original and built scripts across fifteen host-fixture scenarios:
ancestor/surface/media guards, property descriptor, audio/video/no-media constraints,
receiver binding, reinjection, query/native failures, single/both prompt waits and denial.
No camera/microphone permission prompt or real media capture occurs. Real installed
extension parent routing remains unverified. Remaining website content script, full
background startup, auth orchestration and native/model integration are still open.

Validation: all eight package builds/type checks and all 870 default regressions pass
with zero failures/skips. The separate native-supervisor suite was not rerun.

### ChatGPT website content entry and status/action bridge

Restored re/oe/ie/se and ue from chatgpt-website.js into website_content.ts and the
production website_entry.ts. Shared mention search code is reused. The fifth content
script is built with upstream WXT ContentScriptContext/defineContentScript.

Status connection preserves the available marker, DOM-ready observation, browserContext
carry-forward, port identity checks, refresh posting, single permitted reconnect after
a refresh, and 250ms retry timing. Trusted click actions retain composed-path lookup;
custom action requests retain userActivation/cancelable/defaultPrevented and field
checks. Runtime ping/plugin-change handling and settings events retain original gates.
WXT invalidation removes runtime listeners, ports, timers and status attributes.

A full-entry differential test in real Chromium covers status changes and context
carry-forward, refresh/disconnect/post failure, connect failure and bounded retry,
trusted versus synthetic actions, custom action validation, runtime sender checks,
settings events and full WXT invalidation. Runtime/port APIs and retry timers are
explicit fixtures; this is not installed-background integration. All five installed
content-script entrypoints now have reconstructed build outputs, but full background
startup, status/side-panel backends, native host and model/desktop delivery remain open.

Validation: all eight reconstructed package builds/type checks and all 871 default
regressions pass, zero failures/skips. Native-supervisor tests were not rerun.

### Website background status port and installer state

Restored vk as createWebsiteStatusHandler, including sender validation, incremental
identity/side-panel/window/update/toolbar/installer status, native transport snapshots,
capability projection and browser-control activity. Each async status source retains
its own single-flight guard and one retry. Disconnect suppresses later application
and publication, and port write failure performs original listener cleanup.

Restored kf/sk/ak/ik as createInstallerStatus: the exact original download URL regex,
latest matching download lookup, state/progress projection and authorized show action.
This module never initiates downloads. Foundation supplies shared instance identity,
overlay activity and installer reader; telemetry is an explicit caller dependency.

Two differential tests compare nine status-port scenarios and eight download states,
including concurrent refreshes, first/second identity failures, disconnect while reads
are pending, write failure, native connected installer suppression, malformed senders,
side-panel absence and show authorization. Chrome/download APIs are fixtures. Full
background registration and installed page-to-background transport still need validation;
auth/side-panel backends and native/model delivery remain incomplete.

Validation: eight package builds/type checks and all 873 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Client heartbeat and disconnected cleanup

Restored Gk/Ho as registerClientHeartbeat and bound it through Foundation to the shared
lease manager, overlay sessions and network policy manager. Registration preserves
existing alarms or creates the original half-minute alarm. Each matching tick starts
header reconciliation independently, then awaits Promise.any of the original 3-second
false timeout and client pings. The first fulfilled false value triggers cleanup even
if a different ping later returns true; this behavior is preserved rather than changed.

Cleanup awaits session stop, target enumeration and all debugger detach attempts,
then initiates network policy detach without awaiting its completion. Reconciliation
and policy failures retain their separate diagnostics. Session-stop/target-enumeration
failures retain original propagation. No extra listener disposal or timeout cancellation
was invented, because the inspected startup registration does not implement either.

Two source-differential tests cover eleven scenarios: existing alarm, healthy/absent/
rejected/synchronous-failing pings, false-first race, reconciliation failure, stop/target
failure, policy failure and pending policy completion. Fixtures validate ordering and
error propagation without manipulating real alarms or debugger sessions. Full startup
must still call the helper with actual native/tunnel peers; installed lifecycle and
native/model delivery are not yet complete.

Validation: all eight package builds/type checks and all 875 default regressions pass,
zero failures/skips. Separate native-supervisor tests were not rerun.

### Extension update lifecycle and active-control deferral

Restored _k/fn as createExtensionUpdateManagerClass. It retains session-persisted
pending versions, installed-version checks, runtime listener registration, busy-state
deferral, clear-before-reload ordering and failure state. Concurrent restoration keeps
the original guard placement rather than introducing different locking semantics.
Foundation exposes a shared manager and registration helper that wires overlay
activity changes to retry pending updates when control becomes idle.

Three differential tests cover stored value variants, active deferral, storage/reload
failures, registration suppression, concurrent restore and constructor overrides.
The Foundation RPC integration fixture now creates a pending update while its restored
session is active and verifies exactly one reload after turnEnded clears activity.
Reload is a fixture callback; the real extension/runtime was not reloaded.

Full startup must still invoke registration in the original ordering. Other remaining
startup, side-panel/auth backend and installed/native/model integration gaps are not
closed by these tests. No third-party dependency was added for this source closure.

Validation: all eight package builds/type checks and all 878 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Side-panel tab destination state

Restored Sk/Df/Ek/Tk/Ik/Ak/$o/Fo/Ck/Nf/kk plus storage/path helpers as
createSidePanelTabController. Temporary and persistent tab sets retain original
mutation order, lazy/coalesced restoration and stored-ID validation. Edge retains its
original global enabled setting and per-tab no-op paths. Other browsers restore and
apply per-tab options. Tab removal clears conversation/invocation state; registration
shares its disposer and can re-register after cleanup.

Foundation exposes one lazy controller per runtime with explicit Edge detection and
warning dependencies. Three differential tests cover initialization, persistence,
temporary enablement, removal, Edge differences, events, registration lifecycle,
read/write/options failures and concurrent restoration. Recovery behavior is preserved:
a swallowed storage-read failure does not trigger an invented reload on later calls.

Chrome side-panel/storage calls are fixtures. Actual side-panel opening, startup
registration, panel UI, authentication, native and model integration remain incomplete.
No third-party package was required by this inspected closure.

Validation: eight package builds/type checks and all 881 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Side-panel window opening, toggling and state union

Restored Dk/jf/qf/Hf/Nk/Ji/Uk/Gf as createSidePanelWindowController. Window-wide
and per-tab open state remain distinct and contribute to the persisted open-window
union. Open invokes temporary enable and sidePanel.open before awaiting either,
retaining user activation. Failure rolls back the tab option; successful opening
records state and reports telemetry. Closing records state in finally, retaining
original error/cleanup ordering. Edge ignores the tab target as in the source.

Foundation lazily shares the window controller and the existing tab controller.
Callout clearing, browser identity and telemetry remain explicit dependencies for
full startup wiring. Three differential tests compose actual original/restored tab
controllers with their window controllers, checking pending enable versus open order,
nine success/failure modes, global/tab union, event registration and persistence.
Chrome side-panel calls remain fixtures; no real panel was opened or closed.

Website/action/menu/shortcut entrypoints, panel UI, full startup/auth wiring and real
installed/native/model integration remain unfinished. No dependency was added.

Validation: all eight package builds/type checks and all 884 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Side-panel website requests and context-menu invocation

Restored xk/Bf/Mk/Lk as createSidePanelActions. Website requests retain exact sender
checks, default source, work-mode validation and 8192-character nonblank prompt rule.
Invalid/oversized prompts are ignored while the panel still opens, matching the source.
Opening starts immediately; only successful opening persists the original prefill
shape. Selection prefills retain the 80000-character slice and blank-selection skip.
Context-menu URL fallback and missing-tab guards are preserved.

Foundation binds the actions to its shared window controller. Three differential tests
cover payload and origin/frame gates, prompt boundaries, deferred successful persistence,
open/storage failures, context-menu routing, blank selection and truncation. No real
panel or context menu was created. Toolbar/shortcut setup, UI, complete startup and
installed/native/model integration remain unfinished. No third-party library was added.

Validation: all eight package builds/type checks and all 887 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Side-panel toolbar and shortcut entrypoints

Restored Ok/Ff/Pk as createSidePanelEntrypoints. Registration retains callout/event/
icon/shortcut/menu ordering, or icon-only registration when sidePanel is absent.
Icon clicks skip toggling an already-open panel; the keyboard shortcut invokes the
toggle directly. Missing open API falls back to creating the extension panel page and
reports opening only after success. Original failure suppression is retained.

Foundation binds entrypoints to its shared window controller and restored context-menu
handler; callout/telemetry remain explicit dependencies. A source-differential test
covers seven modes including absent API, missing open, already-open, and callout/create/
toggle failures. No real icon handler or shortcut was registered. Full startup ordering,
callout implementation, panel UI, authentication and installed/native/model integration
remain outstanding.

Validation: all eight package builds/type checks and all 888 default regressions pass,
zero failures/skips. The separate native-supervisor suite was not rerun.

### Action callout and profile badge queue

Restored uk/dk/hk/fk/pk/mk/gk/Pf/xf/No as action_callout.ts. Label trimming, whitespace
collapse, 24-code-unit slicing, eight-color unsigned hash and four-code-unit initials
retain original Unicode behavior. Badge/show/clear operations share a promise queue;
failed operations reject their caller while allowing later operations to proceed.
Clear restores the manifest title and badge before persisting the seen version. Already
seen versions skip both showing and clearing, including badge changes in clear.

Foundation shares the restored callout between side-panel entrypoints and the window
controller, removing their external show/clear dependencies. Two source-differential
tests cover label boundaries and nine queued success/failure/version modes, including
held initial reads, rejected reads/title/badge/storage writes and recovery. Chrome action
and storage APIs are fixtures: no installed extension badge was changed. No third-party
library is used by this inspected closure; no dependency was added.

Full startup/telemetry, panel UI, authentication orchestration, native replacement and
installed/native/model end-to-end integration remain incomplete.

Validation: all eight package builds/type checks and all 890 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Toolbar snapshots and side-panel runtime messages

Restored jk/Xi/qk as createToolbarStateReporter. It registers toolbar settings and alarm
listeners and creates the six-hour alarm only when absent. Reporting shares a recovery
queue. Any numeric prior snapshot suppresses update-trigger reporting; startup/alarm
suppression compares floored UTC-day values. Changed events use the supplied pin state
and do not persist a snapshot. Metric success precedes persistence, preserving retries
and warning behavior. Foundation exposes a factory bound to its clock and Chrome APIs.

Restored wk/Kk/Zk as side_panel_messages.ts. Identity and load-event messages require
the exact own extension ID and side-panel URL (query variants rejected). Identity failure
replies with null before recording the setup-failure metric. Load reporting replies on
both fulfillment and rejection, forwarding the original result/error. Validation retains
safe nonnegative integer boundaries, inherited properties and extra-field acceptance.
Foundation supplies its shared instance-ID reader; metric transport remains injected.

Three source-differential tests cover eleven toolbar modes, held queued reads, daily
rollover, alarm and storage/metric failures; load-event validation boundaries; and seven
message success/error/sender modes. Chrome APIs and metrics use fixtures; no real alarm
or telemetry was emitted. No third-party library appears in these inspected closures.

Original startup registration, full lifecycle/auth orchestration, panel UI, native
replacement and installed/native/model integration remain incomplete.

Validation: eight package builds/type checks and all 893 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Side-panel authentication operation lifecycle

Restored Yk/Qk/Jf/Xf/Wt/eR in side_panel_auth.ts. Enabled construction registers tab
update/removal listeners and returns the message handler; disabled construction returns
false without listeners. Persisted operations are filtered by original validators and
processed through a shared queue. Matching nonexpired operations reuse their auth tab;
otherwise login/logout/open creates the original URL and a ten-minute operation.
Owner-window checks, focus ordering, callback timing and sender rejection are preserved.

Completed navigation can focus the owner and send revalidation, including the logout
login-page exception. State completion checks owner window, expiry and expected sign-in
state, persists deletion before closing the auth tab, and swallows close failure. Removed
auth/owner tabs delete the first matching operation; only auth-tab removal revalidates.
Expired navigation deletes the operation without inventing a timer or closing a tab.
Foundation exposes the handler bound to shared Chrome APIs and clock, leaving the auth
refresh callback explicit until full lifecycle wiring is restored.

Two differential tests compare validators and seventeen lifecycle/failure modes against
hash-pinned installed bindings, including queued duplicate opens, moved tabs, exact expiry,
invalid storage, callback exceptions and read/write/create/focus/remove/send failures.
Chrome APIs are fixtures: no real authentication page, login/logout or tab mutation was
performed. No third-party dependency was required by these inspected closures.

Complete lifecycle/auth refresh integration, background startup, panel UI, native
replacement and installed/native/model end-to-end validation remain incomplete.

Validation: eight package builds/type checks and all 895 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Website content bridge injection and refresh

Restored Cf/nk/Do/pm as createWebsiteBridge and websiteTabPatterns. Refresh queries the
original channel-specific URL patterns, ignores discarded/missing-ID tabs and rejects
inactive or disallowed main frames. Concurrent refreshes share one handshake promise
per document; each notifying caller still sends its own plugins-changed message.
Settled handshakes are removed so later refreshes verify the document again.

The handshake reuses the restored content-runtime timeout: ping version, inject the
website content bundle when needed, then ping again. Failed injection/handshake triggers
an asynchronous diagnostic only while the same document remains active. Per-tab errors
are allSettled while query failure propagates, retaining original boundary behavior.
Foundation exposes a factory bound to shared Chrome and timeout components.

Two source-differential tests cover channel patterns and eleven integration modes,
including held concurrent pings, repeated refresh, timeouts, injection/version failure,
navigation, inactive frames, query/frame/notification failure and development loopback.
Chrome and timer APIs are fixtures; no real installed page was injected. No third-party
library was required by this inspected closure.

Complete startup/lifecycle/auth-refresh wiring, panel UI, native replacement and
installed/native/model integration remain incomplete.

Validation: eight package builds/type checks and all 897 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Extension lifecycle registration and onboarding

Restored Hk/yk as registerExtensionLifecycle. It registers activation, installation,
startup and completed-navigation handlers in original order, then refreshes website
bridges without notifications. Installation opens the onboarding page except in Opera,
reports installation and conditionally refreshes toolbar/menu state. Startup and worker
activation refresh the installation service. Only production ChatGPT main-frame
navigation creates one auth reader shared by installation refresh and auth refresh.
Disposal removes the exact listener references before stopping the installation service.

Foundation binds its Chrome APIs, restored website bridge/timeout and SIWC cached-reader
factory. The installation service, auth refresh, browser-family classification, toolbar/
menu hooks and metrics remain explicit dependencies pending complete startup assembly.
These lifecycle listeners are installed only by the explicit registration method.

A source-differential test covers seven modes including disabled side panel, Opera and
onboarding/metric/website/auth failures; all install reasons, navigation filtering, invalid
URL behavior, ordering and cleanup. Chrome and service dependencies use fixtures; no
real onboarding page, auth refresh or telemetry was triggered. No library was added.

Complete installation/auth services, background startup, panel UI, native replacement
and installed/native/model end-to-end validation remain incomplete.

Validation: eight package builds/type checks and all 898 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Browser plugin request chain and account cache

Restored JC/YC/un/QC in plugin_installation.ts. Setup checks canonical plugin identity,
status and installation policy, POSTs ensure with the encoded plugin ID, and creates the
original noauth connector link only after a truthy enabled result. Original headers,
body and short-circuit/error behavior are retained. This function uses the restored
ChatApi request contract; no third-party implementation was duplicated.

Cache identity is the JSON pair of user/account IDs. Positive and negative entries remain
independent; negative results expire after thirty minutes. A single load promise is reused
even after read failure or clear. Writes/deletes update memory synchronously and suppress
async storage rejection. Pending load can overwrite intervening memory mutations exactly
as the original does; no extra synchronization or retry behavior was invented.

Foundation exposes the request function and bound cache factory. Three source-differential
tests cover eleven request-chain scenarios, ten cache persistence/failure/race modes and
structural validator boundaries. Network and storage are fixtures; no real account plugin
was installed, enabled or linked. Gate subscription and retry orchestration are unfinished.

Complete installation/auth services, background startup, panel UI, native replacement
and installed/native/model end-to-end validation remain incomplete.

Validation: eight package builds/type checks and all 901 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Browser plugin installation orchestration

Restored rk as createBrowserPluginInstallation. Refresh cancels prior auth waiters and
tracks account identity, active API, gate subscription and retry state. Account changes
cancel outstanding setup/gate work and clear appropriate caches. Gate readiness requires
the matching user; later enabling clears negative cache and either refreshes or schedules
against the existing cooldown. Stale and stopped callbacks are ignored.

The service directly composes restored ensureBrowserPlugin and cache implementations.
Success resets retry state, records the result and invokes the completion callback with
original exception suppression. Failure preserves the original HTTP allowlist, explicit
nonretryability, retry-after floor, one automatic retry, jitter and maximum timer bound.
Stop aborts auth/gate controllers, clears timers and disposes active API. Late request
completion is ignored for state updates but still disposes its API.

Foundation supplies the restored ChatApi, SIWC cached-reader factory, cache, clock and
timers. Auth refresh and gate transport remain explicit pending their full restoration.
A source-differential test composes original/restored caches and real request-chain logic
with API/transport fixtures across sixteen modes: auth outcomes, gate failure/change,
negative caching, HTTP/generic failures, retry-after, huge delay, pending account switch,
pending stop and synchronous/asynchronous completion-callback failures. No real account
installation, authentication or network operation was performed; no dependency was added.

Auth/gate service implementation, full background startup, panel UI, native replacement
and installed/native/model end-to-end validation remain incomplete.

Validation: eight package builds/type checks and all 902 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Feature service and verified Statsig fork boundary

Restored Un/Yt/Mr/Is/Qm/As/rl/nl/$n/Cs/eg/tg as createExtensionFeatureService. It preserves
stable-ID persistence, bounded auth identity lookup, synchronous/asynchronous identity
updates, initialization retry, latest-update waiting, gate/config evaluation and abortable
subscriptions. Metrics are serialized and confirm the exact event metadata reference in
logs_flushed, retrying flush once before failure. Exposure flushes are coalesced through
the same queue; buffering is limited to Ready state. Foundation binds Chrome, SIWC auth
reader, crypto and fetch; SDK key/API/channel/browser identity remain explicit.

Dependency audit found an important mismatch: bundled metadata declares Statsig 3.33.4,
but public @statsig/js-client 3.33.4 lacks refreshValuesAsync and enableLiveValuesAutoRefresh.
The bundled class also changes live-refresh/store behavior. Public package is installed
for shared types/LogLevel, not claimed as an equivalent runtime. The service requires an
extended Client constructor; Foundation exposes this requirement rather than silently
using updateUserAsync or omitting refresh. Restoring the SDK delta is still required.

Two tests compare eleven orchestration scenarios against original bindings and verify
the actual npm version/missing method. Differential cases cover identity changes, auth/
storage/init/update failures, flush confirmation, subscription abort and exposure queue.
Client is an explicit fixture: no real Statsig client was initialized or telemetry sent.

Bundled SDK delta, complete background startup, panel UI, native replacement and real
installed/native/model integration remain incomplete.

Validation: eight package builds/type checks and all 904 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Statsig live-overlay request/response delta

Inspected bundled Kc and restored fetchLiveEvaluations plus cursor parsing in
statsig_live_network.ts. Requests retain responseMode, user/hash/cursor/derived fields,
optional checksum, priority, two retries and skipInitTracking. HTTP 204 optionally
advances the cursor from x-statsig-live-overlay-lcut; HTTP 200 requires the original
response_mode JSON property and live_overlay value. Other responses return null and
transport rejection propagates. Finite nonnegative numeric header parsing retains the
original Number conversion, including fractional and hexadecimal values.

Directly reuse @statsig/client-core 3.33.4 _typedJsonParse. Further audit proves the
bundled NetworkCore differs too: public post lacks skipInitTracking handling and response
headers. The helper requires an explicit extended post contract and is not wired to public
post. NetworkCore changes, live-value store and client scheduling are still outstanding.

Two tests compare the extracted original network class against the helper across response
and checksum combinations, rejection and cursor boundaries. Only post is a fixture;
no HTTP request is sent. Tests intentionally exercise upstream parser diagnostics for
missing discriminator fields. Full extended SDK runtime is not yet available.

Full startup, panel UI, native replacement and installed/native/model integration remain
incomplete in addition to the explicitly identified SDK differences.

Validation: eight package builds/type checks and all 906 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Executable NetworkCore compatibility audit

Added an isolated extractor for the actual bundled Bc NetworkCore, reusing official
3.33.4 support modules, and tested it against the actual public NetworkCore class.
This is stronger evidence than method/type inspection: successful live responses retain
headers and do not mutate the last initialization URL; live request failure suppresses
fallback refresh, initialization error emission and error-boundary attachment. Public
3.33.4 does not suppress these effects. Ordinary bundled requests retain those effects.

Recorded exact upstream JS/type hashes, bundled source hash and reuse boundaries in
extension-statsig-network-audit.json. Source inspection also identifies skipped diagnostic
start/end markers and terminal logging order. These are obligations for the upcoming
production network delta, not an implemented replacement or a runtime compatibility claim.

Validation: two focused runtime comparison tests pass with response/fallback fixtures.
No network traffic. No production code changed this round, so the full 906-test suite
was not repeated; its most recent complete run remains the prior round. Default suite now
includes these two new tests, but a combined 908-test pass has not yet been claimed.

Production NetworkCore/store/client SDK deltas, full startup, panel UI, native replacement
and installed/native/model end-to-end validation remain incomplete.

### Production NetworkCore request delta

Added ExtensionStatsigNetworkCore as a subclass of pinned public 3.33.4. It restores
request dispatch and populated-URL behavior from bundled Bc: headers survive successful
responses; live requests skip initialization URL/diagnostic/error/fallback-refresh tracking;
ordinary requests retain those effects and terminal log ordering matches the bundle.
Timeout, retry/backoff, preserved HTTP status and no-response diagnostic behavior remain.

Upstream constructor, request-body serialization, encoding, compression, limiter and
fallback support are inherited. Unexported dispatch diagnostic helpers are readable TS
adaptations of the inspected upstream/bundled code. The adapter explicitly accesses pinned
runtime internals through a structural base type; upgrading the dependency requires
revalidating this boundary. No global SDK prototype or shared logger is patched in production.

Two differential/integration tests compare twenty ordinary/live response/failure modes,
including reject, timeout, retry, blocked traffic, invalid key, limiter and fallback, and
compose the live-overlay helper with the actual adapter to read a 204 cursor. Network
responses/fallback services are fixtures; no external HTTP requests. Previous compatibility
audit tests remain to guard the public-versus-bundled differences.

The extended store/client scheduling and feature-service default assembly are still
incomplete, alongside full startup, panel UI, native replacement and real end-to-end work.

Validation: eight package builds/type checks and all 910 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Statsig live evaluation store

Restored qm live-store behavior as ExtensionStatsigEvaluationStore, inheriting public
3.33.4 ordinary helpers and reusing V1/V2 containers. Added per-category live name sets,
DJB2 alias matching, retained values for dropped names and config-list union. A recognized
live name overrides base data even when no result exists; dropped values retain original
result/details until reintroduced or the live state resets. Returned retained warning
arrays are copied as in the source.

Initialization seeds a live cursor only for a matching full-user hash. Older live updates
are rejected only with an existing cursor; newer overlays survive older base updates.
V2/missing-live metadata reset the overlay; cursor advancement accepts finite monotonic
values. loadedAt is preserved in base/live details and reset explicitly. External values
remain detached from evaluation containers. CommonJS default constructor interop is
handled for both native Node ESM and bundlers.

Two source-differential tests extract actual bundled qm/Bm/jm and compare seven state
modes plus V2, malformed metadata and external mutation. They exercise gate/config/layer
lookup, retained missing values, config lists, hash aliases, warnings, user mismatch,
bootstrap, disabled mode, base/live ordering, cursors and reset. No network/SDK client is
initialized. No dependency was added; pinned SDK runtime internals remain an upgrade boundary.

Extended client refresh/timers, default feature-service assembly, full startup, panel UI,
native replacement and installed/native/model end-to-end validation remain incomplete.

The live request's sinceTime type now permits undefined, matching the store's empty
cursor result; runtime behavior is unchanged. Build/type checks were rerun after this
type-only adjustment. All eight package builds/type checks and all 912 default regressions
pass, zero failures/skips. The independent native-supervisor suite was not rerun.

### Statsig live refresh and interval lifecycle

Restored Vm live-refresh methods as createStatsigLiveRefresh. It captures user and base
value identities before fetching, discards responses if either changed or loading status
is no longer Ready, advances no-update cursors and publishes successful live-store changes.
Interval configuration accepts only finite positive seconds, otherwise uses ten minutes;
disabled clients do not start. A per-interval in-flight flag suppresses overlapping ticks.
A different Ready client of the same class stops the old interval outside server mode.

Stop clears only the interval: an already pending response can still apply, matching the
source. Timing errors are logged and the in-flight flag is cleared in finally. The helper
uses restored store/network contracts and official global/environment/logging primitives;
constructor-specific instanceof testing remains an explicit client assembly dependency.
The store cursor return type now states its optional properties without runtime changes.

Two tests extract the actual Vm class definition without invoking its constructor and
compare thirteen timer/response modes plus interval boundaries. They cover user/base-value
changes, disabled/loading states, server/replacement behavior, pending stop, rejected/null
responses, cursor updates, repeated starts/stops and overlap suppression. Timers/network
are fixtures; no live SDK client or external traffic was started.

Client constructor/init/update/diagnostics and default feature service are still unfinished,
alongside complete startup, panel UI, native replacement and real end-to-end validation.

Validation: all eight package builds/type checks and all 914 default regressions pass,
zero failures/skips. The independent native-supervisor suite was not rerun.

### Statsig network assembly

ExtensionStatsigNetwork now constructs a single extended NetworkCore with the original
initialize URL configuration and caller-owned options. Ordinary fetchEvaluations and
recursive delta handling reuse pinned public 3.33.4 prototype methods; live evaluations
use the restored helper and the same transport. No upstream prototype is changed and no
second network is constructed. Live calls read mutable option values at invocation time.
The CommonJS default export is unwrapped for Node ESM/bundler interoperability.

Two tests compare actual bundled Kc/Hm on eleven ordinary/delta/cache modes followed by
live requests, including successful delta merge/deletion and bad-checksum full-response
retry. An integration case invokes inherited post and the extended transport with a mock
fetch, confirming ordinary response and live header cursor parsing on one instance.
No external requests or complete SDK client initialization occurred.

Constructor/init/update/diagnostics and default feature-service client assembly remain
unfinished; full startup, panel UI, native replacement and real end-to-end work remain.

Validation: eight package builds/type checks and all 916 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Statsig synchronization diagnostics

Restored bundled vs differences through ExtensionStatsigDiagnostics. It reuses the pinned
public marker map, timestamp/duration calculation, error formatting and event construction,
adding initialize/update_user/refresh_values syncType to overall/process markers and the
enqueued event. Upstream methods are not patched. Sharing storage keeps markers generated
by reused SDK code in the same event. Markers are cleared before enqueue, including when
the logger throws; the event receives a copied marker array as upstream does.

Response diagnostics now include navigator.onLine only when it is boolean. The extended
NetworkCore uses this facade, while live requests still skip initialization tracking.
Two tests compare the actual bundled vs module across four sync types and four online
values, plus exercise actual network post with mocked fetch to verify combined markers
and live-request exclusion. No external network or real SDK client initialization occurred.

Full client constructor/init/update assembly remains unfinished. Complete extension startup,
panel UI, native replacement and installed/model end-to-end verification remain pending.

Validation: eight package builds/type checks and all 918 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Statsig client lifecycle methods

Restored Vm initializeSync/initializeAsync, async initialization, updateUserAsync and
refreshValuesAsync entry points and implementations as statsigClientLifecycle. Methods
retain dynamic dispatch through the host and share the restored diagnostics facade.
Initialization coalesces its pending promise and starts live scheduling only if that
promise remains current. Logger start/storage readiness keep original exception boundaries.

User updates reset the user, apply cached data and enter Loading; in-place refresh does
none of those. Both reject late results after user identity changes, retain receivedAt,
finalize results and return source/warnings/network/error details. Only failed user updates
emit initialization_failure; refresh failures attach the error without that event.
Wrapper exceptions normalize non-Error throws through the existing error-detail method.

Two tests compare actual Vm prototype methods across 21 operation/failure combinations,
plus promise coalescing/replacement/rejection and synchronous initialization order. They
use adapter/store/logger fixtures and actual bundled diagnostics; no constructor, external
network, full SDK or installed production extension was started.

Full client constructor assembly and default feature-service binding remain unfinished,
as do complete startup, panel UI, native replacement and real end-to-end verification.

Validation: eight package builds/type checks and all 920 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Statsig client construction and adapter assembly

ExtensionStatsigClient now constructs the extended network before StatsigClientBase so
adapter and logger share it from the beginning. It binds memoized evaluation methods,
restored live store, user normalization, context handle and live scheduler before plugins.
The pinned SDK ordinary prototype descriptors are reused without modifying the upstream
class; restored lifecycle methods replace the differing methods. Shutdown stops the live
timer before invoking base shutdown. Static instance lookup uses the restored class.

The public data adapter's instanceof Network check would silently create a second,
unextended network. ExtensionStatsigDataAdapter restores the bundled attachment class
identity while reusing DataAdapterCore.attach and other upstream adapter behavior.

Two tests construct both actual bundled Vm/qm/Kc/zm and the restored client, using pinned
core support and mock fetch. They verify plugin-time shared adapter/logger network,
initialize/update/refresh, unchanged user identity on refresh, Gate result changes,
configuration listing and shutdown. A separate timer fixture checks enabled live refresh
and shutdown cleanup; adapter fallback construction is also checked. No external service
was contacted. This advances beyond prototype-only fixtures, but does not prove every
SDK path or production installed-extension behavior.

Default feature-service binding is still explicit and pending. Complete extension startup,
panel UI, native replacement and actual browser/App/model end-to-end validation remain.

Validation: eight package builds/type checks and all 922 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Default feature-service client binding

createExtensionFeatureService now defaults to ExtensionStatsigClient. Client injection
remains optional; its contract describes public methods rather than nominal SDK private
fields. Foundation createFeatureService inherits the optional constructor through its
existing dependency type. This removes the required external extended-client placeholder.
The extension README's SDK section was consolidated to remove superseded pending claims.

A new integration test omits Client, captures the actual initialized default instance,
and verifies shared extended transport, stable identity persistence, gate/config access,
identity updates, subscription publication, buffered/explicit metric flushing and host
fetch options. The real SDK client executes against mocked network responses and is
shut down in cleanup. No external Statsig/identity endpoint is contacted.

Complete production startup, panel UI, native replacement and actual installed/browser/
App/model end-to-end validation remain unfinished.

Validation: eight package builds/type checks and all 923 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Background runtime message routing

Restored the dR runtime listener as createBackgroundMessageRouter, preserving instance,
settings, auth, popup, page-event, mentions/status, installer, load, open and cursor
precedence. Settings replies await all control refreshes and report whether all fulfilled.
Popup returns true for its async reply. Page events return false and asynchronously use
the active lease to replace session_id/tabId before broadcasting; absent leases/errors
produce no broadcast. Installer/open handlers reply immediately but return false.

Dp is restored as isBrowserPageEvent; it validates only object/version/string type and
preserves inherited fields/arrays accepted by source. Foundation binds runtime identity
and the restored lease manager; remaining handler/control/broadcast dependencies are
explicit until full startup assembly. This does not yet register the production listener.

Two differential tests extract the actual listener registration from dR without running
startup, covering twenty dispatch modes plus page-event guard boundaries. Existing
validators and concrete lease manager are reused in production code; test control/network
callbacks are fixtures. Full connection/event wiring and startup remain incomplete.

Validation: eight package builds/type checks and all 925 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Background runtime listener registration

registerBackgroundRuntime now performs the dR registration phase: start lease recovery,
report rejected recovery through the stage reporter then the exact original console message,
register runtime connections/messages, then reuse CDP/download/navigation listeners.
Connection handling calls tab mentions before native status and reads manifest version
for each connection. Synchronous mention failures prevent subsequent status registration.

registerBrowserEventListeners accepts the instance-ID initializer at the original position
between download-created and download-changed registration; its rejected promise is ignored
as in dR. Existing direct users can omit this hook. Foundation binds the actual lease
manager and instance-ID reader; transport/handler/router callbacks remain startup inputs.

A source-extracted registration test compares normal operation, lease/identity rejection,
mention exceptions, repeated version reads and broadcasts against dR. Existing CDP security
and listener differential tests also pass. The extraction helper now supports call-chain
paths so original catch handlers are tested, rather than dropping their behavior.

This registration phase is implemented but the complete dR entrypoint, kernel/native
session setup and remaining startup prerequisites are not yet assembled. Panel UI,
native replacement and installed/browser/App/model end-to-end verification remain pending.

Validation: eight package builds/type checks and all 926 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel scoped Port transport

Restored Gg/zg/Wg as the kernel Port transport, browser/control multiplexer and connection
registrar. Only matching browser-use-kernel names, own extension sender, non-tab exact
kernel-host path and matching scopeId are accepted; malformed eligible ports disconnect.
Foreign sender/prefix ports are ignored. Replacement closes the prior scoped transport,
and stale disconnections cannot remove a newer registration.

Control messages add type=control; all other incoming messages route to browser callbacks.
Closed sends throw. Close preserves sync listener throws, suppresses async rejections,
allows listener removal and forwards runtime.lastError. Handler-construction failure closes
the port before rethrowing. Foundation supplies the actual Chrome runtime.

Two differential tests execute original Gg/zg/Wg over twelve admission/session modes and
three close-listener modes. No production Chrome Port was connected. The actual kernel
host page, scoped execution/control implementation, gate subscription and complete dR
startup composition remain unfinished, alongside panel UI, native replacement and real
browser/App/model end-to-end verification.

Validation: eight package builds/type checks and all 928 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel execution scope and output

Restored Dr/Hg/Le as createKernelScopeRegistry. Each scope retains client, ChatApi,
caller signal, disposal signal, optional PDF cleanup callback and the shared content
array. Duplicate execution throws; lookup propagates the caller's exact abort reason.
Disposal aborts before deleting the matching scope, and repeated disposal of an old
execution cannot delete a replacement execution. Beginning with an already-aborted
caller signal remains allowed, while subsequent lookup throws, matching the source.

createKernelOutputWriter restores Ds displayValue/displayImage. Non-string values use
JSON.stringify with String fallback; serialization precedes scope lookup, including
serialization errors. Images append the original PNG output envelope without decoding.

Two source-differential tests cover lifecycle/reentrancy/reuse, reference identity,
cancellation and output serialization/error order. No kernel host or control RPC was
executed. Registry and writer still require assembly with the remaining Ds control
methods and kernel execution entrypoint; full startup and end-to-end work remain pending.

Validation: eight package builds/type checks and all 930 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel control fetch and cancellation

Restored Ds fetch/abortFetch/dispose through createKernelFetchController. Matching
site-status origin/path without URL credentials uses scoped ChatApi and combines request,
caller and disposal signals. Other URLs use the supplied ordinary fetch with the request
signal only, matching source. Bodies decode via standard atob; responses serialize bytes
using chunked btoa, preserving headers/status/statusText and null-body responses.

Per-request controllers are removed in finally. Dispose aborts tracked controllers then
clears them. The original duplicate-ID race is retained: an earlier completion can delete
a newer controller with the same ID; this is documented and tested rather than silently
changing original semantics. Scope lookup is only required for the authenticated route.

Two differential tests execute actual Ds/dm/pg/ol/wl over fourteen routing/error/cancel
modes, plus duplicate IDs and large byte subviews. Network/ChatApi are fixtures, no remote
requests. Remaining control methods, control RPC assembly and real kernel-host execution
are unfinished, alongside full startup, panel UI, native replacement and end-to-end work.

Validation: eight package builds/type checks and all 932 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel control elicitation

Restored Ds.createElicitation and Lt/yl/Sl envelope guards. Scope lookup precedes schema
validation. Missing/null schema uses the original empty object form; metadata is forwarded
only when non-null. The host client receives the exact caller signal and owns UI/decisions.
Responses reject non-null non-object content/meta, retain null fields, omit undefined
fields and preserve the source's action pass-through and lack of post-await abort check.

These are the source's restricted structural guards, not general JSON Schema validation:
integer enums use typeof number, missing required-property definitions remain accepted,
and object/array property recursion matches source. No third-party schema engine was
substituted because doing so would change the inspected acceptance behavior.

Two differential tests compare actual Ds/Lt/yl/Sl for schema boundaries and thirteen
request/response/error scenarios. No real user prompt, model or kernel was invoked.
Remaining control operations and complete RPC/kernel/startup integration remain pending.

Validation: eight package builds/type checks and all 934 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel cloud requirements and browser settings clients

Restored $g requirements caching through createCloudRequirementsClientClass. Personal
accounts return null requirements; enterprise requests coalesce, cache for one hour and
retain the last good result on later failures, with original caller-abort checks. The
requirements parser remains an explicit dependency pending identification/reuse of the
bundled TOML library; this does not claim complete requirements parsing.

CloudBrowserSettingsClient restores jg: non-forced reads share pending work or a fifteen-
minute cache; forced reads and PATCH requests serialize after pending requests, including
rejection recovery. Responses normalize missing webmcp to an empty object, clear cache
on failure and clear pending only when still current. PATCH forwards its supplied signal.

Two differential tests compare actual $g/jg over ten cache/failure/abort scenarios with
controlled time and fixture ChatApi. No server requests. Remaining control assembly,
requirements parser, kernel host, full startup and real end-to-end work remain incomplete.

Validation: eight package builds/type checks and all 936 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Requirements parser and TOML dependency

Identified the bundled parser as smol-toml by inspected implementation structure/options
and reused pinned 1.5.2 (BSD-3-Clause). Inspected 1.4.2 and 1.5.2 parser modules are byte-
identical; only serializer/bundle files differ, so the original exact version is not proven.
Upstream reference: https://github.com/squirrelchat/smol-toml . No custom TOML parser was
implemented. integersAsBigInt=true preserves source parsing semantics.

parseCloudRequirements restores Mg and normalization helpers: reverse enterprise layers,
validate each layer before recursive plain-object merge, then normalize browser/network/
feature rules and detect empty requirements. Conflicting feature aliases/domain policies
and invalid field types produce the original generic error. Request headers reuse the
already restored validator. CloudRequirementsClient now binds this parser by default.

Two differential tests execute actual bundled xg and Mg, covering 21 TOML cases plus
empty/malformed bundles, policy normalization, aliases, per-layer failures, precedence,
prototype-named keys and unknown fields. The focused corpus supports compatibility but
is not a proof of every TOML input. Full control/kernel/startup and actual end-to-end
verification remain unfinished.

Validation: eight package builds/type checks and all 938 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel control and RPC assembly

Restored Ds as createKernelControlClass and qg as KernelControlPeer. Control now composes
existing fetch/output/elicitation and cloud clients, with original feature fallbacks,
post-await caller cancellation, session storage validation and per-ChatApi client identity.
PDF capture retains required turn cleanup, combined cancellation and deletion on callback
or post-capture cancellation failure; actual capture/delete remain explicit host services,
not implemented substitutes. RPC registers prototype methods, forwards turnEnded requests
and aborts pending fetches on transport closure.

Two differential tests execute actual Ds/qg/fc: twelve policy/storage/PDF scenarios,
cloud cache identity replacement and refresh, inbound RPC, outbound completion and close.
Full kernel host/execution/background startup, actual PDF capture and end-to-end installation
remain unfinished. This assembles control behavior, not the complete production runtime.

Validation: eight package builds/type checks and all 940 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Tunnel polling lifecycle manager

Restored E_ as createTunnelPollingManager and Hn as readTunnelConfiguration. The manager
tracks current/applied generations, suspends during configuration reads, reinitializes an
unchanged poller and replaces/disposes it when configuration changes. It gates stale
unauthorized recovery, retains listening state across replacement, subscribes only to
session tunnel changes, and removes its subscription on stop. Account validation reuses
existing parseChatAccount; malformed stored values return null while storage failures
propagate, matching the original catch boundary.

Two differential tests execute actual E_/Hn/Qc for seven lifecycle/race scenarios and
stored-value boundaries. The actual p_ network poller remains an explicit factory dependency;
this is not a network tunnel implementation. Full S_ startup, kernel host and real model /
installed extension end-to-end validation remain unfinished.

Validation: eight package builds/type checks and all 942 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Background-to-offscreen kernel bridge

Restored Jg/Yg/El/Qg/Xg/Tl as createKernelHostRegistry and response/error helpers. Concurrent
offscreen initialization shares one promise, which clears on either outcome. Existing
contexts avoid creation; scope lookup checks cancellation before and after initialization.
Execution/reset use original runtime message shapes and response ID validation. Execution
cancellation sends a matching cancel message and awaits delivery (ignoring delivery rejection)
before settling. Reset-required / initialization-timeout responses evict only the current
scope instance, preserving replacement identity; reset removes the current instance even
on failure. Error/output normalization retains source behavior.

Two differential tests execute actual source functions/classes over twelve response/init/
reset scenarios and four cancellation scenarios, including deferred cancel delivery. Tests
use a runtime fixture; the offscreen page/worker implementation and real Chrome execution
are not yet integrated. Full tunnel poller, startup and end-to-end work remain unfinished.

Validation: eight package builds/type checks and all 944 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Offscreen iframe router

Restored the full offscreen chunk's x/h/u/k/w routing functions as registerKernelOffscreen,
plus scoped message guards and error serialization from its protocol chunk. Sender extension
ID/tab/URL admission precedes handling. Each scope owns a hidden kernel-host iframe; readiness
requires matching source and scope and has the original five-second timeout. MessageChannel
execution rejects malformed/unreadable replies and closes both ports. Cancel/reset coalesce
teardown, forward cleanup only after execution dispatch, dispose the frame and reject pending
execution. Busy-scope and stale-instance identity checks preserve original behavior.

A hash-pinned differential test executes actual offscreen/protocol functions across eleven
scenarios: admission, readiness, success, invalid/unreadable responses, reset-required,
initialization timeout, cancellation before/after dispatch, cleanup timeout/failure, idle
reset and concurrent execution rejection. The test uses controlled DOM/MessageChannel
fixtures; iframe-internal host code, actual Chrome page wiring and full startup remain
unfinished. Sentry initialization is still owned by the eventual page entrypoint.

Validation: eight package builds/type checks and all 945 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Iframe-internal kernel host

Restored GU/KU/WU/VU from the hash-pinned kernel-host chunk as registerKernelFrameHost,
executeKernelSandbox, createKernelAgentHandler and KernelAgentTransport. Reuses existing
kernel Port transport for the byte-equivalent zU behavior. Host validates parent/sandbox
message provenance and scope, relays readiness, connects the background browser channel,
replaces agent sessions, forwards execution metadata and collects output. Worker-reset
errors close sessions and request reset. Cancellation removes the sandbox and performs
shared browser cleanup, suppressing late execution responses. Agent display distinguishes
Uint8Array from ordinary values; MessageChannel ownership follows the original source.

A differential test executes actual GU/KU/WU/zU/VU over twelve scenarios including normal
execution, late agent connection, replacement, malformed/unreadable replies, postMessage
failure, worker reset, finish failure, cancellation and cleanup failure. The browser bridge,
agent RPC binding and shared browser cleanup remain explicit required host dependencies;
no stub is presented as their implementation. Real sandbox/worker integration, full startup
and actual browser/model end-to-end validation remain unfinished.

Validation: eight package builds/type checks and all 946 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel control client and default agent peer

Restored OU as KernelControlClient: methods are bound for detached use; fetch serializes
bodies with Response/base64, preserves inferred content headers, forwards abortFetch and
reconstructs responses (including Response.error for status zero). Caller abort reasons
win over remote results/errors; listeners are removed after completion. Restored HU as
KernelAgentPeer after inspecting the shared src chunk's Mt/Ql implementation against the
existing RPC peer. Iframe host now uses this peer by default, retaining optional injection
for source differential tests.

Two hash-pinned differential tests execute actual OU/HU/Mt and byte conversion helpers,
covering ten fetch scenarios, detached control methods and inbound agent RPC. Real browser
execution-context/bridge assembly, sandbox worker wiring, startup and complete end-to-end
verification remain pending; a functioning RPC component does not establish those layers.

Validation: eight package builds/type checks and all 948 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel execution runtime and page policy

Restored AU/IU/EU/Df/kU: persistent metadata object with per-execution output/policy cache,
feature-controlled security environment, structured-cloned response metadata, sequential
snapshot of post-code hooks, swallowed ordinary hook errors and terminal timeout failure.
Finish clears active execution, policy promise and enumerable metadata keys even on errors;
late-added hooks run in later executions. The original ChatGPT page guard covers protected
hosts/subdomains, trailing-dot normalization, blob origins, HTTPS/path allowlists and the
localized installed-page path rule. Platform is supplied by the host factory.

Two source differential tests cover seven runtime modes and twenty-eight URL/policy
combinations, including rejection caching, metadata clone isolation, hook timeout and
permanent poisoned-runtime behavior. This does not yet assemble qU/jU or the full browser
service factory; native/browser/real-model end-to-end work remains unfinished.

Validation: eight package builds/type checks and all 950 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel configuration adapters

Restored NU/FU/BU/Ps/UU/$U and bundled defaults/resource mapping. Session updates hold a
named Web Lock across read, synchronous updater and write, preserving own-key lookups and
snapshot semantics. Global writes force-read settings under the global lock, project the
preferences/rules view and submit only revision-aware differences. No-op updates skip PATCH;
rule removal emits null, denied duplicates override allowed, and source validation/errors
are retained. Unknown projection decisions remain denied as in the original.

Two hash-pinned differential tests cover preference/rule boundaries, patch ordering,
concurrent session updates, refresh flags, no-op writes and read/updater/write failures.
A test-fixture prototype identity mismatch was corrected by cloning observed snapshots;
production behavior required no change. Actual navigator.locks and cloud services remain
host integration work, along with complete browser bridge/startup/end-to-end validation.

Validation: eight package builds/type checks and all 952 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Kernel browser bridge assembly

Restored DU/qU/jU as KernelBrowserContext, createKernelBrowserRuntime and
createKernelBrowserBridge. Browser/control traffic shares the restored split transport;
control client, execution runtime and configuration adapters are now assembled. Context
reuses the existing BrowserApi corresponding to xU/id through a browser-safe @core/browser
subpath rather than duplicating it. It supplies original metadata/request-header providers,
connection caching, browser descriptions and turn cleanup. Display bytes use base64;
filesystem methods retain the original extension-only behavior. Service creation waits for
runtime initialization and finish waits for service readiness.

A hash-pinned differential test executes actual assembly plus original xU/Mt classes over
success, initialization failure and service failure, comparing multiplexed requests,
managed headers, session changes, config calls, output and disposal. The browser service
factory, command timing, telemetry and performance spans remain required host dependencies;
full production assembly and installed-browser/model verification remain unfinished.

Validation: eight package builds/type checks and all 953 default regressions pass,
zero failures/skips. Browser-platform esbuild bundling of the assembled bridge passes
(35.4 kB unminified output). Independent native-supervisor tests were not rerun.

### Extension-native instrumentation defaults

Inspected kernel-host TS/vg/Pw and restored their intentionally inactive instrumentation
as kernelErrorReporter, kernelCommandTiming and kernelPerformanceSpan. Callbacks still run
and propagate results/rejections; trackElicitation/currentPlaywrightOperation retain exact
input identity. These are source implementations, not substitutes for missing telemetry.
Browser runtime assembly now defaults to them, removing three required injection points
while preserving explicit overrides. They do not import Node AsyncLocalStorage. Entrypoint
Sentry initialization remains a separate responsibility.

A source differential test exercises these defaults through assembled runtime, including
callback failures and reference identity. Complete browser service factory, sandbox worker,
production startup and real end-to-end integration remain unfinished.

Validation: eight package builds/type checks and all 954 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun.

### Browser service packaging: telemetry dependency boundary

A browser-platform esbuild probe of command_runtime_assembly exposed 46 resolution errors.
The telemetry module imported errorReporterUserId from the Node Sentry factory, pulling
@sentry/node-core/light and its Node dependencies into an otherwise shared helper path.
Moved the unchanged identity projection into telemetry_identity; browser telemetry imports
it directly and the Node reporter re-exports it to preserve existing callers. No Node SDK
was replaced with a dummy implementation and Node error reporting remains intact.

The same probe now reports seven unresolved imports, all confined to three asset loaders:
Playwright upstream_source (node:module/path), QR packaged WASM resolution (node:module/url),
and AX WASM Node loading (node:fs/promises/wasi/zlib). Full browser service bundling still
fails and must not be represented as runnable. These loaders need source-faithful browser
asset paths before production assembly and actual end-to-end validation.

Validation: eight package builds/type checks and all 954 existing default regressions pass,
including telemetry and error-reporter coverage, zero failures/skips. No new behavior-mirror
tests were added for this dependency-only refactor. Full browser bundling remains failing
with the seven recorded asset-loader imports. Independent native-supervisor was not rerun.

### Build-time upstream Playwright asset

Moved upstream injected-script resolution from runtime Node require/path calls into
scripts/assemble-playwright-source.mjs, invoked before reconstruction compilation. It resolves
from the browser workspace (not the different root Playwright), enforces playwright-core
1.59.1, validates the asset and generates a TypeScript string with Apache-2.0 attribution
and SHA-256 provenance. Shared upstreamPlaywrightSource now returns that generated string;
its wrapper and upstream content are unchanged. Source imports remain extensionless.

The generated wrapped source is 300482 bytes; upstream source SHA-256 is
 ee122c6b89a54de5510a2399f525548b16418570a8959ae4068d7f311511707d.
Existing real-Chromium differential coverage for selectors, snapshots, form actions and
hit targets passes. Full command-runtime browser bundling now fails on five imports rather
than seven: QR packaged WASM locator and AX WASM Node loader. This does not yet establish
full browser-service runtime compatibility or end-to-end installation.

Validation: generated emitted asset is byte-for-byte equal to the previous runtime wrapper;
eight package builds/type checks and all 954 default regressions pass, zero failures/skips.
Independent native-supervisor tests were not rerun. Full browser bundling still fails on
the five recorded WASM-loader imports.

### Browser QR entrypoint and WASM lookup

Split common QR assembly into qr_shared, retaining the Node packaged resolver/export
surface in qr. Added qr_browser selected by browser mappings for both source and emitted
paths. It reuses zxing-wasm 3.1.2 and restores original extension gR's relative-then-root
WASM lookup through context.filesystem.readBytes. Decoder accepts this explicit loader;
Node fallback behavior remains unchanged. No Node resolver or filesystem polyfill enters
the browser QR bundle. Asset placement remains a packaging responsibility.

Source differential coverage checks lookup order and failure identity. A real Chromium
test bundles the browser entrypoint, supplies a controlled host reader, loads the upstream
WASM (SHA-256 0e8d688d71932ebb6b8b33f700d43d3cb997f59ed9cab3c05102d7f10288a392)
and decodes the synthetic QR twice with one initialization. This does not imply the current
kernel filesystem supports binary reads: its original rejection behavior is retained.
Full command-runtime browser bundling now has only three unresolved Node imports, all in
the AX WASM loader. Production installation/full browser service integration is pending.

Validation: eight package builds/type checks and all 956 default regressions pass,
zero failures/skips. Independent native-supervisor tests were not rerun. Full browser
bundling still fails on the three AX WASM Node-loader imports.

### Browser AX WASM deferred Node imports

Restored the original computed `node:${name}` import helper instead of literal
Node imports in the AX loader. Both the installed Node service and extension defer
these modules until a URL/path input is supplied. Browser byte inputs use the existing
minimal WASI implementation; URL inputs still reject in Chromium. No fetch/Brotli
polyfill or fake WASI was added. The shared loader retains its Node import.meta URL
default; extension-specific default URL selection remains a host assembly concern.

The complete command_runtime_assembly browser esbuild probe now succeeds (2.2 MB ESM),
previously blocked by three Node built-ins. This proves bundling only, not production
extension installation, resource provisioning or complete browser-service execution.

A new real-Chromium differential test imports the installed extension AX chunk
(SHA-256 3fdefb91c0f12bf86a26de735e6eda4651df4cbf28a515d2174f7f336aa09265),
replacing only Vite's preload helper. It compares real installed WASM revisions,
Unicode output, identity/settable lookups and URL rejection with the restored module.
The WASM binary remains an installed external resource. Existing Node compressed-file
loading and byte-path tests also pass. Full validation results recorded below.

Validation: eight package builds/type checks and all 957 default regressions pass,
zero failures/skips. The initial new browser test serialized the multi-megabyte WASM
as a JS number array and stalled; serving binary bytes through an isolated local route
removed that harness overhead. An invalid empty-node snapshot was replaced by the
existing original dialog fixture. Independent native-supervisor tests were not rerun.

### Live host discovery diagnostic (not a model task)

Added reconstruction/live-browser-probe.ts, an independently authored read-only
host diagnostic using the actual installed native supervisor, restored workers,
staged packages and default browser discovery. No fixture backend is supplied.
On this Mac the native MCP call succeeded but returned zero available browsers
and zero apps (computer surfaces are disabled in this probe). Existing socket files
alone do not prove that a usable, permitted browser backend is connected. This is
not proof that no backend exists; discovery can exclude or fail candidate backends.

A bounded credential-location check found no DeepSeek environment variable or
matching entry in common shell/config locations. No key values were printed.
Live DeepSeek remains unverified. Further browser service/extension assembly and
backend discovery diagnosis remain required; the complete goal is unfinished.

### Live discovery failure isolation

The read-only probe now has opt-in `--diagnostics`, `--original-service`, and
`--original-workers` controls. Diagnostics assembles the same restored service in
its temporary staged package with error/discovery callbacks; it does not alter
pipe transport, handshake, access checks, or session filtering. The diagnostic RPC
exists only in that temporary service. It must reside under the staged desktop
package so its nested @core/browser dependency resolves correctly.

Actual host results on 2026-11-05: 24 candidates, 20 connection-refused errors,
four backend-info requests whose pipe closed before a response. No backend reached
successful discovery. lsof identified the four live sockets as owned by ChatGPT.
The installed original browser service with restored workers also returned zero;
the installed original service with original native workers likewise returned zero.
These comparisons narrow the issue to the standalone launch/host connection path;
they do not establish the precise reason the host closes the pipes or prove every
reconstructed component correct. No session IDs or permission checks were forged,
and no stale socket files were removed.

Commands (after reconstruction build):
- npx tsx reconstruction/live-browser-probe.ts --diagnostics
- npx tsx reconstruction/live-browser-probe.ts --original-service
- npx tsx reconstruction/live-browser-probe.ts --original-service --original-workers

All three probes completed successfully with empty discovery. Original-service and
original-workers are explicit diagnostic comparisons, not a fallback implementation.
No production reconstructed runtime changed; the full regression suite was not rerun.

### Extension browser service factory and live DeepSeek tool call

Extracted the extension's own static `us` documentation bundle with a hash-pinned,
AST-only extractor: 31 default documents, no environment bundles. Added a browser-safe
@core/browser/kernelBrowserService export and an extension service factory using
that documentation and the restored command runtime. Each factory retains shared
hook/recorder and disposal state. It is available for bridge assembly; production
bridge defaults and the full sandbox/background startup remain unconnected.

A real Chromium test bundles the actual factory and executes initialization,
list_browsers, repeated initialization and disposal against a controlled host.
It verifies zero filesystem documentation reads, both shared hooks, cleanup and
API manifest. It does not exercise the full original gU command matrix, real backend
or AX default asset URL, so full extension fidelity and installation remain pending.
Eight package builds/type checks and all 958 default tests pass, zero failures/skips.

User-supplied DeepSeek credentials were used without persisting the key. The official
endpoint returned HTTP 200 (deepseek-flash), followed by the existing demo:restored
AgentLoop requesting js over real native MCP/restored workers and returning 42.
This is the first verified live model/tool round trip, not a browser/App task. The
separate live backend probe still finds zero usable browsers. No credentials are
included in this repository, documentation or MCP server configuration.

### Default kernel service wiring

Kernel browser bridge now defaults to the real extension command-service factory;
explicit createBrowserService overrides remain supported. The factory is shared per
kernel-host module, matching the original service/cleanup lifetime. Added
registerAssembledKernelFrameHost to connect the restored frame host, browser bridge
and shared browser cleanup while keeping platform, locks and Chrome/DOM APIs explicit.
No fake browser service is required by this assembled entry.

A real Chromium integration bundles the default bridge and service and uses a real
MessageChannel with a controlled backend responder. It verifies control initialization,
BrowserApi getInfo, real service list_browsers, cached browser connection across turns,
display forwarding, finish/begin execution and cleanup. The responder is still a test
backend; this does not prove the actual Chrome extension background or sandbox worker
startup. Production manifest/assets, the sandbox and remaining background assembly
remain required. Validation results are recorded below.

Validation: eight package builds/type checks and all 959 default regressions pass,
zero failures/skips. Existing source-differential bridge/frame-host tests still pass
with explicit overrides, and the new browser test exercises the real default service.
Independent native-supervisor tests and live DeepSeek were not rerun this change.

### Interactive DeepSeek entry and visible tool trace

Added npm run demo:deepseek (scripts/run-deepseek.sh): prompt entry, hidden terminal
key input when absent, macOS native path defaults, reconstruction build and existing
AgentLoop launch. --browser opts into browser surfaces, which still require a usable
backend. Explicit server environment and path overrides remain intact. No key saved.
The CLI now prints timestamped tool requests/arguments and results/status; returned
images are saved privately under a temporary directory with paths printed. Long text
is truncated unless CUA_DEMO_VERBOSE=1. Known environment credentials and terminal
control sequences are removed from tool text logs. This is caller presentation code.

The exact npm entry was exercised with live DeepSeek/native MCP/restored workers:
js request code nodeRepl.write(6 * 7), tool result 42, and the final Chinese answer.
Agent-loop type checking and four focused provider/trace tests pass. Shell syntax and
both modes with/without explicit CUA_MCP_ENV were checked; a shell default-expression
brace issue found by that check was corrected. No full-suite rerun for this demo-only
change. Browser/App actions and visible machine control remain unverified.

### Sandbox worker manager and parent message entry

Restored original sandbox m/f/_/d as KernelSandbox/registerKernelSandbox, preserving
lazy worker creation, agent MessagePort transfer, request numbering, pending requests,
serialized execution errors, fatal reset identity, synchronous startup exceptions and
parent-source filtering. Worker creation stays an explicit dependency; the actual
worker evaluator/runtime and packaged entry are not yet connected. Cancel/reset are
handled by outer layers, matching the source; this sandbox accepts execute only.

Three hash-pinned original-source differential tests cover successful and failed
concurrent executions, worker error/messageerror, execution send failure, constructor
and initial port-send failure, unknown/invalid replies, reset reuse, message guards,
ready/agent-port forwarding and response-port closure. No worker startup or real page
operation claim follows from these manager-level tests.

Validation: eight package builds/type checks and all 963 default regressions pass,
zero failures/skips (including the terminal trace test from the preceding demo entry).
No live model call or native-supervisor probe was repeated for this manager change.

### Actual extension worker evaluator and agent runtime

Restored the embedded worker pp/up flow as registerKernelWorker and
KernelWorkerAgentClient, reusing the restored agent MessagePort transport and RPC
peer. Added @core/browser/kernelBrowserRuntime for the original direct dp assembly
(BrowserRuntimeFactory + display side effect), without Node RPC setup or credential
recovery wrappers. A standalone worker entry registers the real implementation.
The evaluator preserves successful async-function lexical scopes, does not commit
new scopes on failure, and serializes submitted scripts through the original queue.

A real Chromium Worker differential test extracts the original static worker string
from the hash-pinned installed sandbox chunk and compares it with the bundled restored
worker. Concurrent submissions cover persistent variables, mutation before a failed
script, failed-scope rollback, typed errors, display bytes, setup RPC, browser API
list calls and reuse in later scripts. The host is a controlled MessageChannel RPC
responder, not a real browser backend. Blob/data worker packaging and full sandbox
startup are still pending. Validation results follow.

Validation: eight package builds/type checks and all 964 default regressions pass,
zero failures/skips. The new differential test runs both original and restored code
in actual Chromium Workers, with no replacement evaluator. Live DeepSeek and the
independent native-supervisor suite were not repeated for this worker change.

### Worker packaging and actual sandbox startup

Added assemble-kernel-worker.mjs to generate the worker string from reconstructed
TypeScript with browser esbuild, before tsc. Explicit source aliases avoid stale
workspace dist during generation. The generated kernel_worker_source.ts is a build
asset, not copied vendor runtime. Added original h/o worker creation behavior:
Blob with self URL revocation prefix, error listener cleanup, and data-URL fallback
when creation fails. kernel_sandbox_entry now connects the real manager and worker.

Source differential tests cover Blob absence, URL creation/Worker/listener failure,
webkit URL fallback and cleanup. A real Chromium iframe test runs original and
restored complete sandbox scripts, each spawning its actual Worker. The controlled
parent responds to agent RPC. Browser API setup/list, retained variables, typed
execution failure and recovery match. This validates sandbox startup but not the
full Chrome extension background, manifest permissions or live browser backend.

Validation: eight package builds/type checks and all 966 default regressions pass,
zero failures/skips. Generated worker asset is 345707 bytes of TypeScript string
representation. Live DeepSeek and native-supervisor probes were not repeated.

### Built kernel pages and nested-frame execution chain

Added the functional kernel frame-host entry with original navigator.platform
projection and navigator.locks. build-reconstructed-kernel emits host/sandbox HTML
and browser ESM bundles under packages/browser-extension/dist/kernel. This directory
is a kernel asset set, not a complete installable extension; background/manifest and
entry telemetry assembly remain separate work.

A real Chromium test serves the built pages and runs parent -> host iframe -> sandbox
iframe -> actual restored worker -> agent RPC -> default restored browser service.
Only the Chrome background runtime port is a controlled responder. It verifies
browser inventory output, persistent script variables across turns, typed script
failure without forced reset, recovery, one cached getInfo, reset removing the sandbox
and disconnecting the background port. No actual browser tab operation or installed
extension permissions are implied. Validation results follow.

Validation: all 967 reconstruction tests passed; package build and type checks passed. These nested-frame checks use a controlled background connection and are not live Chrome operation acceptance.

### DeepSeek entry: local dotenv and browser defaults

The root demo entry now loads `.env` with Node's dotenv parser, preserves existing environment variables, and starts browser tools by default. `--js` retains the JavaScript-only smoke test. Local credentials stay in an ignored mode-0600 file; only `.env.example` is published. Launcher checks cover environment precedence, literal (non-shell) parsing, mode defaults and prompt forwarding.

Both user prompts (open local Chrome/search DeepSeek and visit Baidu/search DeepSeek) were run through the real provider/MCP entry without entering a key. Both exited normally and emitted actual tool traces, but `cua.getState()` reported an empty browser inventory. Neither search completed. This is a remaining host discovery/integration issue, not proof of working browser automation.

### Background kernel activation and turn-end routing

Restored the kernel-gate section of original extension `dR` as `kernel_background.ts`: single activation with subscription abort, connection peer registration/removal, turn-end delivery, fallback cleanup for a missing/rejecting control peer, and separate gate/registration error reporting. Dependencies are explicit; full background startup composition is still pending.

A hash-pinned original-source differential test extracts only the inspected local declarations and gate subscription. It compares normal activation, repeated gate changes, control rejection, fallback rejection, gate failure and registration failure. All 968 reconstruction tests passed in a serial build/test run, plus type checking. An earlier run overlapped demo rebuilds and failed due to temporarily absent dist imports; the isolated rerun passed.

Live verification of both original user prompts still failed: browser inventory empty; Chrome creation returned `Browser is not available: chrome`. The installed native messaging registration and executable exist, but no extension host process was observed; live browser-use sockets were owned by ChatGPT. This narrows investigation but does not establish why the extension host is absent. Browser operation remains unaccepted.

### Background kernel peer composition

`registerAssembledBackgroundKernel` now wires the restored gate registration to `registerKernelConnections`, `ExtensionBrowserPeer`, the scope-specific `KernelControl`, and `KernelControlPeer`. It shares the caller's browser handler with native-peer composition and returns the peer registry needed for broadcasts/settings refresh. `createExtensionBrowserFoundation` exposes this assembly using its actual Chrome runtime. Scope/configuration/gate/turn-end services remain explicit dependencies; full `dR` startup is not yet assembled.

The integration test exercises actual peer classes and transport splitting over a controlled Chrome port, including browser getInfo, control output, turn-end request/response, fetch cancellation on disconnect and missing-peer fallback. Twelve focused kernel/background/foundation/session tests passed, together with all-package builds and type checks. This is not a live tab-operation test.

Live-host follow-up: explicitly opening Default-profile Chrome started the installed native messaging host and created its socket. Both restored discovery and an original installed worker/service comparison still returned zero browsers; the new socket also closed during getInfo. Signing checks exist in the native binary and signature-verification activity appears in system logs, but no explicit rejection reason has been established. No trust validation was disabled. The earlier statement that no host process existed describes the pre-launch state only.

### Offscreen entry and complete kernel page asset set

The kernel asset build now includes `js-kernel-offscreen.html` and its browser bundle, initialized with the restored `registerKernelOffscreen`. This supplies the exact page path requested by `createKernelHostRegistry`, in addition to the already built host and sandbox pages. Missing offscreen output was a concrete packaging gap; this change does not establish it as the cause of the installed host discovery failure.

The real Chromium page integration test now also starts at the offscreen entry, dispatches background messages through its registered listener, then executes through the host iframe, sandbox iframe, actual Worker and browser service. It checks retained variables, failure recovery and removal of the host iframe on reset. Five offscreen/host/page tests passed; all-package build and extension type checking passed. The Chrome background port remains controlled, so this is not live Chrome search acceptance.

A new read-only `live-browser-probe.ts --original-workers --registered-service` comparison uses the installed Chrome plugin's browser-service. The native-host manifest points to the same ChatGPT.app Node/node_repl paths used by the demo. This registered-service comparison also returned zero browsers; a simple supervisor-path mismatch has not been demonstrated.

### Actual unpacked-extension kernel execution

Added an isolated Chromium persistent-profile integration test that loads the built kernel pages as an unpacked Manifest V3 extension with the installed extension's sandbox declaration and CSP. A temporary background bundle uses restored KernelHostRegistry and assembled background peers, real Chrome offscreen APIs and runtime ports, the host/sandbox frames, and the actual Worker/browser service. The test verifies retained variables, typed script failure/recovery, turn cleanup, an opaque worker origin (`null`) and absence of Chrome extension APIs inside the worker.

The only browser getInfo handler and cloud/configuration services remain explicit fixture boundaries. No existing Chrome profile, installed extension registration, or native host is replaced. This proves extension-origin startup/isolation rather than live page operation. Four related integration tests passed (actual extension, direct/nested page paths, peer composition). Product source was unchanged in this validation step. Actual search and native App acceptance remain incomplete.

### Browser command query and cursor dependencies

Restored original wE/CE/kE user-tab enumeration/group enrichment, yE and its query/date/limit/history merge helpers, and Xr/RE/OE argument/cursor checks in `browser_queries.ts`. Tab enumeration reuses the existing restored Ju/fi implementations. The foundation now supplies these five dependencies to the real command-handler factory instead of requiring caller fixtures. History lookup preserves concurrent per-query Chrome API calls, newest-first stable ordering, URL deduplication, and validation/error propagation order. Cursor availability retains the original active-tab/normal-window/non-minimized rules without adding a focus check or tightening integer validation.

Source-pinned differential cases cover malformed arguments, duplicate URLs/tabs, invalid/out-of-range dates, failed queries/group reads, missing titles, minimized/inactive tabs and browser API failures. No real user history was read. All-package build/type checks and 24 targeted query/mention/session/handler tests passed. Remaining production command dispatch/capability/context dependencies and full background/native-host integration still prevent declaring live browser search complete.

### Shared browser platform metadata and extension rules

The extension foundation now supplies original Jt/Rr/Ue browser identification, build-channel parsing and metadata plus Cn/dc internal/new-tab URL rules to handler/session construction. It imports the existing browser-family catalog through `@core/browser/browserFamily` instead of duplicating platform/distribution metadata. The catalog was compared in full with the pinned extension Ue binding. The frame-monitor path retains original UA-only detection (no Brave presence flag), while the command handler retains navigator Brave detection.

Differential tests cover rightmost user-agent token precedence, Brave override, exact case/slash-sensitive internal/new-tab URL rules, invalid inputs and unsupported channel strings. Builds and all-package type checks passed, with 18 platform/session/handler tests and 3 existing browser catalog integration tests. Production command dispatch, context extraction and full startup/native integration remain unfinished; no live browser-search acceptance is implied.

### Isolated page capture and tab context

Restored original al/dg as readable `tab_capture.ts`: self-contained DOM traversal for Chrome function injection, block/whitespace serialization, form controls, numeric-value suppression and password-value exclusion, active input selection/cursor markers, links/images/tables/editable content, shadow roots, node/depth/text/title budgets and surrogate-tail handling. The bounded context wrapper selects ISOLATED world and validates all returned fields. Foundation now supplies this implementation to the existing command handler instead of a caller-provided capture fixture.

A real Chromium differential suite compares the complete original function against the compiled readable implementation across focus/selection modes, controls, light/shadow DOM, budgets, URL changes and malformed wrapper results. The compiled injected function has no tsx naming-helper dependency; a helper is present only in the test harness. All-package builds/type checks and 18 capture/session/handler tests passed. executeTabRead's selection, Workspace export and YouTube transcript dispatcher still requires restoration/assembly; full browser search remains unaccepted.

### Complete tab-read branch dispatcher

Restored original my/hg/fg/sg/ag/og into `tab_read.ts` and connected it to the extension foundation. All four source branches are present: page capture, selection, Google Workspace export and YouTube transcript. Shared URL parsers and the existing transcript implementation are imported through `@core/browser/tabReading`; the transcript formatter and serialized page capture were additionally compared against the extension's original bindings. The reader preserves HTTP(S)-only admission, pre/post URL and incognito checks, ISOLATED versus MAIN execution worlds, and absent-result normalization.

The self-contained Workspace exporter retains origin/redirect checks, HTTP errors, declared and streamed byte limits, stream cancellation, blob fallback, base64 chunking and complete UTF-8 prefix truncation. Source-pinned differential tests cover dispatcher arguments, URL/read-kind validation, navigation changes, selection, malformed results and export failure modes. All-package builds/type checks and 26 related read/capture/transcript/session/handler tests passed. No real user document/history was read. Complete command/capability assembly, full background startup and independent native host remain pending; actual search acceptance is still incomplete.

### Shared command protocol and extension capability assembly

The extension foundation now supplies command sets/names, input/output schemas, original capability info and Np/bc dispatch. Management and viewport protocol definitions are imported through `@core/browser/extensionProtocol`, reusing the existing Zod-backed schemas and commands. The extension-only SIWC info is preserved from its original binding; viewport/management/page-assets/WebMCP info are shared and compared byte-for-byte with extension source constants. Dispatch preserves own-property command membership and the original handler lookup behavior.

Source-pinned checks compare schema results/issues, capability data, command order, unsupported/inherited command cases and sync/async failures. Full-package builds/type checks and 23 protocol/capability/session/handler tests passed. Handler construction through foundation now only needs navigator plus the remaining session-host dependencies, rather than protocol/read/query fixtures. Actual browser management execution, full background startup and independent host integration are still pending; this does not establish successful live searching.

### Live demo browser preflight (2026-11-05)

Re-ran both requested Chrome/Baidu DeepSeek prompts against the installed host: neither reached a real page or returned a search result. Discovery found 27 candidate pipes but zero usable browser backends; errors included connection refusal and closure during backend-info-request. The closing cause remains unproven. Model-generated installation advice and invented cua.listApps calls are not diagnostic evidence.

The browser-mode demo now runs logged getState/inventory checks before model decisions, fails with a nonzero exit when no backend is connected, and passes successful observation/API documentation into AgentLoop through agent-neutral initialMessages. Generic JS mode is unchanged. Turn cleanup still runs on preflight failure. This is demo orchestration policy, not a change to reconstructed CUA semantics. Seven targeted preflight/lifecycle tests and agent-loop type checking passed; live Baidu invocation verified empty inventory and exit 1. Browser connectivity and actual search acceptance remain unresolved.

### Installed native-host process identity constraint (2026-11-05)

Static inspection of the running Chrome native-host binary (SHA-256 `bd707631640d6b818c2dd61466b83ed9c49612b1c9f176fe57fa26a0097db1ab`) found a concrete constraint missing from the earlier integration assumptions. Its `PeerAuthorizer::authorize_unix_stream` obtains the socket peer audit token, resolves signed code identity at depth 0, and, except for an explicit OpenAI direct-client subset, also resolves depth 1 (`peer parent`). Both identities must match its compiled allowlist. `node_repl` is allowlisted under team `2DC432GLL2`, but has the direct-client flag false. Merely launching that signed executable from arbitrary Node does not satisfy the policy.

Evidence: read-only LLDB disassembly at `0x100029ea8..0x10002a27c`, identity resolver at `0x10002a27c..0x10002a4ac`, and 15-entry / 40-byte allowlist at `0x1000b0e10`. The depth resolver calls `extension_host_copy_code_identity_for_audit_token_at_depth`. `npm exec -- node -p process.execPath` resolves this project's launcher to `/opt/homebrew/Cellar/node/23.11.0/bin/node`; codesign reports its ad-hoc identifier and no TeamIdentifier. `native-supervisor.ts` spawns the installed node_repl directly from that Node process. This parent is absent from the compiled allowlist. The installed node_repl itself has identifier `node_repl` and team `2DC432GLL2`.

This establishes an incompatibility between the independent demo launch chain and this host's static authorization policy; it is stronger evidence than the previous binary string search. It is not a captured runtime rejection reason for every candidate pipe, nor proof that all other protocol stages work. No process was attached, patched, re-signed or impersonated; no checks were disabled. Installed host stderr is `/dev/null`, so no explicit rejection log was obtained.

Implementation consequence: an independent multi-agent CUA product needs its own native host and matching extension transport/registration with an explicit local authentication model. It cannot claim independence while depending on access to this OpenAI host from arbitrary Node parents. Keep the original trust policy intact in the fidelity reference; author a clearly identified `@core` host integration instead of spoofing the original identity. Browser management/session completion and full background startup remain necessary before switching the demo to that independent stack. The existing demo preflight correctly reports unavailable backends but is not a connectivity fix.

### Independent @core native host transport

Added `@core/native-host` as a separate TypeScript workspace. Its Chrome native-messaging stdin/stdout router reuses the reconstructed frame codec through `@core/browser/nativePipe` and transports the existing BrowserRpcPeer JSON-RPC messages. Real Unix-socket clients authenticate with a random local capability stored in a private endpoint descriptor; files/socket are 0600 and directory 0700. Each client request receives a unique upstream id, restored on reply. Disconnect removes pending mappings, requests time out, and host shutdown rejects in-flight calls and removes endpoint state. This is explicitly authored independent-host integration, not a claimed translation of the Rust binary or a bypass of its signing policy.

Native-host type checking and 10 focused host/preflight/lifecycle tests passed. Actual socket tests connect two independent clients to restored ExtensionBrowserPeer with controlled handlers, checking colliding ids, out-of-order responses, fragmented frames, notifications, invalid credentials, error replies, timeout/late-response handling and shutdown. No live Chrome acceptance is implied. Production native-messaging registration/origin binding, built entry artifact, complete extension background and browser-service/demo connector integration remain unfinished. Codex-specific host service methods intentionally return method-not-implemented and are not advertised as restored.

### Native-host deployment artifact and registration API

Added an esbuild standalone ESM host artifact to build:reconstruction, a private per-install config/launcher/manifest generator, macOS Chrome registration API and strict extension-origin admission at process entry. Registration uses the separate name com.core.cua and exclusive file creation, preserving existing manifests. Generated shell launchers correctly quote spaces and apostrophes, use absolute Node/entry/config paths, and reserve stdout for native-messaging frames. Origin-argument validation supplements Chrome allowed_origins; it does not claim signed-process attestation. Independent-host local authentication retains the local-user/capability trust boundary.

All reconstruction builds and type checks (including native-host) passed. Five native-host tests passed, including spawning the built executable as a separate process, temporary-home registration, duplicate-registration rejection, bad-origin exit with no stdout, framed getInfo exchange, EOF exit 0, and private endpoint removal. The extension side of this process test remains a controlled frame responder. Nothing was installed into the user's actual Chrome profile; complete extension startup/stable ID and browser-service/demo integration remain required before real browser acceptance.

### Independent host connector into the restored browser service

Added createBrowserServiceConnector to @core/native-host. It validates explicitly supplied endpoint descriptor ownership, private file/directory/socket modes, bounded descriptor size and colocated socket path; credentials are captured in the connection closure. It supplies the existing getNativePipeBridge injection point and BROWSER_USE_BACKEND_PATHS without changing reconstructed browser logic. Unregistered paths fail closed; existing access checks/broker configuration are not disabled. Client authentication was factored into a paused-socket operation so the restored BrowserPipe can install its own framing/listeners before queued events resume.

Six host/registration/connector tests passed, including real authenticated Unix sockets through assembleBrowserService setup, browser discovery and turn cleanup using controlled extension handlers. Descriptor secrets are absent from returned serializable connector options, permissive descriptors and out-of-scope sockets are rejected. Initial test harness omissions (setup and the turn hook object's run method) were corrected. Native-host type check passed. DeepSeek runtime staging/connector selection, complete extension background and real Chrome search remain unfinished.

### Restored browser management execution and audit queue

Restored KS/DS/NS with their validation/snapshot helpers in readable browser_management.ts and supplied one shared instance through the extension foundation. The implementation preserves command allowlisting, own-property Chrome method lookup, bookmark URL restrictions, explicit IDs, shared-group and cross-window restrictions, pinned-tab/window constraints, and normal non-incognito window creation. Audit operations serialize through one queue, retain the last 50 changes within 72 hours, capture before-state, and preserve original best-effort behavior when snapshot/storage fails. URL capture is limited to removed tabs in layout snapshots, as in the source.

Source-pinned differential tests compare returned values, errors and Chrome/storage call traces across 27 command cases, four storage/snapshot/action failure modes and 55 sequential mutations exercising retention. The extraction harness now supports explicitly mutable bindings so the original ed queue is not incorrectly declared const. Seventeen management/session/handler tests passed; all-package build/type checks passed, and the final single-read Reflect.get correction passed extension type checking and the same 17 tests. This completes session's management/audit production dependency, not full background startup or live Chrome search.

### Native-host reverse heartbeat routing

While inspecting full extension startup, found original dR/Gk sends ExtensionBrowserPeer.ping to the browser client and clears active sessions/debugger/network policy when no client answers. The independent host previously rejected all extension-origin requests, so it could not support that lifecycle even after a successful getInfo. Added explicit reverse ping routing to authenticated clients with unique ids, response ownership, first successful reply selection, bounded timeout, disconnect cleanup and duplicate/late reply suppression. The host does not manufacture pong from socket presence. Unsupported Codex-specific native-host methods remain unsupported.

The real-socket service connector test now receives pong from the restored BrowserClientApi through the complete extension-peer/host/service path. Seven host/installation/connector tests passed, including negative heartbeat cases (no clients, failed reply followed by a live reply, duplicate response, silent client timeout and disconnect). Native-host build and type checking passed. Complete background startup, real extension installation and DeepSeek browser acceptance remain outstanding.

### Native browser controller composition on actual extension APIs

Added createNativeBrowserController, composing the real extension foundation, original-derived session/command handler, NativeTransport and ExtensionBrowserPeer with one shared state graph. The native host name is explicit (independent deployment uses com.core.cua), and session diagnostics remain real caller-provided callbacks. This is the native control portion of dR, not a claim that full lifecycle/UI/kernel registration is assembled.

An isolated unpacked MV3 extension in real Chromium now bundles and initializes this controller against actual Chrome APIs (no replacement Chrome object or business handler), reads browser getInfo and getUserTabs, and verifies the generated extension identity. The native host is not registered in that test, so the result proves controller initialization and direct Chrome API reads, not end-to-end native transport or searching. All-package build/type checks and 12 controller/management/session tests passed. Remaining work includes complete startup registration, content/UI assets, native-host registration with a stable extension ID, DeepSeek connector staging and both real search acceptance prompts.

### Real Chrome native-messaging round trip and page capture

Extended the native controller test to register com.core.cua only in an isolated Chromium user-data directory, using the actual loaded extension ID. Chrome now launches the built host itself through connectNative; the test discovers its private endpoint, authenticates over the real Unix socket and calls the reconstructed handler through native messaging. getInfo/getUserTabs return real browser data; getTabContext captures the title, URL and text marker from a local HTTP page using the restored Chrome.scripting implementation; turnEnded completes afterward. The page is prepared by the test harness, not navigated by DeepSeek. No user's normal Chrome registration/profile is changed.

Added registerNativeHostForProfile for this deployment path. Chromium's official chrome_paths.cc defines DIR_USER_NATIVE_MESSAGING as DIR_USER_DATA/NativeMessagingHosts: https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/common/chrome_paths.cc . This was checked before selecting the isolated registration location.

The first actual round trip exposed a native-host compatibility defect: restored BrowserRpcPeer void responses serialize without a result field, but the independent router rejected them. Correlated id-only responses now resolve undefined, matching the restored peer; a dedicated socket regression covers this. Eight native/controller/connector/installation tests passed, plus the focused void regression and native-host type check. This establishes real extension/host/page-read integration, not full startup, model-driven navigation/click/screenshot, or either user search acceptance prompt.

### Independent host selected by the DeepSeek demo deployment

Added explicit CORE_CUA_ENDPOINT_FILES (JSON array of private endpoint paths) to the demo environment. The launcher validates descriptors and selects @core/native-host/browserService with matching discovery paths, retaining other trusted services. No setting preserves the original host path; a custom browser service conflict fails rather than silently replacing it. No capability token enters the environment or model context. This is independently authored deployment composition, not a claim that the original host permits arbitrary Node clients.

The native-host package now builds a trusted browser-service entry and connector entry, reusing the restored browser service and exported desktop documentation. Runtime staging includes the package and its dependencies. Tests exercise both direct assembly and the built service entry through an authenticated real socket with controlled extension handlers, including discovery, real client heartbeat and turn cleanup. The deployment test verifies package exports resolve entirely inside the private staging directory. These tests do not yet launch the full native supervisor/DeepSeek loop against the independent host.

Separately, the real Chromium/controller integration now creates a tab and ends its turn. A cleanup Illegal invocation was traced to unbound browser timer callbacks in the test host; binding them to globalThis fixes the native receiver without changing restored session logic. Creation itself was successful. Daily Chrome installation, full background startup wiring, navigation/click/screenshot and both user-provided search prompts remain unaccepted.

### Full MCP browser operations and live DeepSeek local-page validation

The Chrome integration now uses the same MCP client, native-supervisor adapter, staged runtime packages, restored kernel/trusted worker, CUA API and independent host as the demo. It verifies inventory, cua.getTab, navigation to a second local page, Playwright button click, observed changed paragraph, screenshot image output and turn cleanup. Restored debugger/download/navigation event listeners are registered in the test extension. The ordinary Chrome profile remains untouched.

This uncovered a real integration defect that service-only tests missed: a direct Node socket retained the setup call's AsyncLocalStorage execution context. When Fetch.requestPaused arrived during a later call, the document-response handler could not read current requirements and navigation timed out. The packaged service now authenticates over the original privileged NodeREPL pipe bridge, which updates the connection execution state on writes and dispatches events in that state. The new authentication adapter consumes only the handshake, preserves coalesced/fragmented post-auth data and closes on invalid authentication. The restored permission checks were not disabled. The test UI grants only its own ephemeral HTTP origin; other requests are declined.

Eleven focused host/connector/authentication/real-Chromium tests and both affected workspace type checks passed. A separate opt-in CUA_LIVE_DEEPSEEK_TEST=1 run used the configured DeepSeek model/key with the actual AgentLoop and MCP chain. The model opened the local page, navigated, attempted an unsupported accessibility click, recovered using its documented Playwright API, and returned action-completed-marker from the changed page. The marker was not supplied in the model prompt. The run passed. Model credentials were loaded only in the parent after MCP startup and were not forwarded to tool workers.

This proves model-driven operations on the isolated Chromium deployment. It does not yet prove installation in daily Chrome, full original background lifecycle/UI/kernel startup, native app operations, or either user-specified external search acceptance command. Those requirements remain open.

### Loadable native-control extension and installation/discovery entry

The reconstruction build now emits dist/native-extension with a fixed public-key
manifest and actual native_background_entry. It composes the restored controller,
CDP/download/navigation forwarding, cursor/popup/page-event runtime messages,
lease restoration, updates and heartbeat. The page-event branch was factored from
the original-derived full router and still passes its differential tests. Full
ChatGPT sidebar/website/kernel lifecycle remains open; this deployment does not
replace that scope with inert callbacks.

The real Chrome/MCP integration now copies the built extension artifact instead of
compiling test-only startup. Its actual installer runs twice in an isolated profile,
validates Chrome's real ID against the manifest public-key hash, launches the host
through Chrome, discovers its configured private endpoint directory and completes
navigation/click/screenshot operations. Five installation/router/real-Chrome tests
and nine host/discovery/connector tests passed; affected type checks passed.

Added npm run install:chrome. On macOS it creates or reuses matching com.core.cua
registration, refuses incompatible existing registrations and sets
CORE_CUA_HOST_DIRECTORY in the ignored .env without printing existing content.
A custom --profile deployment leaves .env unchanged. Endpoint roots must be
private current-user directories; symlink/shared roots are rejected. Host shutdown
removes its session descriptors; no live host gives an actionable load-extension
error rather than falling back to unrelated sockets.

Installed the independent host on this machine and configured its ignored .env.
The daily Chrome extension itself is still not loaded: native app control timed
out, and the browser tool rejected chrome://extensions under its URL policy.
No workaround or Chrome preference-file editing was used. The user must load
packages/browser-extension/dist/native-extension once via Chrome's developer UI.
Both external search prompts remain unaccepted, and the complete original feature
scope is still unfinished.

### 2026-11-05: external search evidence, not acceptance

A real DeepSeek → MCP → reconstructed CUA → packaged native extension run in isolated Chromium navigated to Baidu, filled `deepseek` and clicked search. Baidu redirected to a captcha origin outside the test's explicitly approved origin; observation was declined and no first result was obtained. The live acceptance test correctly fails. Earlier authority-stage timeouts remain intermittent and unresolved. Temporary dist/CDP instrumentation was removed. Added opt-in external homepage and real-model checks, plus demo instructions selecting observed backends and stopping denied actions. See `reconstruction/baidu-live-verification.md`. Daily Chrome connection and both user search commands remain unaccepted.

### 2026-11-05: native-fetch deadline diagnosis and verified recovery

Added opt-in caller-side `CORE_CUA_RUNTIME_DIAGNOSTICS=1` in the native worker wrapper. It preserves protocol bytes and reports only fixed fetch categories, elapsed time and HTTP/transport outcomes. The real external-page probe reproduced 30-second native request waits. Default 30-second JS execution reset before site-status completed; with the demo's new omitted-timeout default of 60 seconds, the same real probe observed a site-status transport error at 30,003 ms and then successfully captured Baidu's search field/button. Original security checks and fetch error handling remain unchanged. Explicit JS timeouts are preserved. Eleven diagnostic/adapter/lifecycle tests and agent-loop type checking passed. Full external search and daily Chrome acceptance remain outstanding; this proves only the observed deadline-collision recovery.

### 2026-11-05: native tab-mention invalidation connected

Restored the lazy `dR` tab-mention invalidation closure and connected it to the native controller's default provider. It preserves native peer capture, runtime message ordering and lookup of current kernel peers; custom providers remain unchanged. Differential testing against the installed initializer passed. A real packaged Chromium integration changed a tab title, received `onBrowserTabMentionsInvalidated` through the actual host, verified the new query result, then completed the existing MCP interaction/screenshot test. Both tests, extension type checking and the reconstruction build passed. Full background lifecycle/sidebar/website/kernel composition and daily Chrome/search acceptance remain incomplete.

### 2026-11-05: actual tab-reference runtime channels

Connected the restored mention message and Port handlers to the built native background, sharing the existing native controller provider. Real Chrome isolated-world script calls to both runtime channels returned an actual second tab and excluded the sender; the sender identity comes from Chrome and passes the original dev-loopback policy. Four original/restored message tests passed, including source checks and disconnect behavior. The packaged extension then passed its full local MCP operation test. Reconstruction build and extension type check passed. Website status remains unregistered because its advertised website/sidebar capabilities are not yet fully assembled; full startup and daily Chrome/search acceptance remain open.

### 2026-11-05: complete dR orchestration restored

Added `startExtensionBackground` and `BackgroundStartupHost`, restoring the complete inspected dR startup order with the existing kernel, mention, message and runtime modules. The entire original function was executed with explicit service fixtures and compared against the new entry across seven modes: normal, side-panel disabled, absent side-panel API, lease error, gate error, turn-end error and telemetry error. Four adjacent differential/composition tests passed; extension type checking and reconstruction build passed. Full production binding and website/sidebar/standalone kernel deployment are still incomplete; the native-only entry remains selected. This is source-orchestration progress, not acceptance of the daily Chrome or external search commands.

### 2026-11-05: WebMCP feature registration service restored

Restored Wf/zk/Kf/Zf/Vk/Wk as typed script registration and serialized feature-gate services, and bound real Chrome scripting through foundation.createWebMcpConfig. Eight differential scenarios cover partial registration, concurrent desired state changes, stable enabled reads and failures. The inspected installed extension references two missing WebMCP content-script files; available @oai files only supply documentation for those paths. No fake assets or forced feature gate were added. Actual WebMCP execution remains incomplete, while the restored service removes an implementation gap in full startup binding. Extension type check, reconstruction build and both gate/startup differential tests passed.

### 2026-11-05: full background service factory and corrected tR route

Added createExtensionBackground to bind the full startup to concrete restored foundation/feature/auth/native/browser/kernel/sidebar/website/lifecycle services. Required environment configuration and active kernel/PDF/telemetry runtime remain explicit; the native-only deployment is still selected. Corrected original tR's semantic name from websiteStatus to youtubeTimestamp and restored its guard, timeout, ownership check and self-contained page execution using the existing URL/timeout helpers. Differential tests cover original timestamp behavior. Factory integration verifies real control RPC, scope output, storage, disconnect cancellation and lifecycle cleanup using explicit Chrome fixtures. No live YouTube/account/sidebar verification is claimed. Full deployment, missing WebMCP resources, daily Chrome and external search acceptance remain unfinished.


### 2026-11-05 — explicit browser connection check

Added `npm run demo:deepseek -- --check-browser` as caller-side diagnostics,
not reconstructed upstream code. The flag skips prompt/key input and model
construction, uses the existing CUA preflight, and preserves turn cleanup.
The inventory check now also recognizes browser among comma-separated surfaces.
Validation: agent-loop type check and 4 preflight/CLI tests pass; CLI tests use
real stdio MCP with fixture inventory, not a live Chrome success claim.
The local entry was exercised with an empty model key: the build completed and
host discovery rejected the absent independent host before any model request.
Daily Chrome attachment and the two user search prompts remain unaccepted.


### 2026-11-05 — kernel session lifecycle source restoration

Restored the lifecycle portion of installed `p_` and cleanup metadata helper `Pl`
as `KernelSessionLifecycle`: per-scope queue, session teardown, suspend/dispose,
turn-specific abort, serialized turn-ended callback and PDF cleanup. Failed PDF
removals stay tracked; callback failure still runs cleanup; a failed queue item
does not poison later work. Queue abort is checked at enqueue, matching upstream;
the future execution callback must retain its own post-wait abort check.
Four differential tests instantiate the actual hash-verified original class with
explicit service fixtures and compare order, output and retained state. Extension
type checking passes. This is a component restoration, not an integrated tunnel
runtime: full `p_` JS execution/consent, transport wiring and real hosted execution
remain incomplete. Daily Chrome attachment/search acceptance is unchanged.


### 2026-11-05 — kernel JS execution and consent composition

`KernelJsHandler` now composes the restored lifecycle with original
`p_.handleJsCall`, `Zg`/`pt`, tool registration and command deferral predicate.
Preserves first-control storage/elicitation, chat-mode instance-bound challenges,
combined cancellation signals, post-queue abort, scope/PDF tracking, output and
error metadata ordering, and final scope/controller cleanup. Protocol keys and
registration schemas remain unchanged. No automatic consent is introduced.
Differential test invokes registered tools of actual original p_ and restored
handler, sharing the real scope registry with explicit external-service fixtures;
it covers nine scenarios plus subsequent turn/PDF cleanup. Production tunnel
transport, chat/PDF service binding and standalone packaged deployment remain
incomplete; this does not establish daily Chrome or search acceptance.


### 2026-11-05 — original tunnel MCP dispatcher composition

Restored `e_`, `t_`, `Nr`, `$s` as `TunnelMcpServer`, metadata normalization and
its original limited schema validator. The inspected validator is local code,
not a third-party schema package; its supported types and inherited-key behavior
are preserved rather than substituted with Zod. Initialize/ping/tools/list/call,
duplicate registration, missing methods, argument-level metadata stripping,
context fallback, tool failure sanitization and aborted-call null response match
the actual original bindings. `createKernelTunnelMcpServer` registers the real
restored JS and turn-ended handlers; integration verifies output and PDF cleanup.
The dispatcher is not the HTTP tunnel: polling, response delivery and elicitation
transport still need composition, along with production services and deployment.
Daily Chrome and external search acceptance remain incomplete.


### 2026-11-05 — tunnel elicitation client restoration

Restored original `r_`, `Rl`, `n_` as `TunnelElicitationClient`: form notification,
delivery acknowledgement, polling lifetime, channel/session matching, response
validation, pending cleanup, session termination and request cancellation.
Actual original-class differential covers delivery/reply races, error/abort paths,
late responses, duplicate session headers and pre-abort/dispose behavior.
A composed MCP -> JS -> client test verifies acknowledged explicit acceptance
before storing permission/executing; decline or unacknowledged reply never executes.
Seven related tests, extension type checking and reconstruction build pass.
HTTP post/poll are fixtures in these tests; production network transport,
full deployment, daily Chrome and search acceptance remain incomplete.


### 2026-11-05 — actual tunnel HTTP response delivery

Restored `Bs/js/Cl/kl`: default real fetch, per-request deadline and overdue
expiration, abortable backoff, Retry-After parsing/cap, notify timeout handling,
status-specific failure reports and one-shot unauthorized recovery. Each delivery
invocation has at most three attempts; 401 recovery invokes a fresh delivery
without another recovery callback. No credentials are logged or implicitly set.
Thirteen deterministic source-differential scenarios match actual installed
functions; real loopback HTTP verifies the default POST/JSON path. These tests
prove delivery behavior, not hosted tunnel connectivity, full poll composition,
daily Chrome attachment or the two search tasks.


### 2026-11-05 — complete local HTTP tunnel composition

Restored original `d_` poll/command server and `h_` response deadline parsing.
`KernelHttpTunnel` composes its transport with the restored `p_` lifecycle and JS
tools. Poll GET, command deferral, response POST, session termination, response
acknowledgement, cancellation, retry/invalid-tunnel handling and initialization
restart/disposal now use the actual restored components. Browser fetch/clocks,
version/online state and reporting are explicit environment dependencies.
Differential tests execute original d_ for poll outcomes and startup lifecycle.
A real loopback HTTP test drives GET command -> elicitation notification -> reply
ack -> explicit consent -> kernel execution -> result POST. Its kernel/chat/storage
are fixtures; this does not grant actual browser permission. Production account,
telemetry/PDF/feature bindings and complete extension assets/entry deployment
remain incomplete, as do daily Chrome and the two external search acceptances.


### 2026-11-05 — real restored service binding for kernel tunnels

Added `createKernelTunnelRuntime`, binding the actual restored ChatApi class,
shared scope registry, offscreen host registry and kernel HTTP tunnel. A provided
validated tunnel configuration creates its own account-scoped ChatApi; controls
consume the same active scope via `getScope`. Restored original `Fn` Library
DELETE with URL encoding and response-body cancellation. Tunnel account typing
now uses the existing parser return type instead of widening structure to string.
Original Fn differential and composition tests verify account isolation with the
same session ID, actual ChatApi request construction, control output, turn-scoped
PDF deletion, shared offscreen creation and disposal resets. Chrome/offscreen and
backend responses remain fixtures; PDF capture/upload, production coordinator and
full extension packaging are not yet completed. Daily Chrome/search acceptance
remains unproven.


### 2026-11-05 — Library PDF upload and status processing

Restored `rg/sl/ng/il`: authenticated file creation, original allowed destination
suffixes, estuary form vs direct blob upload, forbidden account headers, process
stream, readable Library lookup and best-effort failure cleanup. Processing is
newline-delimited JSON with the original 1 MiB bound, completion/deferred-index
conditions and failure/temporary-storage rejection. Reader cancellation is retained.
Nineteen upload scenarios and streaming edge cases compare actual installed
functions with the readable implementation. No user files or production endpoint
were used; API/blob responses are fixtures. Real page PDF capture and production
binding remain incomplete, alongside full deployment and browser/search acceptance.


### 2026-11-05 — PDF page capture and Library orchestration

Restored `mg/gg/_g/Rs/ul/vg/ol`: exact tab/document/sender validation, isolated
page GET, port backpressure, 256 KiB chunks, 128 MiB total cap, PDF signature,
keepalive and timeout, navigation rechecks, Library upload and deletion if the
page changes afterward. The injected function is self-contained; tests also
serialize the esbuild-compiled function into an explicit browser environment.
Actual original-function differentials cover background sender/chunk failures,
page GET/content/size failures, filename behavior and capture/upload cleanup.
Chrome and API responses remain fixtures. A real Chrome PDF page, production
composition and full deployment have not been verified; daily Chrome/search
acceptance remains incomplete.


### 2026-11-05 — real Chromium PDF byte-capture verification

Added `extension-tab-pdf-browser.test.ts`. It builds a minimal MV3 extension using
the actual restored capture component, opens a locally generated PDF in isolated
Chromium, obtains the real document ID, injects the self-contained page capture
and transfers bytes over actual extension Ports. A deterministic image makes the
PDF larger than two 256 KiB transport chunks. Captured size and SHA-256 match the
served source, and server request count confirms a separate repeatable GET.
The live-browser test passes. It uses a private temporary profile and local data,
then cleans up; no daily Chrome profile, account token or Library upload is used.
This proves PDF byte capture in that browser environment, not full extension
packaging, authenticated Library upload, daily Chrome or DeepSeek search acceptance.


### 2026-11-05 — tunnel registration and authentication refresh setup

Restored original `T_` and exposed `foundation.setupBrowserTunnel`, bound to
actual restored `readAuthSession`, instance ID and configuration readers. Handles
auth HTTP/decode/logout, account-scoped registration cache, explicit invalidation,
creation, unchanged configuration and token refresh with original abort ordering.
Fourteen scenarios compare actual installed T_; integration uses actual restored
auth parsing and instance identity. Construction issues no requests. Network and
storage responses are fixtures; no real account session/tunnel was created.
The broader S_ timer/alarm/activity coordinator and complete production deployment
remain incomplete; daily Chrome/DeepSeek search acceptance is unchanged.


### 2026-11-05 — tunnel activity and persisted listening

Restored `w_/xl/y_` and exposed `foundation.createTunnelActivity`: observes tabs,
side-panel contexts/stored windows and active turns, persists state, suppresses
stale observations, retains listening on uncertainty and applies the original
10-minute post-turn idle condition. URL observation is not an authorization gate.
Ten state scenarios compare original closure behavior, including storage/query
failure, invalid persisted state, duplicate turn starts and stop cleanup; guard
and hostname boundaries are also compared. Four related tests, extension types
and reconstruction build pass. Chrome/storage remain fixtures. The S_ setup/alarm
coordinator and production deployment remain incomplete; search acceptance unchanged.


### Tunnel coordinator and assembled lifecycle (2026-11-05)

Restored original `S_` and `m_` as `startTunnelCoordinator` and
`createTunnelSetupReporter`: serialized refresh, stale-generation cancellation,
60-second setup timeout, 30-second unauthorized cooldown, matching-account token
recovery, retry/health alarms, navigation refresh and explicit cleanup.
`startAssembledBrowserTunnel` now connects the real restored setup, activity,
polling manager and kernel HTTP runtime. Invocation starts authentication/setup;
the caller still owns the original feature-gated startup decision.

Source-differential coordinator tests cover ten scenarios. Assembly tests exercise
registration → session storage notification → polling → MCP ping response delivery,
and auth-401 → no network polling, using explicit Chrome/auth/HTTP fixtures. They
verify shutdown aborts the pending poll and removes alarms/listeners. These are not
production authentication or daily-Chrome operation tests. Extension TypeScript
check, reconstruction build and nine tests across five related test files pass.
The native-only installer still does not deploy the full tunnel/sidebar stack;
the daily Chrome connection check currently reports no running independent host.


### Background-owned tunnel bindings (2026-11-05)

`createExtensionBackground` now accepts a kernel-binding factory receiving its
actual foundation. `createTunnelKernelBindings` uses that foundation's ChatApi
and auth/activity services, shares a single kernel scope/offscreen registry with
control RPC, and binds the restored PDF capture/upload/deletion lifecycle. Pass
it as `kernel: foundation => createTunnelKernelBindings({ ...environment, foundation })`;
the explicit options include Chrome APIs, kernel host, HTTP environment, telemetry,
site-status URL, allowed-page defaults and interval functions. Construction does
not authenticate or poll. The unchanged `chrome-standalone-js-kernel` observer
activates tunnel registration once, when enabled.

Integration tests now exercise both direct assembly and background bindings. The
bound route delivers a real restored MCP tools/call through the runtime to an
explicit offscreen execution fixture and returns both shared-scope and kernel
output. Tests assert no network before gate activation, single activation, auth
401 rejection, pending-poll cancellation and listener/alarm cleanup. Foundation
identity is also checked at the background factory boundary. Type check, build
and 12 related tests pass. This does not deploy the full extension, prove a real
offscreen JS engine, or change daily-Chrome/search acceptance status.


### Real offscreen kernel execution (2026-11-05)

`extension-kernel-live-browser.test.ts` builds and loads a temporary MV3 extension
in real headless Chromium. The actual restored MCP dispatcher, kernel runtime,
control RPC, offscreen document, frame host, sandbox iframe, Blob Worker and
MessagePort transports execute JavaScript. Explicit test auth/account, feature
configuration and local test consent are used; external network requests throw.
The test verifies outputs 42/43 across calls, session-scope isolation, retention
of prior successful variables after a thrown script, discarding failed new
bindings, and clearing variables on session termination. No execution result
is synthesized by an offscreen fixture. The manifest uses the installed source's
sandbox CSP and a fresh temporary profile, which is removed after the test.

Standalone `build-reconstructed-kernel.mjs` now regenerates the worker bundle
from current TypeScript before bundling the frame entries, preventing a stale
embedded worker when this build script is invoked independently.

This proves real JS execution and transport for the temporary kernel deployment.
It does not prove browser getTab/click/screenshot operations through this kernel,
production authentication/tunnel networking, the full sidebar deployment, or
daily Chrome and DeepSeek search acceptance.


### Real kernel browser operations (2026-11-05)

The live Chromium test now binds the actual foundation's browser handler and
ExtensionBrowserPeer alongside the real control RPC. Through MCP JS it lists the
Chrome browser, enumerates user tabs, claims the exact local fixture tab via
`browser.user.claimTab`, reads its URL, captures a JPEG (signature and nonempty
bytes checked), and clicks its button through `tab.cua.click`. Playwright only
launches the temporary browser, serves/opens the local fixture and independently
checks that the button text changed to `Clicked`; it does not perform the tested
click or screenshot. Original browser security stays enabled. Auth and browser
settings/site-status responses are explicit fixtures permitting only the local
page's origin; no real external backend fetch is made. Worker-global timers are
bound to globalThis, as in the native production entry. Temporary diagnostic
instrumentation was removed before the passing run.

The live test and five related offscreen/assembly tests pass. This supersedes the
previous limitation on kernel screenshot/click verification for this local page.
It remains separate from daily-profile Chrome connectivity, DeepSeek model-driven
search, production authentication, and full extension/sidebar deployment.


### Side-panel selection observer source restoration (2026-11-05)

Deployment audit found that `codex-work-sidepanel.html` references the distinct
`codex-work-sidepanel-Cy6MdlEo.js` page entry, not the restored background side-panel
handlers. That entry still needs reconstruction before full deployment can be
claimed. Its actual `Ee`/`et` selection observer is now readable TypeScript in
`side_panel_selection.ts`. The function remains self-contained for Chrome script
serialization. It preserves exact-URL/observer identity checks, 80,000-character
selection bounds, revision/capture generations, stale recovery rejection, event
and polling recovery modes, iframe subscriptions, debounce and scoped cleanup.

Source SHA256: `3c34166181949c77a2123425bb7dc95d913af693b319c5559cc02416e965ad7b`.
A hash-checked test extracts the original two functions with Acorn and compares
six explicit DOM/timer/message fixture scenarios against serialized restored
functions. Type check, reconstruction build and differential test pass. This is
not yet integrated with the complete side-panel page, Google Workspace recovery
helper, microphone permission page or production deployment.


### Workspace selection recovery composition (2026-11-05)

Restored the installed `google-workspace-B6IvXzEl.js` helper chunk. Identical
URL parsing and export filename logic are reused from `@core/browser/tabReading`;
export formats/URL and inline-data-reference stripping preserve source behavior.
The self-contained MAIN-world capture uses native DataTransfer/ClipboardEvent
to invoke the page's copy handler, with origin/URL checks, active iframe realm
selection and length bounds. It does not access the system clipboard.

Restored sidepanel `pe` as `createSidePanelSelectionCapture`, exposed through
`foundation.captureSidePanelSelection`: observe in the selected tab, recover only
when requested, pin the two subsequent injections to the observed documentId,
recheck caller generation before/after recovery, and reconcile the original
captureGeneration. The original lack of a final generation recheck is retained.

Hash-checked differential tests compare the actual helper chunk (SHA256
`a3fabfffeec68d0dceb204c9ad0efe244e93f3b99edcce0a8edb170266ff7dc0`) and sidepanel
function against restored helpers, seven serialized capture scenarios and ten
orchestration scenarios. Type check, build and five related tests pass. DOM,
Chrome injection and clipboard-event data are explicit fixtures; real Google
Docs/Sheets/Slides interaction and complete sidebar deployment remain unverified.


### Side-panel page routing and Edge window lifecycle (2026-11-05)

Restored sidepanel `ne/D/it/rt` as persisted-conversation URL normalization,
iframe construction, Edge window-scoped page management and page startup routing.
The URL validator preserves the exact query-key allowlist and surface rules; the
iframe retains the original explicit allow/sandbox attributes. Edge keeps one
page per tab, hides/reactivates existing pages, suppresses stale tab queries,
handles removed/detached/replaced tabs and disposes pending pages on pagehide.
Startup retains root validation and no-API/no-tab/error fallback ordering.

`SidePanelPageFactory` is an explicit dependency for the original `ge` per-tab
auth/message/selection controller, which is not implemented yet. These modules
are not presented as a working complete sidebar. Hash-checked installed-source
differential tests cover URL/frame policy, four window lifecycle scenarios and
seven startup scenarios with explicit DOM/Chrome/page fixtures. Type check, build
and seven related tests pass. No live sidebar or authentication was exercised.


### Side-panel frame protocol dependencies (2026-11-05)

Restored the shared `src-BsTzWBmo.js` frame protocol guards for auth changes,
open-in-browser, prompt prefill, context/tab-context requests, location changes,
media-permission requests, browser context and capabilities requests, plus exact
message/capability constants. The per-tab controller's auth-revalidation and
readable-tab guards and GET_EXTENSION_INSTANCE_ID reader are also restored.
Instance-id/UTF-16 validation reuses the existing restored implementation.

Original shared chunk SHA256 is
`2284e7e24f4fc756e5af9e00d652914415a238128e5dcf4ab02bb0388c130dd0`.
Hash-checked differential tests cover valid/invalid and inherited/array fields,
prompt/selection/request-id bounds, tab URL/id/incognito boundaries and instance
request failures. Type check, build and six related tests pass. These are protocol
prerequisites, not a completed `ge` controller or deployed sidebar. Message shape
validation does not replace the controller's required origin/source checks.


### Complete per-tab side-panel controller composition (2026-11-05)

Restored original sidepanel `ge` as `createSidePanelPageController`, with named
state/callbacks for frame lifetime, toolbar status, invocation delivery, selection
generations/polling, owner-tab invalidation, context/capability messages, auth
revalidation, load telemetry/retry UI, media permission helper tabs and disposal.
The original origin plus frame-source admission checks, tab/window binding,
async generation checks and message ordering remain intact.
`startAssembledSidePanelPage` now composes rt/it with this actual per-tab controller
and the restored browser-family detector; ge is no longer a missing factory
dependency for callers using this entry. Browser environment/timers are explicit.

A hash-checked original ge differential test compares ten scenarios: context,
wrong origin/source, auth, prefill, timeout retry, revalidation, media callbacks,
owner removal and detached root. It uses explicit DOM/Chrome/timer/permission
fixtures and compares posted messages, storage, UI, script calls and cleanup.
Type check, build and eleven related tests pass. No actual microphone/camera
permission or production auth was requested. The permission page, packaged page
resources/telemetry and complete extension deployment still need integration and
live acceptance; daily Chrome/DeepSeek search status is unchanged.


### Media permission helper page (2026-11-05)

Restored installed microphone-permission page startup, theme selection/subscription
and request/retry handler as `startMediaPermissionPage` and
`initializeMediaPermissionTheme`. Query parameters preserve the original camera
and microphone constraints, including both false; browser-specific UI and
immediate successful track shutdown match the installed implementation. Telemetry
is an explicit required host dependency, not a silent placeholder.

The hash-checked differential test evaluates the original page tail with explicit
DOM/media/timer fixtures and compares five query configurations across seven
scenarios (success, rejection/retry, track-stop failure, legacy theme listener,
missing/throwing matchMedia, missing root). All 35 combinations pass. The related
side-panel controller test, extension type check and reconstruction build pass.
No real camera or microphone was opened. HTML/CSS/entry/telemetry deployment and
live side-panel acceptance remain outstanding. A fresh daily Chrome check still
fails because no independent browser host is connected; DeepSeek search remains
unaccepted.


### Page telemetry third-party reuse (2026-11-05)

Installed sentry-CVTEo7Wt.js embeds Sentry 10.48.0. The page initializer ic
and channel normalizer oc are now readable TypeScript in page_telemetry.ts;
@core/browser-extension directly depends on @sentry/browser 10.48.0 rather than
reimplementing that third-party bundle. Manifest API/fetch fallback, release,
context/component/build tags, extension initialization flag and swallowed errors
match the inspected original. The DSN is intentionally required deployment
configuration instead of the installed vendor destination.

Hash-checked source differential tests cover six initialization scenarios and
channel normalization/errors. Both tests, extension type check and reconstruction
build pass. Tests inject the SDK boundary and make no external telemetry request.
The SDK default is the real imported init; complete packaged page startup still
needs assembly. This does not change daily Chrome/DeepSeek acceptance status.


### Packaged page entries and real Chromium page boot (2026-11-05)

Added side_panel_entry.ts and media_permission_entry.ts. The side-panel entry
starts telemetry without awaiting it, then composes the actual rt/it/ge modules
with browser globals and bound timers. The media entry composes its restored
page with real SDK-backed telemetry. `npm run build:pages` hash-checks installed
HTML/CSS, preserves DOM/CSP/styles and rewrites only asset/module references into
self-contained TS bundles. Original modulepreloads are removed because dependencies
are bundled. An empty deployment DSN disables delivery by default.

Output is staged under packages/browser-extension/dist/pages: deploy HTML at the
extension root and JS/CSS under /pages. This is not yet wired into the existing
native background manifest. The build requires the installed source snapshot
or CUA_EXTENSION_SOURCE_ROOT; original HTML/CSS are not vendored in GitHub.

A temporary real Chromium extension test boots both built entries. It verifies
iframe URL/sandbox/permission attributes, stylesheet loading, camera-only denial
UI and retry/track-stop with an explicit same-extension media fixture. An initial
Playwright init-script fixture did not replace the extension page's own media
execution world and the run timed out; the final test installs its fixture script
in the page before the entry module and passes. All HTTP(S) requests are aborted
in this test. It does not prove production ChatGPT framing/authentication or daily
Chrome/DeepSeek acceptance.


### Full background environment composition (2026-11-05)

createFullBrowserBackground now connects createExtensionBackground with the
actual tunnel/kernel bindings, shared foundation, native transport, offscreen
registry, PDF capture, feature service and SDK-backed page telemetry. Deployment
configuration supplies the feature SDK/API, native hosts, channel, telemetry DSN,
site status endpoint and allowed pages. Browser environment bindings preserve
API receivers and distinguish wall/monotonic clocks. Tunnel diagnostics currently
go to local console; this is an explicit deployment telemetry choice. No fake
authentication, forced feature gate or replacement kernel is supplied.

A real temporary Chromium extension starts the complete background with an
offline fetch fixture and nonexistent native host. The test verifies startup
completion, denial of instance queries from an unrelated extension page, UUID
response to the exact authorized sidebar path, heartbeat registration, and no
offscreen kernel creation while unauthenticated/offline. The initial fixture
manifest lacked commands, causing registration failure; adding the original
open-codex-side-panel command resolved it. This test, extension type check and
reconstruction build pass. The sidebar page here is explicitly a message probe,
not the production page/content/iframe authentication flow.

Complete deployable manifest/background entry packaging is still pending; this
composition does not replace the current independent native demo installation.
Daily Chrome and DeepSeek command acceptance remain outstanding.


### Deployable full extension package (2026-11-05)

Added full_background_entry.ts and build:full-extension. The builder validates
explicit deployment configuration, hash-checks the installed manifest, assembles
restored background/content/pages/kernel bundles, copies original image resources
and preserves original permissions/commands/injection worlds/sandbox. Core key
and name replace the vendor identity, vendor update_url is removed, minimum
Chrome is 120 to match the bundle target and configured endpoint origins extend
connect-src. No private model token is accepted by the configuration schema.

The actual built package passes an isolated offline Chromium test: all declared
resource paths exist, full startup registers heartbeat, the real sidebar entry
creates its iframe and queries an instance id, and no offscreen kernel is created
without authentication. This replaces earlier tests' probe-only sidebar with the
actual packaged page. Production auth, ChatGPT frame content, optional missing
WebMCP assets, native supervisor parity, daily Chrome and DeepSeek commands remain
unaccepted. The package is built, not installed; current native demo is unchanged.


### DeepSeek missing-browser startup diagnostics (2026-11-05)

Native host discovery now uses a typed error for missing configured directories
and zero endpoint files. The demo CLI catches only those known prerequisites,
prints the exact extension load path and repair/check commands, and exits 1
without an unhandled JS stack. Runtime startup moved into a separate module;
AgentLoop/provider contracts are unchanged. The shell launcher invokes the TS
entry directly to avoid nested npm workspace failure noise.

Four tests pass, including subprocess runs without a model key, missing/empty
directory handling, real host discovery/shutdown and rejecting unsafe directory
permissions. Agent-loop type check and reconstruction build pass. Re-running the
actual user command --check-browser on this Mac now gives the readable diagnostic
and still exits 1: no browser endpoint is currently connected. No model request
or browser operation occurred. Daily Chrome + DeepSeek acceptance is not claimed.


### Full extension native/MCP/DeepSeek operation acceptance (2026-11-05)

The existing native-controller acceptance test now runs against either the
independent native package or the actual full-extension builder. The full case
uses the registered Core native host in a temporary profile, original background
startup/feature gates, fixture feature service configuration and a local HTTP
page. Native RPC verifies tab listing/context, tab mention invalidation and
Chrome-generated sender identity. The real MCP/supervisor/CUA chain then obtains
an existing tab, navigates, clicks, reads state and captures an image. Full case
passes in about 15 seconds. Initial test DNS rules also blocked loopback; adding
127.0.0.1 to the exclusions fixed that test-environment issue.

A second run with CUA_LIVE_DEEPSEEK_TEST=1 and CUA_MODEL_PROVIDER=deepseek used
the project's local .env credentials, actual DeepSeek model and AgentLoop. It
opened the owned local page, clicked Run action, read action-completed-marker and
captured screenshots; final answer contained that observed marker. Passed in
about 23 seconds. The model initially supplied unsupported visibility and then
AX input; both returned explicit errors and it recovered with supported tab
creation and Playwright click. This proves recovery, not an error-free run.

This is stronger than package startup but remains a temporary Chromium/local-page
acceptance. It is not the user's existing Chrome profile, Baidu/search-result
acceptance, production authentication or App control. No original auth/feature
gate was forced on. Credentials were neither printed nor included in artifacts.


### Full-extension live Baidu attempt and failure evidence (2026-11-05)

The full native-controller test now allows network DNS for explicitly enabled
Baidu live/probe runs while retaining its default local-only DNS test rule.
On live Baidu failure it saves public baidu.com page URL/title/visible body text
and screenshots before the temporary profile is closed. It never collects host
capability descriptors or model credentials.

Two real DeepSeek runs of “访问百度 搜索 deepseek 给我返回第一条搜索结果”
failed at the 90-second AgentLoop deadline (about 105 seconds including setup).
Both opened Baidu and observed its search field; unsupported visibility/AX calls
returned explicit errors. In the second run, creating the Baidu tab and a locator
count each took about 31 seconds. The next fill/submit call had no successful
result before cancellation. Retained screenshot/text show the Baidu homepage
with an empty search box, not search results or a CAPTCHA. The latency cause
remains unresolved; no claim is made that the search was submitted successfully.

This is a failed acceptance with improved diagnostics, not a passing search
verification. The earlier local-page DeepSeek success remains valid only for that
local temporary-browser scenario. Daily Chrome and Baidu result acceptance remain
open. Do not retry merely to seek a passing outcome without investigating timing.


### Baidu latency localized to authenticated-fetch site status (2026-11-05)

A model-free Baidu probe with CORE_CUA_RUNTIME_DIAGNOSTICS=1 completed and
recorded upstream authenticated-fetch timing. site-status request #11 returned
a transport error after 30004 ms; several identity requests also returned
transport errors at approximately 30004 ms. Other fetch categories returned
HTTP 200 or 429. These observations locate the recurring delay at the host
transport/status-check boundary, not evidence of a CAPTCHA or slow DOM locator.
They do not yet establish whether the underlying cause is authentication,
network access or another native-supervisor condition.

Installed-source differential testing confirms failed site-status results are
not cached and the next command starts and awaits a fresh request. Existing
security semantics are retained: no bypass, fabricated approval, failure cache
or arbitrary timeout change was introduced. Optional runtime diagnostics now
explain slow site-status transport failures without logging raw errors, URLs,
credentials or request bodies, and forward the exact protocol bytes unchanged.
Nine focused tests and AgentLoop type checking pass. The Baidu probe proves
homepage observation only, not search acceptance. Next investigation is the
underlying authenticated-fetch host transport failure.


### Classified host failures and direct transport cross-check (2026-11-05)

Optional runtime diagnostics now classify native failure text into fixed labels
(timeout/TLS/authentication/DNS/connection/request-send/response/unspecified),
without emitting raw error text. Five diagnostic tests and AgentLoop type check
pass; fragmented protocol bytes remain unchanged. A first diagnostic probe had
already loaded the earlier module; a subsequent fresh probe used the new version.

The fresh model-free full-extension Baidu probe passes homepage observation, but
its site-status host fetch fails in 49 ms rather than the prior 30004 ms and is
classified unspecified. Therefore the underlying native error does not currently
provide a recognized cause through this classifier. A separate unauthenticated
request to the same known site-status endpoint fails before HTTP: curl exit 7
(status 000, ~49 ms); Node fetch TypeError with cause ECONNREFUSED (~92 ms).
No credentials were supplied in these cross-checks and no DNS/proxy/policy settings
were changed. This supports a currently unavailable upstream network connection;
it does not prove the original 30-second host failure has the identical cause,
or establish login status. No Baidu search or production auth success is claimed.


### Missing public browser-worker export restored (2026-11-05)

A package-export audit found that @core/cua exposed only tinyskyAlt despite the
installed package also exporting tinyskyBrowser, its root and vision-only entry.
Restored create_tinysky_browser from the installed JS and declaration and added
the original tinyskyBrowser subpath to the workspace. It composes existing
documentation/bootstrap/browser modules, binds global agent after bootstrap,
preserves initialize/getState alias identity, partial inventory errors and
emission options, and requires the caller's browser runtime/docs as originally.

Five original-versus-restored factory scenarios and package export resolution
pass (two test cases); reconstruction build passes. No real browser is invoked
by these fixture tests. Root and vision-only CUA exports remain unimplemented,
so full public-package parity is explicitly not achieved. Corrected stale README
headlines/table labels and source-map statuses that still described already-wired
Sky/desktop entries as not reconstructed. Network/native and daily-browser
acceptance gaps remain unchanged.


### Vision-only public entry reconstruction

Restored `@core/cua/tinysky_vision_only` from the installed factory and global entry, with extensionless TypeScript imports and the original Linux-only guard. Screenshot emission, click/drag/scroll translation, positive pixel validation, printable-ASCII keyboard mapping, sequential key dispatch and error propagation retain original behavior. Source hashes are recorded in `reconstruction/source-map.json`.

Validation: `npm run build:reconstruction` passed; `npx tsx --test reconstruction/tinysky-vision-only.test.ts` passed four differential scenarios against the installed JavaScript (normal, missing screenshot, image emission failure, key dispatch failure). These use a fixture computer, not a real Linux desktop. Global entry native initialization and Linux device acceptance remain unverified. The root CUA export, daily Chrome connection, and requested DeepSeek web searches remain incomplete.


### Root CUA public entry reconstruction

Restored `@core/cua` → `index.ts` → `cua.ts` from installed JS and declarations. The singleton starts with null computer/browsers/documentation; initialize sets up the browser runtime with only `undocumentedApiMembers: ["Tab.ax"]`, assigns Sky/browser/documentation, then retrieves inventory using the restored get_state helpers. Reinitialization creates a fresh browser runtime. Setup failure retains prior singleton fields; inventory errors remain inventory results as in the original. No unified/tinysky wrapper is substituted for this separate API. All four installed CUA export paths now have corresponding workspace entries.

Validation: build:reconstruction passed; six cua-root tests passed (five differential scenarios and package export resolution). Differential tests replace only runtime/Sky dependencies with fixtures and execute the original/restored inventory helpers. Cases cover repeated and detached initialization, first/second setup failure, app enumeration failure and browser enumeration failure. Real root native initialization remains unverified. This supersedes earlier missing-root statements; daily Chrome, real Linux vision-only and DeepSeek search acceptance remain outstanding.


### Reproducible installed-package source inventory

`npx tsx reconstruction/audit-package-source.ts` now records every installed JS module in CUA, Sky and CUA-REPL with source SHA-256, corresponding readable TS path, built-file presence and static/dynamic import edges. The current snapshot contains 27 CUA, 62 Sky and 3 CUA-REPL modules: all 92 have corresponding source/build paths and all relative import targets exist in the installed snapshot. Existing entries in source-map.json were also checked against disk with no missing or changed hashed sources.

This closes the earlier uncertainty about missing same-path JS files for these three packages only. It is not a semantic completion percentage: browser bundles, extension modules, external native executables, declaration equivalence, and device acceptance remain outside this inventory. The next acceptance focus is native/runtime integration and behavior rather than adding nonexistent missing CUA filenames. `package-source-inventory.json` preserves outside-source edges so bundled third-party/core/browser dependencies are not misclassified as application code to rewrite.


### Native App demo preflight and real-host probe

Added explicit `--computer` and token-free `--check-computer` demo modes. The generic AgentLoop stays unchanged; the demo calls restored `cua.listApps({emit:false})` through MCP and requires a successful structured inventory marker before allowing model execution. Empty successful inventories are valid. Tool errors, missing/invalid markers and invalid counts reject startup; trace messages are retained as initial model context on success. Computer-only CLI mode does not forward default browser endpoint settings.

Typecheck, shell syntax and four combined computer/browser preflight tests pass. Real `npm run demo:deepseek -- --check-computer` reached the restored Sky/native transport but failed `Sky Computer Use native pipe startup failed`; default socket exists. No model request or App operation succeeded. This narrows the outstanding native acceptance boundary to service connection/startup, without claiming the cause or bypassing native restrictions.


### Native App failure narrowed to sender authentication

Added optional native-pipe metadata diagnostics alongside authenticated-fetch timing. It observes connect/close and bounded framed handshake/error responses, logs only sequence numbers, fixed labels and numeric JSON-RPC codes, and leaves all worker bytes unchanged. It never logs socket paths, raw errors, frame bodies or server version strings. Seven diagnostic tests and AgentLoop typecheck pass.

The real computer-only probe at 2026-11-04 22:11:27–22:11:32 UTC observed 40 connections followed by 40 closes, with no handshake response. Correlated SkyComputerUseService system logs repeatedly state `Sender process is not authenticated` (sample 2026-11-05 06:11:32.830 Asia/Shanghai). This supersedes the earlier unknown startup failure cause: the installed native service rejects sender authentication. The observed logs do not identify the rejected executable or establish a supported standalone authorization procedure. No authentication/signature/permission bypass was attempted.

Evidence is recorded in reconstruction/native-computer-runtime-evidence.json. Repeatedly launching the same standalone command cannot establish App acceptance while this restriction remains. A supported authorized host integration or an independently implemented native backend is still required; the restored JS client alone does not provide the native implementation. Browser extension connection is a separate boundary.


### Native implementation provenance decision

Reviewed the existing independent prototype (`src/native`, `native/macos`) as well as the reconstructed stack. They are separate implementations: the prototype's partial Swift helper is not currently the Sky service used by demo:deepseek. Reusing it silently would conflict with the requested original-source fidelity. `reconstruction/NATIVE-RUNTIME-DECISION.md` records two concrete routes: explicitly author the unavailable native boundary while preserving reconstructed public contracts, or retain installed native dependencies and require a supported authorized host. No backend switch has been made. The native provenance choice requires user clarification; feature scope and outstanding browser acceptance are unchanged.


### Approved route A: independent macOS service reaches restored MCP

User resumed with “按照你的建议进行”, authorizing independently authored native boundaries while retaining recovered @core interfaces and full feature scope. Added @core/native-macos, reusing the existing Swift helper transport and adding a Sky-shaped client/service. A public @core/sky/serviceFactory export reuses the existing dispatcher rather than copying it. Runtime staging includes the new package; computer demo mode explicitly selects the independent service by default and builds the helper. Vendor mode remains opt-in for comparison, with no automatic fallback.

A real MCP probe through restored workers/CUA/Sky and the independent helper now passes inventory (41 running apps). Direct helper hello reports accessibility=false and screenRecording=false. A real DeepSeek prompt returned 41 from the supplied inventory. This resolves the old vendor-service sender rejection for this independently implemented App inventory path, not for all App features. Native supervisor remains the installed executable.

Build, native-macos and AgentLoop typechecks pass. Six adapter/deployment tests pass, covering app identity race rejection, authorization rejection, observation invalidation, action snapshot requirements and trusted package resolution. Initial integration failed because the new package lacked the default export condition used by trusted require.resolve; adding it resolved the package-boundary error without weakening trusted-root checks.

Implemented adapter slice is discovery/full AX text/setValue/focused typeText/unheld keys, with host approvals and helper snapshot validation. Screenshots, coordinate mouse operations, scroll/drag, audio, lifecycle/supervisor independence and exact policy/observation parity remain unfinished. UI read/write behavior is not yet accepted under real OS permissions. No vendor signing/authentication or TCC settings changed.

Real model tool-call acceptance: a subsequent DeepSeek prompt requested the sum of app displayName lengths, which the preflight count cannot answer. DeepSeek emitted a fresh js call invoking cua.listApps({emit:false}), computed the sum and received 620 from the independent native service; final answer was 620. This establishes model-generated tool dispatch on the native discovery path only. No app names were emitted, and no windows or UI actions were accessed.


### Independent native selection and secondary action integration

Added Sky-shaped select_text and perform_secondary_action to @core/native-macos, reusing the helper's AX operations. Selection now supports text/cursor_before/cursor_after, matching the original public selection_type contract, with prefix/suffix disambiguation and UTF-16 positions. Factored the existing range search into a testable Swift function; unknown modes/types, missing text and overlapping ambiguity fail explicitly. Both adapter operations return void after successful dispatch, require host authorization and a complete current observation, and invalidate it before action.

Native build and pure Swift self-test pass (Unicode text/cursor offsets, context selection and failures), reconstruction build and native package typecheck pass. Seven adapter tests pass, including actual restored bind_mac_app → createSkyService → independent client routing for selection and secondary actions. No real UI action was performed; Accessibility/screen-recording acceptance and the remaining native/backend/browser requirements remain outstanding.


### Independent native screenshot path connected to restored CUA

get_app_state now refreshes helper permission status and uses the existing observeWithScreenshot operation when Screen Recording is granted. The helper already verifies app identity, window geometry and AX stability across capture. PNG envelopes are checked for canonical base64, signature/IHDR, dimension consistency and existing byte/pixel limits, then exposed as the original Sky screenshot data URL. The original CUA getScreenshot decoder returns those image bytes unchanged. This is envelope validation, not a complete PNG decoder.

Without screen recording, AX-only observation returns screenshot:null and explicit warning; getScreenshot reports unavailable. Capture failures and malformed images propagate without retaining an actionable old snapshot. Multiple capturable windows still trigger the helper's ambiguity error because original app references do not yet supply a window selector; full multiwindow selection parity remains incomplete.

Eleven native adapter/screenshot tests pass, including restored CUA image-byte roundtrip with a fixture PNG, permission absence, malformed images and failed-capture snapshot invalidation. Native package typecheck and reconstruction build pass. No real window screenshot or UI action was performed; OS permissions and full native/browser acceptance remain outstanding.


### Independent multiwindow capture selection

Added native WindowSelection.swift. For multiple eligible windows, the helper reads the bound app's AXFocusedWindow, validates its PID and point/size values, and matches its frame against that app's ScreenCaptureKit windows. Unique geometry wins; a nonempty exact title may disambiguate same-geometry candidates. No first-window fallback occurs. Explicit helper windowId retains priority. Missing/unmatched/ambiguous focus fails explicitly. After capture, focus AX identity and geometry must still match, in addition to existing window geometry and AX observation checks.

Swift build and --self-test pass, with pure selection cases for reversed candidate order, explicit ID, overlapping windows, missing focus, absent IDs, no candidates, unrelated geometry and negative screen coordinates. This supersedes the blanket multiple-window rejection but does not prove real multi-monitor AX/ScreenCaptureKit coordinate correspondence or native focus-race handling. No live screenshot/input was performed; permission and full feature acceptance remain outstanding.


### Independent native coordinate and indexed mouse click

Added Mouse.swift and Sky-shaped click. The helper dispatches real mouse down/up events to the bound PID, supporting left/right/middle aliases, 1..10 clicks and modifier chords. Indexed clicks derive the current element center; geometry is now part of AX snapshots so movement invalidates input. Coordinate clicks require a screenshot associated with the current snapshot, map image pixels through contentRect to global points, and revalidate window identity/frame, scale, contentRect, focus and AX state before dispatch. No global cursor warp or AXPress substitution is used. The helper invalidates state after dispatch, and transport timeouts for mouseInput report unknown outcome.

Apple's SCContentFilter and CGEvent documentation establish screen-point contentRect and global mouse event coordinates (links in package README). Swift build/self-test pass: negative-origin Retina mapping, bounds/nonfinite rejection, event types/buttons/click counts and modifier flags are checked without posting events. Fourteen adapter/screenshot tests and reconstruction build pass. No live click was performed. Nonzero hold duration, nonmodifier held keys, drag/scroll, broader lifecycle/supervisor parity and real-device acceptance remain unfinished.

### 2026-11-05: preserve native AX context in model observations

Inspection found that the independent adapter discarded helper parentId, frame and properties when producing Sky app-state text. This hid advertised secondary actions and focused/enabled/selection state from the model, despite dispatch support. The adapter now preserves those fields and excludes secure element values defensively. A restored app.getAXState regression fixture checks hierarchy, actions, state, geometry, ordinary values and secure-value omission. All 15 native adapter/screenshot tests and the native-macos TypeScript check passed. This improves independent backend observations; it does not claim original native text serialization equivalence or real App acceptance.

Fresh daily-Chrome check still reports no Core CUA browser connection and exits before a DeepSeek request or page operation. Manual extension loading remains required; the two original search prompts remain unaccepted. Previous native click increment was verified on remote main at 9a6ac601a4dc3985915291ba600d11378ac693e1.

### 2026-11-05: independent native page scroll dispatch

Restored CUA and Sky scroll contracts were inspected: direction aliases, optional pages, indexed target or app-screenshot coordinates. Added independent Swift scrollInput, sharing click's snapshot/coordinate validation; indexed viewport ancestry and captured-window filtering avoid using unrelated overlapping windows. CGEvent scroll packets are posted only to the bound PID, using the chosen viewport extent as an explicitly independent page conversion. Positive fractional pages are supported, bounded distance and small event deltas avoid unbounded allocation and oversized packets. Original native page conversion remains opaque; real scroll effects and scaling/coalescing are not accepted.

Swift build/self-tests construct events without posting and check all direction aliases, axes, location, fractional page distance and invalid input. Seventeen adapter/screenshot tests pass, including restored CUA→Sky service scroll dispatch, snapshot consumption and rejection paths. Native-macos TypeScript check passes. Real native UI and daily Chrome still require their outstanding external setup; this increment does not establish either original search task.

### 2026-11-05: independent native coordinate drag

Inspected restored Drag declarations and binding: two screenshot-relative endpoints, no duration/button parameter. Added Swift DragEvents planning and dragInput using shared capture/snapshot validation. The plan uses left down, 20 interpolated drag moves with 10 ms waits and left up; this timing is independent, not recovered native behavior. Both endpoints validate before any input, and process launch identity is checked throughout. Cooperative interruption releases at the last dispatched point only while the target identity is valid and reports unknown outcome. Forced process termination cannot guarantee release.

Swift build, existing input self-test and new --drag-self-test passed without posting real events. The latter tests normal completion, interruption at steps 0/1/10, initial denial and target identity loss. Nineteen adapter/screenshot tests and native-macos TypeScript checks passed, including restored CUA→Sky drag routing, screenshot requirement, snapshot consumption and all four nonfinite endpoints. Real OS drag effects, original timing parity and the original browser search tasks remain unaccepted.

### 2026-11-05: native paste transaction and third-party reuse

Connected restored App.paste/Sky paste to independent pasteWithClipboard. Text, Markdown and HTML preparation reuses the earlier prototype and its marked/sanitize-html/htmlparser2 dependencies, now declared directly in @core/native-macos. Swift reuses ClipboardStore and pasteInput; the helper owns validation, lease, input verification and restoration so a caller-side exception cannot skip restoration. Paste expects a readable focused AX editor and confirms textual AXValue change; it does not prove rich-format appearance. Externally changed clipboard is preserved and returns an explicit incomplete outcome. Failure consumes the observation; no automatic replay. Forced termination remains a cleanup limitation.

Swift build and paste/clipboard/transaction self-tests passed. The transaction test uses an isolated named pasteboard, covers successful restoration, primary failure restoration, external copy preservation, cancellation and lease reuse without mutating the general clipboard. Twenty-three adapter/screenshot/paste tests and TypeScript checks passed, covering restored service routing for all formats, approval and observation requirements, failure invalidation and non-restoration. Real App insertion remains unaccepted.

Live restored runtime check after dependency integration: `npm run demo:deepseek -- --check-computer` passed, reporting 38 running applications on 2026-11-05T09:43:44Z. This was a host preflight (no model request, no App input), confirming the new package imports load through the actual MCP/runtime service.

### 2026-11-05: restored native real-App acceptance entry

Added npm run test:native:restored and an opt-in real helper test using only the owned CuaFixture PID through restored CUA and Sky. Expanded the fixture only under --acceptance with a scroll view that reports actual content-offset changes and a gesture pad that reports received drag/mouse-up events. The test requires screenshots and validates observable app effects instead of treating event dispatch as success. Coordinate targeting derives from AX window geometry and PNG dimensions, not an inverse of the helper's transform. It also exercises text editing, indexed and coordinate clicks, selection, keyboard and plain-text paste/restoration. This is not model/MCP or Chrome acceptance; rich formatting and general drag-and-drop remain outside this gate.

Executed the explicit entry: it correctly failed before launching the fixture because both native permissions are false. Authoritative evidence in reconstruction/native-live-acceptance-evidence.json records blocked, passed=[] and the timestamp. Swift fixture build and the new test's explicit TypeScript check passed. The live UI assertions remain unexecuted; no user app or general clipboard was touched during this denied run.

### 2026-11-05: native held input duration and void contract

Inspected restored duration_seconds: integer 0..30000 ms maps to Sky seconds. Added shared independent held-pair dispatch for keyboard and mouse, with pre-dispatch identity/cancellation checks and cooperative release on success/interruption only to the original live process. Mouse multi-click applies duration to each click; no native timing equivalence or key-repeat synthesis is claimed. Helper request timeout now includes valid declared hold time/count, avoiding premature retirement at the old 15-second deadline. Outer tool timeouts must still cover long repeated holds. Forced process termination cleanup remains unresolved.

Fixed set_value/type_text/press_key adapter returns to void, matching Sky declarations. Swift build, held-input/input/paste transaction self-tests passed without real input. Twenty-six adapter tests and native-macos type checking pass, covering restored duration conversion, malformed values, helper timeout budgeting and return contracts. Real held-key/button effects still require permissions and App acceptance.

### 2026-11-05: documented native keysym aliases

Inspection of restored PressKey.d.ts found explicit Control_L+a, Super_L+d, whitespace-around-plus and lowercase space contracts missing from the independent parser. Extracted KeyMapping.swift and normalized modifier aliases for both keyboard and mouse. Added X-style navigation aliases, F1–F20, keypad Enter, reverse Tab and printable US punctuation names using the locally installed Apple Carbon Events.h constants. Literal plus and Ctrl-plus remain distinguishable from malformed separators. Left/right modifier suffixes currently collapse to semantic flags; complete X keysyms, physical side distinction and non-US layout translation remain gaps.

Swift build, input/key-mapping, held-input and drag self-tests pass; tests construct mappings/events without posting them. Original documented examples, shifted punctuation, function/navigation names and invalid chords are covered. No real keyboard acceptance is claimed.

### 2026-11-05: independent supervisor session core

Added @core/runtime-supervisor as explicitly independent code, separate from recovered @core/node-repl workers. WorkerSession manages persistent pairs, serialized cells, configured service routing, pinned execution/host metadata, reset/timeout/cancellation retirement and stale response rejection. Kernel-origin privileged requests are rejected; missing host callbacks return unsupported errors instead of fabricated responses. Process isolation and descendant cleanup remain mandatory launcher responsibilities. No default demo path was changed.

Four tests pass: actual restored kernel/trusted-worker subprocesses under a test-only network-deny profile demonstrate persistent values, RPC, real elicitation accept/decline, reset, timeout and started-cell cancellation recovery; protocol tests reject direct kernel privilege requests and late post-reset host responses, and verify that close waits for an in-flight launch to retire its eventual worker pair. Native supervisor production replacement is still incomplete: sandbox/process launch, MCP adapter, native pipe streams, authenticated fetch/configuration/launch services, turn hooks, image/audio integration, timeout suspension and background lifecycle remain. Updated stale route-A decision documentation to reflect existing independent App backend and accepted authorization.

### 2026-11-05: independent supervisor process transport

Added POSIX ProcessWorkerPort to @core/runtime-supervisor and replaced the actual-worker integration test's ad hoc subprocess relay with it. Explicit command/cwd and exact env prevent ambient secret inheritance. JSONL framing handles split UTF-8, bounded frames/startup queues/input backpressure and malformed/truncated retirement. Final stdout is briefly drained before exit notification. The transport creates an owned detached process group and performs idempotent TERM/KILL cleanup; ordinary descendants are verified terminated. Darwin's observed zombie-group EPERM before Node reaps the leader is retried briefly, while persistent errors propagate.

Eleven session/transport tests and TypeScript checking pass. Production OS isolation and prevention/cleanup of descendants escaping into other groups remain incomplete; pipe closure alone is not evidence of such process termination. The default demo still uses the installed supervisor. No UI or requested search acceptance changed.

### 2026-11-05: supervisor explicit timeout suspension

Inspected restored privileged_runtime.withSuspendedTimeout: it emits execution-scoped suspend_timeout and resume_timeout in try/finally. Added ExecutionDeadline using monotonic remaining active time and nested depth. Only a current trusted RPC can pause/resume; kernel-origin or stale controls, unmatched resumes and completed RPCs with leaked suspension retire the session. Reset and close dispose active or paused deadlines. This does not establish automatic suspension for every host operation or full original Rust timeout policy parity.

Fourteen session/transport/deadline tests pass. Actual restored workers complete a nested 300 ms suspended wait under a 150 ms execution budget, then a separate cell confirms timeout resumes after suspension. Deterministic tests verify that resume preserves remaining budget rather than granting a fresh timeout. TypeScript/reconstruction build passed. Production MCP/OS isolation/host endpoint integration remains incomplete; no demo runtime replacement or UI acceptance is claimed.

### 2026-11-05: independent supervisor turn-ended routing

Implemented host-only WorkerSession.turnEnded using the observed event schema and trusted worker message/result pair. Lifecycle calls serialize with cells, preserve kernel bindings, pin host metadata and support correlated host operations/explicit timeout suspension. Session+turn duplicates share pending/successful completion; failed attempts can be explicitly retried and no automatic replay occurs. Stale/forged acknowledgements and missing acknowledgements retire workers. Deduplication is in-memory for the WorkerSession lifetime, not durable storage.

Fifteen runtime tests pass, including actual restored handlers using host elicitation and metadata, ordering before the next cell, duplicate suppression and binding preservation. Recovered hooks remain best-effort and timeout does not cancel their underlying side effects; acknowledgement does not certify all cleanup succeeded. Late background lifecycle and production MCP/isolation/host integration remain incomplete. Default demo and browser acceptance status are unchanged.

### 2026-11-05: host request correlation and unfinished completion

WorkerSession now tracks active and previously seen host request IDs separately per worker side and execution. Reusing a request ID, even after its first response, retires the session without replaying host side effects. An exec_result or turn_ended_result received with unfinished host requests rejects with explicit unknown outcome, aborts host signals, retires workers and discards eventual late replies. This is an independent fail-closed policy; it cannot undo host effects or force cancellation of a callback ignoring AbortSignal, and it does not implement the full original background-operation lifecycle.

Seventeen runtime tests pass. Actual restored workers emit an unawaited tracked image and wait for the asynchronous host acknowledgement before completing. The test callback acknowledges a data URL only; it does not implement media decoding or MCP image delivery. Protocol tests cover duplicate pending/completed IDs and premature completion for both cell and turn lifecycle, with aborted signals and no late response delivery. Default demo, daily Chrome connection and original search acceptance are unchanged.

### 2026-11-05: independent supervisor MCP adapter

Added @core/runtime-supervisor/mcp using existing MCP SDK and zod. Implements observed js/js_reset/turn_ended tool schemas, strict arguments, protocol metadata forwarding, negotiated form elicitation, request cancellation, lifecycle routing and awaited connection cleanup. Standard MCP content is validated; opaque content fails explicitly. Additional module-directory registration is not yet advertised, and non-elicitation host operations still require injection. Production launcher/stdio wiring, native pipes/media/authenticated fetch and broader lifecycle remain unfinished; default demo remains on the installed supervisor.

Nineteen runtime tests pass after build, including actual SDK Client/InMemoryTransport against restored kernel/trusted workers with a test-only network-deny launcher. Covers persistence, metadata, client accept/decline, cancellation with fresh worker generation, reset and close. Compiled @core/runtime-supervisor/mcp import/close passed. An initial run overlapped reconstruction artifact replacement and workers exited; rerunning after the build completed passed. This is not production isolation or Chrome/App/DeepSeek acceptance.

### 2026-11-05: MCP module-directory registration

Implemented the fourth observed tool, js_add_node_module_dir, through serialized WorkerSession registration. Requires an existing canonical absolute node_modules path and explicit host policy; no default authority expansion. Approved directories are sent to live kernels and replayed before execution after reset/relaunch. Stale policy completions after reset/close and cancelled registration cannot commit. Trusted service allowlisting remains separate.

Inspected kernel.ts and kernel_module_resolver.ts: the add_node_module_dir notification has no acknowledgement. Registration success therefore means validation/policy and ordered dispatch/recording, not universal import success. Twenty-one tests and reconstruction build pass; actual MCP/restored workers demonstrate failed import before registration, value 137 afterward and after reset. Tests also cover missing/denying policy, relative paths, deduplication and reset races. Canonicalization does not pin inode identity or provide production OS isolation. Default demo and browser/App acceptance remain unchanged.

### 2026-11-05: generation-scoped native pipe transport

Recovered native_pipe_bridge sends requests without exec_id and retains connections across cells. Added a separate trusted-worker generation-scoped nativePipeHost boundary instead of incorrectly treating these requests as execution-scoped host operations. Events flow during idle periods; reset/timeout/close retires sockets and drops old-generation replies/events. New UnixNativePipeHost uses Node net with explicit endpoint allowlist and bounded connections/connect time/write sizes/write queues/event chunks. No vendor-service authentication is bypassed; endpoint identity/ownership remains a production host responsibility.

Twenty-three runtime tests and reconstruction build pass. Actual MCP/restored-worker integration reaches an owned Unix echo socket, exchanges data across cells, receives idle data and confirms peer closure on cancellation. Other tests verify endpoint denial, malformed/oversized payloads, terminal close and stale-generation event suppression. Fixed initial oversized-payload handling so rejected payloads do not close otherwise valid sockets; queue overflow still terminates the connection. Compiled native-pipe-host entry imports successfully. Default demo remains unchanged; native service semantics, production isolation, media/authenticated fetch and UI/search acceptance remain incomplete.

### 2026-11-05: execution-scoped media returned to MCP

Implemented data-only emit_image/emit_audio conversion using Node's built-in data URL decoder and standard MCP content blocks. WorkerSession accumulates bounded host content per execution and rejects stale appends; normal success/error results preserve accepted media. MIME category and size limits validate envelopes, not codecs. No supervisor network/file fetching is introduced. Original interleaving/metadata parity, partial outputs on supervisor retirement and media rendering validation remain incomplete.

Twenty-five runtime tests and build pass. Actual MCP/restored kernel and trusted-service paths return exact PNG bytes; audio fixture verifies byte transport only. A trusted-service image survives a subsequent JS exception, bad MIME errors, and next-cell content remains clean. Unit coverage includes percent bytes, non-data URL denial, invalid/empty/oversized payloads and post-reset content rejection. No real screenshot/UI or playable audio acceptance is claimed; default demo remains unchanged.

### 2026-11-05: trusted response metadata reaches MCP

Inspected recovered setResponseMeta plus browser/Sky response metadata producers. Added execution-correlated trusted response_meta accumulation and MCP _meta output. Uses object-only shallow merge, JSON snapshot and 8 MiB bound; normal results override worker-supplied response_meta with the supervisor accumulation. Metadata stays separate from request context and content and does not grant authority. Cross-RPC merge/limit are independent host policies; Rust parity and response traces/telemetry remain outstanding.

Twenty-six runtime tests and build pass. Real MCP/restored-worker calls verify two RPC metadata emissions merge top-level fields, replace nested values and do not leak into a later cell. Protocol tests reject kernel-origin, stale and malformed metadata. No browser/App UI, production isolation or default-demo replacement claim is added.

### 2026-11-05: external stdio MCP and graceful shutdown

Added @core/runtime-supervisor/stdio using the existing SDK transport. Explicit SessionOptions remain mandatory; no implicit launcher, sandbox or environment policy is added. The wrapper handles EOF, stream closure/errors and optional SIGINT/SIGTERM with idempotent awaited cleanup and listener removal, returning close/closed to the host. stdout remains MCP-only. Forced termination and unresponsive injected dependencies remain production lifecycle gaps.

Twenty-eight runtime tests and build pass. Real external SDK clients spawn the compiled host and restored workers, verify persistent 40→42 execution, then exercise EOF and SIGTERM. A marker written after closed resolves plus ESRCH for both worker PIDs demonstrates awaited cleanup. Fixture startup initially failed because NODE_REPL_TRUSTED_SERVICES was missing; supplying the required empty map fixed it. Production launch policy, active-operation signal tests, authentication and real UI acceptance remain incomplete; default demo is unchanged.

### 2026-11-05: correct background authenticated-fetch lifetime

Inspected recovered privileged_host_operations: nodeRepl.fetch is intentionally not in the cell drain set. Replaced its overly strict execution-scoped host routing with a separate trusted generation-scoped request manager. Metadata follows the originating execution, late/in-flight responses can settle across cells, reset/timeout/close aborts the generation signal and stale responses are discarded. Explicit context/concurrency/ID budgets bound retention. Actual authenticated transport and credential/endpoint policy still require injected hostRequest; no default network or synthetic authorization is added.

Thirty runtime tests and build pass. Real MCP/restored workers use an explicitly authorized local HTTP fixture: current/next cells complete while HTTP is delayed, a subsequent RPC retrieves the body, and reset cancels another request with observed server closure. Unit tests cover context eviction, duplicate IDs and late replies. Original Rust retention/turn-end semantics and production authentication remain unverified. Default demo and browser/App acceptance are unchanged.

### 2026-11-05: deny-default macOS sandbox bootstrap validation

Added independent C/N-API sandbox bridge, explicit build/test entries and a trusted worker bootstrap that applies the host profile before importing worker code. Failure stops loading; no permissive fallback. Pre-exec restricted-read profiles aborted this local Node in dyld ignition startup; a read-all diagnostic worked but is not used in the implementation. Applying policy after trusted loader/addon initialization enabled the restricted worker run. Bootstrap profile/addon env variables are removed before worker execution.

The explicit npm run test:sandbox gate built the native addon and reconstruction, then passed both OS integration tests (no skips): authorized scratch I/O succeeds; outside sentinel reads, process spawn and local network connect fail EPERM, with zero accepted connections. Restored kernel/trusted workers return 42 and a fixture RPC under read-only worker/dependency/service roots and separate writable dirs, with explicit ancestor metadata grants for canonicalization. The binary is Git-ignored. This is a sandbox bootstrap feasibility gate, not a production launcher or comprehensive escape audit; SDK deprecation, environment/preload policy, filesystem root validation, service coverage and forced-termination containment remain unresolved. Default demo is unchanged.

### 2026-11-05: explicit sandbox launcher configuration

Added exported sandbox-launcher API with canonical existing path validation, read/write separation, fixed Node startup flags and exact allowlisted worker environment. Replaced hand-built OS integration launcher with this reusable entry. Runtime supervisor type check and both explicit OS tests pass (no skips), including rejected NODE_OPTIONS/root/overlap configuration and EPERM on kernel reads of trusted-worker scratch. Earlier full reconstruction build passed after the launcher implementation. Trusted code path replacement races, overly broad caller-chosen read roots, production service configuration and deprecated sandbox API portability remain unresolved; this is not daily Chrome acceptance or a default demo switch.

### 2026-11-05: restored CUA/browser service sandbox startup

Extended the explicit sandbox integration from fixture-only service routing to staged real @core/cua and @core/browser-desktop packages and dependencies. Actual browser setup returns its API manifest; importing tinyskyAlt initializes the public getTab/createBrowserTab functions through the recovered RPC path. Explicit launcher environment supports module directories and CUA surface selection without ambient inheritance. Two OS tests pass, including existing denial probes. This is real service initialization only; no browser connection or UI action is claimed. Default demo remains unchanged.

### 2026-11-05: sandboxed authenticated native-host discovery

Added explicit independent-browser environment keys to the launcher and extended the OS integration through the packaged native-host browser service, recovered privileged pipe API, WorkerSession and allowlisted UnixNativePipeHost. Actual local capability authentication, fixture-browser discovery and bidirectional ping pass. Kernel reads of the endpoint capability descriptor fail EPERM. The extension is a controlled protocol peer (no real Chrome/page), and config reads are explicitly test-only with full CDP disabled. A failed discovery exposed the required host config interface; production implementation is still outstanding. Canonical short socket paths avoid alias metadata denial and macOS socket path-length limits without broader grants. Default demo unchanged.

### 2026-11-05: explicit TOML configuration adapter

Added reusable read-only configuration host with exact file/path/cwd mapping, smol-toml reuse, bounded reads, final-symlink rejection and redacted parse failures. Config/requirements read failures propagate; no empty-policy fallback. All writes and layered requests remain explicitly unsupported. Sandboxed browser discovery now uses real fixture TOML reads through the adapter; enterprise full-CDP restriction uses the recovered featureRequirements.browser_use_full_cdp_access field. Tests cover restrictions, refresh, traversal/scope/layer/write refusal, missing/invalid/oversized sources and non-finite TOML values. Production source selection, config writes/layers and real Chrome operations remain outstanding; default demo unchanged.

### 2026-11-05: composed independent sandboxed MCP entry

Added sandbox-runtime exports composing worker policy validation, paired process launch, read-only config and allowlisted native pipes with the existing MCP stdio lifecycle. Both policies validate before spawn; disjoint scratch/read boundaries and exact service-map alignment are checked. Partial spawn failure closes the first process. The explicit OS gate builds and passes both tests; its browser integration additionally starts the compiled entry in an external process and uses the standard MCP client to import CUA and discover the controlled authenticated extension peer. No installed supervisor is used in this new test path. Deployment resource ownership, config writes/authenticated network and real Chrome/App/DeepSeek acceptance remain incomplete; default demo unchanged.

### 2026-11-05: opt-in mapped preference persistence

Added persistent-config-host and writablePreferencePaths composition option. Explicit existing preference files only; protected config/requirements and link aliases reject. Per-adapter write serialization, 0600 temporary files, content sync/atomic rename, cancellation checks and redacted serialization errors are implemented using smol-toml. Default remains read-only. Type check, two config tests and full reconstruction/native sandbox build plus two OS tests pass; a sandboxed recovered trusted worker writes a harmless marker via the actual config RPC, and authenticated fixture-browser discovery still succeeds. Real elicitation/persistent-approval acceptance, dynamic session-file creation, cross-process updates and crash/power-loss guarantees are not claimed. Default DeepSeek demo unchanged.

### 2026-11-05: live DeepSeek browser path — system proxy fix

Reprioritized real user-task acceptance over independent-supervisor expansion. Verified daily-Chrome native-host registration, executable and extension origin alignment, but no connected endpoint exists in the configured installation. In an isolated Chromium profile with the full extension, the real DeepSeek Baidu prompt reached the homepage/input but repeatedly incurred ~30-second authenticated site-status transport failures; 90- and 180-second observation windows failed.

The Mac's enabled HTTP/HTTPS system proxy was 127.0.0.1:7890 while the MCP child had no proxy variables. A credential-free transport probe timed out directly (12 seconds), but the configured proxy returned HTTP 405 to HEAD in ~0.9 seconds. Added demo-only explicit-proxy inheritance / macOS static HTTP proxy resolution. After this fix the unchanged site-status policy returned HTTP 200 in roughly 0.4–0.7 seconds, and real DeepSeek navigation/fill/submit finished in a ~31-second run. Baidu redirected to its human-verification origin; the access gate refused that origin and the agent reported no result. Search-result acceptance therefore still FAILS; CAPTCHA was not bypassed and no first result is claimed. Daily user Chrome remains unconnected. Two proxy tests and agent-loop typecheck pass. PAC, SOCKS-only/IPv6 proxy and system exception-list translation are not implemented. Caller-supplied proxy env takes precedence. Default supervisor unchanged.

### 2026-11-05 — user acceptance order and native application startup

The user now requires both extension-free Playwright/CDP and native desktop operation before the next experience handoff. The managed extension entry remains internal validation, not that handoff. Its actual CLI search returned DeepSeek's first DuckDuckGo result after Google verification and an incomplete Bing page. It still uses the project extension, installed supervisor and restored browser/CUA stack; it is not extension-free CDP.

Native startup previously required a running process. The independent helper now resolves installed app names, bundle IDs or paths via LaunchServices, validates the approved path/bundle identity, launches through NSWorkspace, then binds the running process. The host requests write authorization before launch and separately authorizes observation. Paths are normalized consistently across resolution, launch and bind. This is independently authored native integration, not recovered vendor implementation. Name lookup currently uses Apple's deprecated fullPath(forApplication:) compatibility API; explicit bundle ID/path lookup does not.

Validation: Swift build; 27 native client/screenshot/paste tests; actual owned temporary .app launch/identity rejection/bind test passed. The live test initially exposed /tmp versus /private/tmp identity mismatch; normalizing running-app paths fixed it. No daily application was modified. Current helper reports Accessibility=false and ScreenRecording=false, so desktop screenshot/input and full DeepSeek desktop acceptance remain unverified. Extension-free CDP is still not connected to the restored MCP service. Do not mark either route complete from these component checks.

### 2026-11-05 — extension-free CDP transport evidence

Added independent `@core/cdp-host` workspace with Playwright-owned Chromium and loopback CDP WebSocket transport. A real no-extension local-page test passed navigation, CDP text insertion, DOM button activation, Page event delivery and screenshot PNG validation; remote/credential-bearing endpoint validation also passed. Type checks passed for this package and the native macOS adapter. This is not yet registered as the restored service's provider and is not a DeepSeek end-to-end pass. Next work is provider RPC/session/tab mapping and enforcing the restored network constraints before exposing this route to the model. User handoff remains gated on both browser and native desktop real end-to-end acceptance.

### 2026-11-05 — CDP provider reaches restored MCP/CUA and real DeepSeek

The independent CDP provider now speaks the existing browser RPC protocol over @core/native-host authentication, identifies itself as `cdp`, assigns numeric tab handles and checks session ownership. Actual demo `--check-browser` discovered it through the installed supervisor/restored CUA. Deterministic MCP/CUA local navigation, click and screenshot passed. Real DeepSeek -> MCP -> restored CUA -> CDP -> owned extension-free Chromium also completed a local-page button task and returned observed `action-completed-marker` (final validation about 14 seconds). Model input/output was real; only the owned local test origin was approved by the test harness.

Additional testing found two adapter defects: querying page target identity inside a paused network route could deadlock, and Playwright routing alone did not stop redirected requests. Target mapping now occurs before navigation, and restored network predicates are enforced with both context routing and CDP Fetch. Tests pass for allowed navigation, denied initial navigation, foreign-session rejection, redirected denied-origin access and a descendant frame. WebSocket requests remain blocked, service workers disabled. Nested target lifecycle/interception, tab finalization and external search are still incomplete. No claim of full compatibility or desktop readiness is made, and no user experience handoff has occurred.

### 2026-11-05 — cross-site frames and external CDP search

Added nested target/session ownership and real cross-site iframe validation. CDP auto-attachment pauses new targets until the provider installs request interception; detach routes through the owning parent session (a real test caught that using the browser root produced "No session with given id"). Cross-site frame read/detach/stale-session rejection, provider policy tests, and restored CUA regression pass.

The exact generic search prompt ran through real DeepSeek and the extension-free CDP provider: Bing returned "DeepSeek - Into the Unknown". Actual result link decoded to https://chat.deepseek.com/sign_in; the model shortened its answer to the homepage, so exact URL fidelity remains an identified output issue. The full run took about 20 seconds and captured screenshots. Evidence: /tmp/cdp-deepseek-search.log and the public-page snapshot directory printed there. This is an owned Chromium, not the user's existing Chrome. Baidu human verification is not declared solved.

Added explicit operator commands `permissions:computer` and `check:computer-permissions`; Swift build passed, read-only permission check still reports both false. The request command has not been auto-invoked. User granting permissions is required for desktop acceptance, and launcher-specific attribution must be checked again in the actual MCP runtime.

### 2026-11-05 — exact search-link evidence

Agent instructions now require preserving full observed result URLs or explicitly decoded search redirect destinations. A real CDP/DeepSeek search returned `https://chat.deepseek.com/sign_in` plus the exact observed Bing redirect. The initial test rejected this run because it only recognized AX headings; inspection proved the tool returned structured DOM records with title/dest. Test-only evidence extraction now supports both formats, rejects clipped Bing redirects and rejects structured destinations without a result title. Two parser tests pass; the saved actual tool results and answer pass the strengthened exact-link assertion offline. This is an assertion-format fix grounded in the saved observation, not substitution of an expected answer. The live run did not render Bing's result area visibly, although DOM results were available; that observation/visual distinction remains visible in the model answer.

### 2026-11-05 — CDP tab finalization

The provider reuses the restored `validateFinalizedTabs` and `partitionFinalizedTabs` functions (new package exports, original function bodies unchanged). It supports finalizing/marking tabs, closing unmarked agent-created tabs, releasing deliverables and retaining handoff tabs. Actual-browser tests reject unknown keep IDs, verify temporary-tab closure and verify that a delivered tab survives a later user-tab claim/end-turn. The latter test exposed stale agent-origin metadata; release now converts ownership origin to user. Restored CUA navigation/click/screenshot regression passed; provider tests and type check passed after the ownership correction. The demo's owned browser still closes as a whole at process exit; tab retention within a running host is distinct from profile persistence.

### 2026-11-05 — actual CDP CLI acceptance

Added `--cdp-browser` deployment selection to the existing demo script and `@core/agent-loop` CDP entry; it reuses project .env loading, model/AgentLoop, restored MCP runtime, terminal traces and terminal elicitation. The entry validates the environment before browser startup, clears extension endpoint selection and advertises `cdp` only. The owned browser remains temporary/visible and closes on exit.

Ran the actual npm entry with `--check-browser`, then the original generic search prompt in a real terminal. Bing's visible results were incomplete; DeepSeek used DuckDuckGo and returned the observed first result `DeepSeek | API Platform`, https://www.deepseek.com/en/platform/. Exact search-site permission requests were accepted in the terminal for this authorized search, without a test elicitation callback. Inspected the produced screenshot: the first result is visibly the API Platform link. Command exited 0 and no owned CDP directories remained (log files excluded from that check). This verifies the CLI route, not desktop UI permissions or daily Chrome profile control. Site result ordering varies and is not pinned to a preset expected answer.

### 2026-11-05 — ended-turn guard and launcher recheck

CDP action/claim/create/finalize/name operations now reject a previously ended session/turn pair; repeated cleanup remains idempotent. Actual-browser provider tests cover stale create/claim rejection and release/reclaim semantics, alongside restored CUA navigation/click/screenshot regression (three tests passed), and the package type check passed.

Read-only desktop permission recheck still reports Accessibility=false and ScreenRecording=false. A read-only process check found one existing Google Chrome main process with remote-debugging-port=0, but its profile belongs to a stepwise temporary workspace and its DevToolsActivePort descriptor is absent. This does not establish a connectable daily Chrome backend; no action was taken on that browser.

### 2026-11-05 — real native DeepSeek acceptance prepared, not passed

Added an explicit `test:native-deepseek` gate for the full model/MCP/CUA/native path, including launching an initially stopped owned .app, marker input, Save click, returned text and real screenshot. It validates the result independently through native AX and PNG inspection and limits test elicitation to the unique owned bundle. Type-check passes. An actual enabled execution failed immediately and correctly on Accessibility=false/ScreenRecording=false, before model access or app launch. The task execution portion is therefore still unverified; this is not a desktop end-to-end pass. The operator authorization request remains pending.

### 2026-11-05 — external CDP connection ownership

Added a separate `attachCdpBrowser` helper using upstream Playwright's `connectOverCDP` with `noDefaults:true`, based on the locally installed upstream implementation/types. A live second-client connection to a test-owned browser verifies target discovery and that repeated client disconnect preserves browser process, tab IDs and page contents. Package type check and the live ownership test pass. This is an attachment-resource test, not daily Chrome/MCP end-to-end acceptance. Provider policy routing remains context-wide for owned browsers; existing-browser integration must isolate changes to controlled pages before exposing an endpoint selector in the CLI.

### 2026-11-05 — page-scoped HTTP interception primitive

Added `installPageHttpRouting`, a reversible per-page HTTP routing lease that chains allowed requests through existing Playwright handlers and removes only its own handler on release. A real two-client/two-tab test proves a denied request on the controlled page is blocked, an unrelated page still reaches the server, preexisting handlers still execute, release restores requests, and disconnect preserves both tabs. Type check and the live test pass. This primitive is not yet wired into external-browser MCP deployment; it does not claim redirect, WebSocket, service-worker or popup enforcement by itself. The restored CDP policy layer must remain part of the composed backend.

### 2026-11-05 — oversized CDP console event disconnect fixed

A real DeepSeek/Baidu reproduction identified `Runtime.consoleAPICalled` exceeding
the native-pipe 1 MiB frame limit. The notification exception previously closed
the entire CDP connection. Console events above 256 KiB are now replaced with an
explicit omission warning, leaving the shared transport limit unchanged. Event
forwarding also reuses the restored extension event-security filter. Event
handler errors now report their method and reason before closing.

Five targeted real-browser/provider tests pass, including a 1.8 MB Unicode
console event followed by actual input, button activation, PNG capture and a
working provider connection; cross-site iframe and denied-network regressions
also pass. CDP package typecheck passes.

The exact external DeepSeek/Baidu path was rerun after the fix: homepage opened,
search submitted, redirected captcha page read successfully, model reported
human verification and stopped. No CDP disconnect occurred. This verifies the
previous disconnect fix, NOT a successful retrieval of Baidu's first result;
that run remains blocked by the site's human verification. Local debug traces
remain ignored and are not committed.

### 2026-11-05 — updated trusted-worker protocol restoration

Restored the installed worker's `private_keys` initialization message into
readable TypeScript: crypto KeyObjects are held by the trusted worker, exposed
only through a frozen get-only privateKeys bridge on the trusted nodeRepl.
Initialization is accepted once before other messages; duplicate, late or
malformed initialization exits with a fixed diagnostic that omits key material.
No key is copied to the untrusted kernel nodeRepl. Also aligned trusted-service
request spans and the upstream service/operation telemetry allowlists.

A differential test runs original extracted and restored workers with an
in-memory generated fixture key, verifies actual signing, absent-key behavior,
repeated/late/malformed initialization and secret-free failures. It and three
existing trusted-worker differential tests pass; TypeScript check passes.
This closes these particular source deltas, not all new tracing features or the
native supervisor implementation gap. No production keys or debug logs are
committed.

All five actual native-supervisor MCP integration cases also pass after this change, including reset/cancellation, trusted RPC and allowed/denied browser operations.

### 2026-11-05 — current tracing and image-error source deltas

Ported the remaining observed tracing deltas from the locally extracted current
JS into typed TS: bounded UTF-8 parent trace propagation, error-attribute
callbacks isolated from execution failures, and the upstream error-name
allowlist. Added `NODE_REPL_IMAGE_UNSUPPORTED_KEYS` only to the image-object
extra-field failure, preserving ordinary unsupported-value behavior.

Sixteen targeted tests pass against original extracted code and restored code,
including parent trace byte boundaries, custom error-name redaction, callback
failure isolation, image error codes, actual rebuilt workers and private-key
bootstrap. Reconstruction build and node-repl typecheck pass. This narrows the
observed installed-JS version gap; it does not finish native supervisor source
restoration or resolve the independent desktop permission acceptance gate.

### 2026-11-06 — explicit external CDP deployment

Wired `attachCdpBrowser` into the actual authenticated host and demo through
`--cdp-endpoint`. Attached deployments use page leases instead of context-wide
routing, preserve existing tabs/browser on disconnect, and label the backend as
an attached browser. Owned temporary browser behavior is retained. The runtime
prompt now accurately says temporary browsers close after the run.

A real service-worker fixture exposed that `Network.setBypassServiceWorker`
requires enabling the Network domain first; this is fixed and verified. The
controlled page uses network fetch while unrelated pages still use their worker;
detach restores the worker path and WebSocket access. Disabling this network
lease through page commands is rejected. Background user workers, preexisting
connections, and extensions are not claimed to be contained by this page lease.

The CLI requires an explicit existing local browser WebSocket endpoint. It does
not silently restart or reconfigure the user's daily Chrome. Desktop permission
acceptance remains separate and unresolved.

Validation: both CDP and agent-loop typechecks pass. Nine targeted integration
cases pass when run serially; CLI tests rebuild shared dist, so running them
concurrently with runtime-staging tests can race and produce a missing-module
failure. Actual DeepSeek through the attached browser deployment also completed
the owned local click/read task and returned the independently observed
`action-completed-marker`. These runs used test-owned Chromium as the external
browser, not the user's daily profile.

### 2026-11-06 — architecture review document refreshed

Updated the original Lark architecture document's opening section to the current
implementation and acceptance status, preserving the historical chapters. It
now separates extension, owned CDP, attached CDP and native macOS paths, states
the remaining installed-supervisor dependency, explains local debug logs, and
lists uncompleted acceptance gates. Added runtime-loading and AgentLoop sequence
boards. Remote fetch verifies revision 443 with two boards and the four-path
status table; previews were exported for visual inspection.

Current section: https://my.feishu.cn/docx/YTspdmiproITEexFFNBcyHGtn2b#doxcn2cOz8MuLZR6O0hN43UuNCs

### 2026-11-06 — non-interactive approval capability corrected

A fresh external search reproduction found the default extension disconnected.
The separate owned CDP run connected successfully, but a new origin approval
failed: redirected non-TTY stdin/stderr cannot present the terminal form. The
demo incorrectly advertised elicitation unconditionally and called an undefined
terminal handler. It now constructs the handler once, advertises the capability
only when available, and records/reports its availability without granting any
approval automatically. A real MCP child-process regression checks that a
non-interactive demo does not advertise an approval UI. This fixes capability
reporting, not the earlier twelve-step convergence issue or site authorization.

### 2026-11-06 — bounded progress report after action budget exhaustion

The demo now opts into one tools-disabled model request after its existing 12
rounds are exhausted. It includes the final observation, never executes returned
tool calls, and retains typed budget failure plus nonzero demo exit. Generic
AgentLoop behavior stays opt-in. Model wording is not a trusted completion
verdict. Cancellation, empty/invalid summaries and provider errors retain
cleanup and failure semantics. Normal decisions now receive budget information.

Seventeen targeted tests pass, including an actual HTTP adapter exchange proving
no tools are offered in summarization, last evidence survives, and no extra
actions run. Agent-loop typecheck passes. A real DeepSeek fixture run returned
the independently supplied marker after exactly one observation, one summary
request and one endTurn; the host still rejected the run as budget-exhausted.
This is provider/loop validation, not browser or native App acceptance.

### 2026-11-06 — CDP action selection verified with visible/hidden fields

Added demo-host CDP guidance for unsupported visibility options, DOM-only input,
and role-based visible control selection. Restored CUA semantics/docs are not
modified. A new opt-in live DeepSeek fixture traverses real restored MCP and CDP,
submits a random value through a visible textarea alongside a hidden legacy
input, and reads a result-only random marker. Independent HTTP submission checks
pass; this run used five decisions and had zero tool errors.

The exact external Baidu search was rerun through the interactive CLI. It used
four model decisions with zero tool errors, compared with twelve decisions and
three errors in the immediately preceding reproduction. Navigation and search
submission succeeded; Baidu returned CAPTCHA and the model stopped accurately.
No first-result URL was obtained. This is a single-run comparison, not proof of
general convergence. Three related actual-MCP/attached-provider regression cases
and the agent-loop typecheck pass. Private traces remain local and ignored.

### 2026-11-06 — independent supervisor real-browser sandbox acceptance

Added a real MCP-to-CDP local-page test using the independent supervisor and
system Node, with restored workers under separate OS sandboxes. The installed
supervisor is not involved. Navigation, actual form input/submission, independent
HTTP verification, DOM output and screenshot pass. Explicit session/global
preference files and origin-scoped fixture elicitation are required.

The test exposed and fixed canonical endpoint-path mismatch on macOS, an overly
small 256 KiB native-pipe write cap that rejected the ~315 KB injected browser
script, and dropped kernel named_outputs in MCP conversion. Writes now fit a
full existing 1 MiB frame plus its header, with write/queue limits retained;
named outputs are forwarded and malformed values rejected. Eight focused tests,
supervisor/CDP typechecks and reconstruction build pass. The sandbox npm gate
includes the new test. Default demo still uses the installed supervisor; external
service authentication/deployment and native desktop acceptance remain open.

### 2026-11-06 — real DeepSeek through independent sandbox runtime

Extended the real-browser sandbox gate with an opt-in actual DeepSeek path.
The model fills a random query, submits a real form, reads an independently
generated result-only marker and captures an image; server-side submission and
MCP image output are checked independently. The latest run passes in four model
decisions with zero tool errors. An initial failed efficiency assertion revealed
that the test caller dropped import-time CUA API docs; preserving the complete
bootstrap exchange in initialMessages fixes that integration error. Updated the
agent integration guide from the legacy QuickJS path to current package/runtime
contracts and acceptance limits. No default-supervisor replacement or external
service/native App completion is claimed.

### 2026-11-06 — authenticated fetch callback in sandbox composition

Added an explicit optional authenticatedFetch host callback to SandboxedRuntimeOptions.
Only authenticated_fetch messages route there; configuration stays separately
scoped, and an absent/invalid callback fails rather than selecting a network
fallback. Credential/endpoint/redirect/body policy remains host-owned.

The real macOS sandbox integration now issues restored nodeRepl.fetch through
the host to a local endpoint that checks a random host-only bearer credential.
Approved request/response succeeds, a different URL is denied without a network
hit, and the credential is absent from the worker result. Six focused sandbox,
real-browser and MCP tests pass alongside typecheck/build. This is the host
integration boundary, not production vendor authentication or external-site
acceptance; default demo deployment is unchanged.

## Rust supervisor: between-call native pipe routing

The Rust MCP owner now drains worker/native-pipe events between tool calls.
Incoming calls wake the observation wait; an in-progress transport write finishes
before the next caller takes the session lock. Shutdown cancels and retires the
pair. An idle routing error resets the pair rather than reusing partial state.
The 30-second background dispatch bound and one-second idle observation bound
are independent adapter policies, not recovered vendor constants.

The external MCP fixture now connects a real Unix socket through the restored
trusted worker, returns from the initiating tool call, sends a peer message and
receives the worker's reply without issuing another MCP call. Reset closes the
old socket. Both EOF and SIGTERM cases pass, retaining cancellation and owned
worker cleanup checks. The workers remain network-denied; Rust owns the allowed
socket transport. This proves idle pipe delivery, not full browser acceptance or
authenticated-fetch background routing. Production sandbox composition and
replacement of the transitional TS supervisor remain open.

## Rust authenticated-fetch routing (2026-11-06)

Re-extracted the current installed supervisor's embedded JS into a local temporary
directory and confirmed `privileged-node-repl.js` emits authenticated_fetch with
id, exec_id and request (method/url/header pairs/optional base64 body), then waits
for the correlated response. This verifies the JS boundary, not native source.

`background_host.rs` now retains originating host metadata and callback per
execution, authorizes a context only after trusted dispatch (or host lifecycle),
rejects duplicate request identities, routes callback completion during active
execution or between cells, and cancels/awaits callbacks on pair reset. Background
callbacks cannot append MCP content. Context/task/request limits reproduce the
independent TS adapter's bounds, not proven original Rust constants. No HTTP
client, ambient credential lookup or approval bypass is introduced: the explicit
host callback still owns authentication, endpoint and redirect policy.

27 Rust tests and the 2 external MCP tests pass. New real restored-worker cases
cover allowed/denied fetch and a timer-triggered fetch after the initiating cell
returns and a later cell runs; idle routing writes the expected response while
retaining the original metadata. Unit cases cover replay rejection and cancellation
of an in-flight callback. These fixture responses are not live authenticated HTTP
acceptance. Production host authentication composition and Rust sandbox/launcher
integration are still outstanding; the default demo entry point is unchanged.

## Rust-owned sandbox policy and MCP launch (2026-11-06)

`sandbox_launcher.rs` now constructs the exact child environment and explicit
Seatbelt read/scratch grants, validates absolute canonical paths and disjoint
writable/code roots, rejects loader environment overrides, and returns the Rust
ProcessSpec. The MCP harness accepts `{ "sandbox": { ... } }` worker specs so
this policy construction no longer depends on the TS launcher. Explicit raw
worker specs remain available to integration callers and are not sandbox claims.

29 Rust tests pass, including actual macOS scratch read/write success and EPERM
for outside-file reads, subprocess launch and loopback networking (zero accepted
connections). The two existing external MCP EOF/SIGTERM cases now use this
Rust-generated deny-default policy with separate kernel/trusted scratch roots,
not the earlier allow-default/network-deny fixture. They exercise actual restored
workers, modules, service RPC, elicitation, media, pipe events, reset/cancellation
and process retirement under the generated policy.

The post-initialization C/N-API bridge and TS bootstrap are still explicit
transitional dependencies. They have not been restored from original native
source or migrated by this change. Applying deny-default before Node's native
loader previously failed locally; this change preserves the verified ordering:
trusted Node initialization, apply policy, then import worker code. Original
embedded sandbox_state.rs paths establish Rust ownership but do not prove this
specific policy or ordering. Immutable code/scratch parents remain caller-owned;
path grants are canonicalized, not inode-pinned against concurrent replacement.

Remaining: native bridge/bootstrap ownership, production browser runtime assembly
and authenticated host composition, full browser/App acceptance, and removal of
the transitional TS path after entry-point migration. The default demo is unchanged.

## Rust sandbox bridge replaces C (2026-11-06)

The native Seatbelt bridge is now Rust (`native/macos-sandbox/src/lib.rs`), with
stable N-API exports and direct bindings to the existing macOS sandbox API. The
old C file is removed; `npm run build:sandbox` now builds the locked Rust crate
and stages the same sandbox.node path. This needs Cargo, not matching Node
headers. No new third-party implementation of Node or Seatbelt is introduced.

29 Rust supervisor tests, two sandboxed external MCP tests and two direct bridge
integration cases pass. Invalid policy/argument rejection and actual outside-file,
spawn and network denial were exercised with the Rust-produced binary. These are
local controlled fixtures. The loader bootstrap remains TS; production browser
composition and original policy/initialization-order fidelity remain outstanding.

## Rust supervisor browser entry (2026-11-06)

Build the native runtime with `npm run build:rust-runtime`, then select it with
`CUA_RUNTIME_SUPERVISOR=rust`. The existing default remains installed; the
`independent` option still selects the transitional TypeScript supervisor for
comparison. Rust mode writes a private explicit runtime spec and launches the
built native executable, preserving the same restored JS workers/package staging,
configured endpoints, host callbacks and Rust-owned sandbox policy. Runtime
assembly is still caller-side TS; this is not a claim of recovered native source.

The isolated real Chromium fixture now supports `CUA_TEST_RUST_RUNTIME=1`.
The Rust path passes fill/click/AX-read/screenshot with independently checked
server submission. With `CUA_LIVE_DEEPSEEK_TEST=1`, actual DeepSeek also passes the
same randomized task in five model decisions with zero tool errors and an image
result. The actual CLI `--cdp-browser --check-browser` succeeds with Rust selected
and an intentionally nonexistent installed-supervisor path. Agent-loop typecheck
passes. No daily Chrome, login profile or real desktop app was manipulated.

This verifies the controlled CDP deployment, not original Codex fallback policy.
Original-style extension and native App acceptance, source parity, production
credential composition, complete language audit and retirement of old TS native
implementations remain outstanding. Default selection is not switched yet.

## Rust extension-chain acceptance (2026-11-06)

The independent MCP browser fixture now explicitly selects installed, transitional
TS, or Rust supervisors; unknown selections fail rather than silently testing a
different runtime. Both native-messaging and full packaged extensions pass the
Rust path in temporary Chromium profiles. This exercises extension-started host
registration, endpoint discovery/authentication, actual browser tab notifications,
CUA navigation/click/read/screenshot and MCP lifecycle. It does not manipulate the
user's daily Chrome or establish missing-extension/cold-start UI acceptance.

The controlled page now generates a random action marker and its button reports
that marker to the local HTTP server. Live-model answers must contain the exact
random marker, and the server must independently observe the click. This avoids
relying on a fixed model answer or external Playwright page enumeration: newly
created session pages were not visible to that enumeration. The HTTP evidence remains available after AgentLoop performs endTurn cleanup. Two deterministic and two actual DeepSeek extension
cases pass. The latest live run recovered from two unsupported accessibility-input
calls by using the exposed Playwright API; it is not a zero-tool-error result.

`npm run test:rust-browser` builds the prerequisites and runs isolated CDP plus
both extension fixtures. Set CUA_LIVE_DEEPSEEK_TEST=1 for model-driven cases (uses
local .env and API quota). Native App, daily Chrome startup, production host
language provenance and full source-behavior parity remain separate open gates.

## Browser input capability guidance (2026-11-06)

Direct comparison with the installed `cua/.../tinysky_alt/bind_tab.js` confirms
that original top-level click/type wrappers remain present even when tab.ax is
absent; they reject accessibility input, while getAXState falls back to a DOM
snapshot. The restored implementation matches this behavior. Do not manufacture
numeric indices or add a fallback input implementation to hide the distinction.

Added caller-only BROWSER_INPUT_CONTEXT to the demo and browser model fixtures:
wrappers do not prove capability, DOM snapshot line order is not an AX index,
and absent AX requires documented Playwright input. Restored CUA APIs/docs and
native App input semantics are unchanged. Two original-source differential
browser binding tests and agent-loop typecheck pass. Both real DeepSeek extension
fixtures still pass randomized answer plus server-click verification; one tool
capability mistake still occurred and was recovered. Guidance is a mitigation,
not proof that the model will never choose the wrong API.

Also corrected the acceptance callback name to verifyEvidence. AgentLoop.run
itself calls endTurn before returning, so a callback after it cannot be called
before-turn-end verification. Persistent local HTTP click evidence remains valid
across that lifecycle; live browser-tab enumeration after run is not equivalent.

## Native desktop language evidence and text migration (2026-11-06)

Static inspection located the bundled SkyComputerUseService executable under
@oai/sky/Codex Computer Use.app. It contains ComputerUse/ComputerUseIPCServer.swift,
service-specific Swift source paths and Swift runtime links. The reproducible
`audit-desktop-language.py` records the binary hash and restricted provenance in
`desktop-language-evidence.json`. This establishes native Swift participation,
not recovered native bodies or the language of every dependency.

The restored JS getAppState/window_result path receives native skyshot.text.
Our independent client previously rendered its own AX element text in TS. That
rendering, secure-value omission, warnings and missing-screenshot text now live in
Swift ObservationText.swift; the TS adapter validates and preserves native text.
Missing native text fails before enabling input state, so older helper binaries
must be rebuilt with `npm run build:native`. No guessed native-to-TS formatter
fallback remains. The formatter still expresses the independent helper contract,
not original text/diff parity.

Swift build and observation-text self-test pass (hierarchy/actions/selection,
escaping/Unicode, secure-value omission and warnings), as do 28 TS adapter tests
and native-macos typecheck. Rebuilding reconstructed packages passes. Read-only
permission status for this host remains accessibility=false, screenRecording=false;
no real App UI acceptance or TCC change is claimed. Native process ownership,
Swift service IPC alignment and Rust/App runtime composition remain open.

## Swift service using the original Sky wire contract (2026-11-06)

`SkyIPC.swift` adds an explicitly selected `--sky-socket <absolute path>` mode to
the independent Swift helper. It implements the observed four-byte little-endian
8 MiB-bounded JSON-RPC frames, CodexComputerUseIPC-5 ping/version exchange and
request envelope. It validates negotiation/deadline, rejects unknown operations,
and serves ComputerUseIPCListAppsRequest through NSWorkspace. No vendor service
is launched or impersonated. A private user-owned socket parent and same-user
peer are required. This is not the vendor's sender authentication/session policy.

Four live protocol cases pass: both the installed JS MacComputerUseClient and
restored TS client can ping/list apps; malformed ordering/version/deadline and
oversized frames fail; and actual restored CUA inventory traverses MCP, Rust's
sandboxed workers, the unchanged @core/sky/service, Rust native-pipe routing and
the Swift endpoint. Closing the Rust workers closes the connection, the owned
one-connection Swift process exits normally, and its socket is removed. App names
and machine inventory are not published in the acceptance report. 29 Rust tests,
28 adapter tests and the Swift text self-test also pass.

Run `npm run test:native-ipc` on this Mac to build prerequisites and enable these
otherwise skipped integration cases. The original-JS comparison requires the
installed ChatGPT app artifact. No model request, app launch, input, screenshot
or permission prompt is performed by this gate.

This is a protocol/ownership migration checkpoint, not full native App support.
Policy requests, app startup/state/action/audio dispatch and original formatting
still need native implementation; unsupported requests explicitly fail. The test
harness currently owns service launch. Production Rust service supervision,
launch-services integration, native sender/approval policy and replacing the old
TS helper-spawn adapter remain open. The default demo route is unchanged.


## Rust-owned Swift service lifecycle (2026-11-06)

The standalone Rust MCP configuration now accepts `native_service: {helper,
directory}`. Rust creates a private socket directory, starts the Swift helper,
awaits its readiness frame, injects the socket path into only the trusted worker
and adds that path to the native-pipe allowlist. `js_reset` and MCP shutdown retire
the workers and service and remove the owned directory; the next call starts a
fresh service. No test-side prelaunch is required. Foundation can normalize
/private/tmp to /tmp, so readiness compares canonical socket paths.

The four native IPC cases pass, including the installed original JS client. The
Rust-path case verifies three owned child PIDs, reset retirement, fresh replacement
PIDs and final cleanup. All 29 Rust regression tests also pass. This verifies app
inventory and lifecycle only: app policy/start/state/action dispatch, vendor sender
authentication and production launch-services integration remain open. The default
demo selection is unchanged. This is independent native reconstruction using
observed contracts, not recovery of unavailable original native function bodies.


## Native App policy dispatch (2026-11-06)

`ComputerUseIPCAppPolicyRequest` now dispatches to Swift `SkyAppPolicy`, resolving
an installed app name, bundle ID or path through the native LaunchServices adapter.
It returns the observed `decision`, `allowPersistentApproval` and target
`appPath/bundleIdentifier/displayName/risk/warningSubtitle` schema. Invalid app
references produce -10010; malformed request arguments produce -32602.

The source-derived policy boundary is preserved: native policy is evaluated first;
the restored Sky JS/TS `computer-use-policy` then performs MCP elicitation, rejects
decline/cancel, and substitutes the resolved app path before an operation. An
`allowed` policy is **not** approval. Denied/forbidden policies never elicit.

The original native policy database/default rules are unavailable. Standalone
rules are therefore explicit Rust-owned configuration, serialized to the Swift
service in CORE_CUA_APP_POLICY, not injected into the kernel or inferred from
model output. Example field inside `native_service`:

```json
{"app_policy":{"com.example.Target":{"decision":"allowed","risk":"high","allowPersistentApproval":false}}}
```

Supported decisions are allowed/denied/forbidden; risk is high/low; optional
warningSubtitle is preserved. Missing bundle IDs default to denied. This default
and storage mechanism are independent deployment choices, not claims about Codex
policy defaults. No vendor safety catalog, enterprise policy inheritance or sender
authentication has been reconstructed by this change.

Both the installed original JS client and the restored TS client pass native
policy tests for allowed/forbidden/unconfigured apps and invalid app paths. The
actual MCP/Rust/sandboxed-worker/Sky/Swift chain checks policy response metadata,
asks approval for an allowed fixture app, and verifies decline stops execution.
Forbidden/unconfigured fixtures fail before elicitation. Fixtures are temporary
.app metadata bundles: no application is launched and no UI permission requested.
The four IPC tests and 29 Rust regression tests pass. App start/skyshot/action
requests remain explicitly unsupported on this original-protocol service route.


## Native Sky app-state dispatch (2026-11-06)

`ComputerUseIPCAppGetSkyshotRequest` now dispatches to Swift `SkyAppState`.
The service re-evaluates native app policy, resolves a unique running app by bundle
ID plus canonical bundle path, checks Accessibility and Screen Recording without
prompting, and invokes the shared Swift AX/window-capture implementation. It
returns the original client schema: app bundle ID/PID and skyshot text plus PNG
data URL/mimeType. Requests for a non-running app fail explicitly; implicit app
startup has not been implemented or inferred from the client request name.

The existing observeWithScreenshot consistency check was extracted into
Target.observeWithScreenshot and is shared with the old NDJSON route. A failed
capture, changing AX tree, or expired reply invalidates the target observation.
The socket server now awaits MainActor dispatch so async ScreenCaptureKit work
can complete without keeping the main actor blocked in the socket read loop.

Protocol errors are separated from native failures: invalid application -10010,
native policy denial -10006, no running application -10007, ambiguous application
-10018, missing permissions -10009, and AX/capture failures -10008. These mappings
use the original error-code vocabulary; precise vendor failure classification is
not proven. disableDiff accepts only booleans; the independent renderer currently
returns a full snapshot for both values. Original incremental diff formatting,
app-specific instructions, native session policy and full source parity remain open.

Verification: four IPC cases pass, including original-installed/restored client
error behavior and real Rust/MCP approval followed by native app-state dispatch.
29 existing native adapter tests and the Swift observation-text self-test pass.
A separate real capture gate is available as `npm run test:native-skyshot`; it
packages and launches only the owned CuaFixture app and checks actual AX text and
PNG bytes with both installed and restored clients. Explicitly running that gate
currently fails both cases at the permission precheck (Accessibility=false,
ScreenRecording=false), before app launch. It is **not** a successful screenshot
acceptance; the normal protocol run skips those two opt-in cases. No permission
dialog or user-app operation was performed. Default DeepSeek demo routing remains
unchanged, and native start/action support and old adapter retirement remain open.


## Explicit native AppStart dispatch (2026-11-06)

`ComputerUseIPCAppStartRequest` now dispatches to Swift LaunchServices through
SkyAppState.start. It resolves and checks native policy, invalidates the target's
old observation, revalidates the resolved path/bundle before launch, and checks
the returned application identity. It reuses an existing application instance.
The reply contains app bundle ID/PID using the observed MacWindowAppState type's
optional-skyshot form. No fake screenshot is returned. A post-launch timeout
explicitly reports that the application may already be running.

Source evidence: a search of installed @oai JS/declarations found startApp and
ComputerUseIPCAppStartRequest only in the duplicated cua/sky mac client files.
The restored client envelope is already differentially compared with installed
JS. This establishes a distinct explicit start request, **not** proof that the
unavailable original native GetSkyshot implementation never launches an app.
Our read-state path still requires a running app; original implicit-start behavior
and precise AppStart response contents remain unresolved. No new CUA public method
or model-side automatic launch fallback has been invented.

Added `npm run test:native-app-start`: it builds a uniquely identified temporary
CuaFixture .app and calls startApp through both restored TS and installed original
JS clients. Both actual LaunchServices cases pass: the app is running at the
expected bundle path, a second start returns the same PID, and cleanup terminates
only that unique fixture and waits for its exit. In the current permission-denied
environment, both clients also receive -10009 for that running app's skyshot.
Four IPC cases and four original-client differential tests pass. Full screenshot
acceptance remains blocked by host permissions; input/action protocol dispatch
and production demo integration remain open. This live launch proof applies to
the explicit native client route, not an end-to-end DeepSeek getApp experience.

Native error handling now distinguishes malformed JSON (-32700) from unexpected
native errors (-10005), instead of labeling LaunchServices failures as invalid
JSON. Failed state refresh after identity resolution invalidates only the resolved
app's observation, and terminated app handles are pruned.


## Native element action dispatch (2026-11-06)

ComputerUseIPCAppPerformActionRequest now decodes the original client enum-shaped
setValue, selectText and performSecondaryAction payloads in Swift. The native
adapter maps elementID strings and text-selection fields to the shared Target AX
implementation. Native policy is rechecked; execution requires the resolved app's
current native snapshot and matching identity. Target.validateSnapshot rereads
and compares the AX tree before input. A completed or failed attempted operation
invalidates the snapshot; another action requires a fresh observation. A late
reply reports potential execution rather than silently retrying.

Four IPC tests pass with both original installed JS and restored TS clients,
including all three action envelopes, missing-observation errors, policy denial
and invalid selection mode. These cases verify protocol/guard behavior, not actual
input. The opt-in test:native-skyshot gate now additionally sets fixture text,
checks a second stale action is rejected, observes the actual new text, selects
a two-UTF16-unit emoji, and checks focus. Running it currently fails its two cases
at the permission precheck, before UI work. Actual input is therefore **unverified**.

The native ID allocator, snapshot-expiry policy and missing-observation mapping
to -10011 are independent implementation choices using the observed error/schema
vocabulary; original native semantics are not proven. Click, keyboard, scroll,
drag, paste and audio original-protocol dispatch remain unsupported. The existing
native engines for those operations remain available for subsequent migration;
no duplicate TS event implementation was introduced.


## Native keyboard request dispatch and selection correction (2026-11-06)

The original `type: {_0: text}` and `pressKey: {_0: chord, duration: seconds}`
action envelopes now dispatch through Swift Target.keyboardInput. The native
adapter converts seconds to the existing millisecond parameter and retains the
existing 0..30 second independent hold limit, Unicode chunking and held-key release
logic. Original PressKey.d.ts documents X keysym-style chords (e.g. Super_L+d),
not a guaranteed cmd alias; tests use Super+a. Keyboard requests require a current
observation and invalidate it after execution. Deadlines are checked after AX
validation and before each key-down; an already posted key is still released to
the original process on interruption. This is not a claim of hard real-time timing
or original native keyboard implementation parity.

Also fixed an actual mapping defect from the preceding element-dispatch change:
original selectText.text must populate the existing Swift helper's `value` field,
not `text`. `--sky-action-self-test` now exercises that mapping against the real
UTF-16 selection-range helper, verifies emoji length, Unicode payload preservation,
seconds-to-milliseconds conversion, and rejects bool/string/invalid durations.
The existing held-input self-test verifies release on interruption. Both pass;
Swift builds and all four IPC cases pass with original/restored keyboard request
envelopes, policy denial, missing observation and negative duration handling.

The live skyshot gate additionally selects all and types Unicode into its owned
fixture field, then checks actual observed text. That expanded UI case has not
been accepted: host TCC permissions blocked prior live runs. No passing protocol
or pure native self-test is counted as evidence of actual keyboard events.
Mouse/click/scroll/drag/paste/audio original-protocol dispatch, full native parity
and production demo replacement remain outstanding.


## Native click dispatch (2026-11-06)

Original Click.d.ts defines coordinates in the app-window screenshot and element
indices from the latest app-state text. The original client emits a click enum
with `at.elementID._0` or `at.coordinate._0`, numeric mouse button 0/1/2, count,
optional modifier chord and hold seconds. Swift now decodes both target variants,
checks numeric types/count/button/duration, and dispatches to Target.mouseInput.
The existing engine revalidates AX state; coordinate clicks additionally check
captured window identity/frame, capture geometry/scale and captured focus before
mapping screenshot pixels. Mouse-down is not begun after the request deadline;
release handling remains shared with held keyboard input.

Swift build, native action-mapping self-test, existing input/held-release self-tests
and four IPC tests pass. Both installed JS and restored TS clients exercise element
and coordinate click envelopes and reject fractional counts. The native decoder
self-test creates the expected middle-button down/up pairs for a double click.
The opt-in UI gate now clicks the fixture Save button and checks its visible saved
text after keyboard entry. That gate remains unaccepted; neither synthetic events
nor protocol guards prove real coordinate accuracy or real UI click effects.
Scroll/drag/paste/audio and production adapter retirement remain outstanding.


## Native scroll dispatch (2026-11-06)

The original scroll action's at.elementID/coordinate, direction and pages now
share pointer-target decoding with click and dispatch to Swift Target.scrollInput.
Both original and restored clients pass normalized direction/fractional page and
coordinate-envelope checks. Numeric booleans and nonpositive pages are rejected;
policy denial remains enforced. The native loop checks identity and deadline
before each wheel event and invalidates the snapshot after attempted input.

The existing viewport selection and page-distance engine is reused. One page is
an observed viewport extent in this independent implementation; the original
hidden native distance/acceleration policy is **not** known. A native self-test
passes a decoded half-page right scroll into real CGEvent construction and checks
pixel-delta axis/distance (point-delta fields, not line-delta fields). Swift build,
the action mapping/input self-tests, and all four IPC cases pass.

The owned live fixture now runs its scroll-area layout, and the skyshot gate asks
for a downward half-page scroll then checks the fixture's actual NSScrollView
bounds-change event. That UI case has not passed acceptance; it remains gated with
the screenshot/input tests that previously failed host permission prerequisites.
Protocol/self-test results are not proof of on-screen scrolling or native source
parity. Drag/paste/audio and production integration remain outstanding.


## Native drag dispatch (2026-11-06)

The original Drag.d.ts identifies both endpoints as app-window screenshot
coordinates. The original client emits drag.from/to arrays; Swift now validates
exactly two finite non-boolean coordinates per endpoint and maps them to the
existing Target.dragInput engine. Both endpoints are checked against the current
capture before mouse-down. The engine retains captured-window and snapshot checks,
PID identity checks and release at the last dispatched position on cooperative
interruption. Deadline checks happen before mouse-down and around each interpolation
wait; cleanup still uses identity-only validation so expiry does not suppress release.

Swift build, native payload mapping and drag/interrupted-release self-tests pass,
as do four IPC cases including both original and restored client drag envelopes.
The expanded owned live fixture gate computes points on its fixed gesture-pad
layout from PNG dimensions and waits for actual pad-up with drag movements. This
UI case has not passed acceptance and is not counted as verified coordinate input.
The existing 20-step interpolation/10ms pacing remains independently authored,
not recovered original native timing. Forced process termination cannot guarantee
cooperative release. Paste/audio and production demo migration remain open.


## Native paste dispatch and format processing (2026-11-06)

Original Paste.d.ts requires text/md/html insertion followed by clipboard restore.
The original Sky JS wrapper forwards text/format without conversion. That request
now decodes and renders in Swift, validates the focused AX editor before clipboard
mutation, and invokes the existing withNativeClipboard + pasteInput transaction.
Verification is bounded by the request deadline. Successful execution returns null
through the original void envelope; unobserved paste effects or failed restore
remain errors, never automatic retries.

Native format rendering reuses [Ink](https://github.com/JohnSundell/Ink) 0.6.0
(Markdown to HTML) and [SwiftSoup](https://github.com/scinfu/SwiftSoup) 2.9.6
(string HTML parsing/cleanup). Both are exact-pinned with Package.resolved. These
are independent native implementation dependencies, **not** recovered vendor
native dependencies. Raw Markdown remains the plain-editor fallback; cleaned HTML
is offered to rich editors. HTML input gets extracted plain text. Renderer dialect,
whitespace and sanitization can differ from the earlier marked/sanitize-html TS
adapter and from the unknown vendor renderer. No HTML resource loading is used.

Swift build, three native checks (formats, named-pasteboard transaction, UTF-16
replacement) and all four IPC cases pass. Named-board checks exercise text/md/html,
restore on success/error/cancellation, and preservation of external changes; they
do not touch the general clipboard. Original and restored clients exercise all
three format envelopes and invalid-format rejection. The live fixture gate now
pastes Unicode into its own field and checks the observed value; this UI case has
not passed acceptance. Rich-editor rendering remains unverified. Cooperative
restoration does not guarantee recovery after forced process termination; native
shutdown during an active paste is a remaining lifecycle gap.

The old packages/native-macos/src/paste-content.ts renderer is still used by its
legacy adapter; its callers must migrate before deletion. Audio, native policy/
session parity, production demo integration and whole-repository retirement work
remain open.


## Cooperative native termination cleanup (2026-11-06)

Swift Sky service launch now uses runNativeService: SIGTERM/SIGINT cancel the
service task instead of bypassing native defers. Signal dispatch does not itself
mutate the clipboard. Cancellation propagates through async paste/input and lets
withNativeClipboard restore its lease before exit. Socket accept/read/write waits
poll cancellation; accepted sockets are nonblocking so a partial frame or stalled
peer does not indefinitely prevent cooperative shutdown. Normal EOF also keeps
existing socket cleanup. Rust permits a 2-second service termination grace before
its existing process-group kill fallback (worker grace remains unchanged).

Nine IPC/lifecycle cases pass. Two actual subprocess cases send SIGTERM/SIGINT
while a transaction owns a **named** pasteboard, then require restored-content
evidence and exit code 0 (not signal death). Three other cases interrupt accept,
partial header and partial body waits and require normal exit/socket removal.
The original/restored client cases and actual Rust-worker reset/restart/close case
also pass. Swift and Rust release builds pass. No general clipboard was changed.

These prove cooperative signal cleanup for the tested transaction and I/O states,
not a real app paste under cancellation, forced SIGKILL recovery, crash recovery,
or completion of unresponsive native APIs. The 2-second fallback can still kill
an uncooperative service before cleanup; that limitation is not hidden by the
successful signal tests. Native App UI acceptance and production demo migration
remain open. The timeout and signal strategy are independently implemented rather
than recovered original supervisor/native function bodies.


## Opt-in Rust/Swift demo runtime and write-backpressure acceptance (2026-11-06)

The shared demo runtime factory now supports explicit computer surfaces through
Rust + the Swift native service, keeping the original @core/sky/service. Set
CORE_CUA_NATIVE_BACKEND=swift and CUA_RUNTIME_SUPERVISOR=rust. The factory owns
private runtime configuration, forwards explicit native policy only to the native
service, and keeps model credentials out of worker environments. Browser-only
callers retain the compatibility export. Mixed browser/computer assembly exists,
but the combined surface has not received full acceptance. The old TS native
adapter and installed default have not been retired.

A tested read-only entry (after build:reconstruction, build:native and
build:rust-runtime) is:

```bash
CUA_RUNTIME_SUPERVISOR=rust CORE_CUA_NATIVE_BACKEND=swift \
CUA_MCP_ENV='{"CUA_REPL_ENABLED_SURFACES":"computer"}' \
node --env-file=.env --import tsx packages/agent-loop/src/restored-demo.ts --check-computer
```

For a real model loop, add CUA_MODEL_PROVIDER=deepseek and replace --check-computer
with a prompt. One live DeepSeek run explicitly called js -> cua.listApps -> the
original Sky client -> Rust native pipe -> Swift, returned a fresh timestamp/count,
and produced a final answer. It used /nonexistent/vendor as the installed supervisor
path to verify that executable was unnecessary. No app names/window contents were
sent as tool output, and no application was started or operated. An earlier model
run answered from the host preflight count; that alone was not counted as proof of
a model-issued tool call. The model's extra prose on the second run inaccurately
suggested cua was absent, despite successful use; tool evidence is authoritative.

CORE_CUA_APP_POLICY is an explicit JSON bundle-ID rule map as documented above;
empty defaults deny app operations but permit inventory. App operations still
require original Sky elicitation and OS permissions. Computer-only mode ignores
unrelated browser endpoints inherited from .env, correcting a real CLI failure.
No .env or session logs are committed. The new route is opt-in and is not proof
that arbitrary natural-language app operations, screenshot/input, or audio work.

The native IPC acceptance now uses this production factory instead of a duplicate
hand-written runtime spec. Eleven IPC/lifecycle cases pass, including two added
real SIGTERM/SIGINT writer tests: a private socketpair is filled until EAGAIN,
the production writer waits against the unread receiver, then cancellation must
complete with exit code 0. The existing isolated Rust/CDP browser regression and
AgentLoop TypeScript check also pass. The CLI --check-computer and the real
DeepSeek loop exited successfully. Full UI acceptance and native parity remain open.


## Standard npm entry for Rust/Swift (2026-11-06)

The normal DeepSeek launcher now accepts `--swift-computer`:

```bash
npm run demo:deepseek -- --swift-computer --check-computer
npm run demo:deepseek -- --swift-computer "Call cua.listApps({emit:false}) and return only the application count."
```

The flag selects the Rust runtime and Swift native backend, builds the relevant
native/runtime prerequisites, and uses the original Sky service. Project .env is
loaded by the existing launcher. Explicit Swift selection overrides stale browser
surface/native-backend fields inside CUA_MCP_ENV while preserving other string
configuration; conflicting browser deployment/surface flags fail before build.
The existing --computer behavior is unchanged. Native app policy still defaults
to denied unless configured, and OS permissions/elicitation are still required
for app operations. This flag is not automatic approval or a browser fallback.

The exact npm --swift-computer --check-computer command passed against the real
Rust/Swift runtime and exited successfully with no model request or App action.
The launcher routing test passes normal browser/CDP cases, Swift prompt/check flag
orders, stale .env selection, and conflicts. The prior direct-entry DeepSeek tool
round trip remains the model-path evidence; this turn did not spend another model
request. Screenshot/input/audio and complete legacy retirement remain open.
