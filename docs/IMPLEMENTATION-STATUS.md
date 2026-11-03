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
