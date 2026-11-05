# Repository-wide language and ownership audit

User requirement: installed JavaScript becomes readable TypeScript; code originally
implemented in another language must follow that language and responsibility
boundary. This applies to the existing repository, not only future additions.

`python3 scripts/audit-language-boundaries.py` inventories implementation files
and hashes. `language-boundary-inventory.json` covers all current package source
directories, the earlier `src` prototype, native implementations and build/launch
scripts. Generated output, dependencies and test fixtures are excluded. Group
classification is a review queue, **not a per-file semantic parity verdict**.

| Area | Evidence and required action |
| --- | --- |
| `packages/runtime-supervisor` | Confirmed TS replacement of original Rust native supervisor responsibilities. Migrate to `native/runtime-supervisor`; retire TS after full routing/lifecycle/sandbox/MCP acceptance. Rust pipe and process transport migration has begun. |
| `packages/node-repl` | Embedded original JavaScript workers and their source inventory. Restore as TS, retain worker/native protocol separation. Native process management belongs to Rust. |
| `packages/cua`, `cua-repl`, `sky` | Original installed JS and declarations inventoried in package-source and sky-native-source records. JS native-pipe *client* is not the native-pipe *server*: retain client restoration in TS. Per-file behavioral parity remains open. |
| `packages/browser`, `browser-desktop`, `core`, `browser-extension` | Restored JS bundles/shared logic and extension-source provenance. Retain TS for proven JS portions; audit adapters separately. Accessibility WASM is a native/binary asset, not permission to implement its internals in TS. Original WASM source language remains unconfirmed. |
| `packages/native-host` | Mixed deployment and native transport adapters. `chrome_profile.ts` derives from original JS plugin scripts and may remain TS. Socket server, authentication/router/installation are independently authored; original browser host language/ownership must be established before native-language rewrite. `browser_service.ts` composes restored JS rather than proving host-language parity. |
| `packages/native-macos` and `native/macos` | The installed SkyComputerUseService now has explicit Swift IPC/service source-path evidence in desktop-language-evidence.json. AX text rendering has moved from the independent TS client into Swift; the JS client now preserves native text, matching the original getAppState/window_result boundary. Original Sky JS forwarding/policy remains TS. Process management and the remaining independent adapter responsibilities still need per-file review; real UI acceptance remains outstanding. |
| `native/macos-sandbox` | Rust N-API Seatbelt helper replaces the independent C bridge; Rust supervisor now constructs policy/launch specs. The post-initialization bridge ordering remains an independently verified deployment choice, not established original behavior. Production composition and bootstrap ownership still require review. |
| `packages/cdp-host` | Independently authored deployment for Playwright/CDP. User requested CUA fidelity: this is not evidence of an original CDP auto-launch policy or native source language. Audit and keep its optional demo scope distinct. |
| `packages/agent-loop` | Agent-neutral caller and DeepSeek demo are requested additions, not vendor native source. TS caller logic is legitimate; inspect runtime assembly/startup/config code for responsibilities being incorrectly assigned out of the native layer. |
| root `src` | Earlier independent prototype remains present. Must audit browser/native/MCP/extension/runtime implementations too; do not omit these files because newer packages exist. Remove or migrate superseded logic only after checking scripts/import consumers. |
| `scripts` | Build, extraction, probes and deployment scripts. Derivation from original JS launch scripts permits TS/JS-side orchestration; standalone native operations need ownership review rather than blanket exemptions for script names. |

Priority is evidenced native responsibility migration, then unknown native artifact
identification, then file-level review of each queue. Existing passing TS tests
remain acceptance references, not justification to keep misplaced TS permanently.
The Rust implementation is independently reconstructed from exposed protocols;
embedded Rust module paths do not expose original function bodies.

## Confirmed supervisor migration ledger (2026-11-06)

These are responsibility mappings, not a claim that the installed native source
has been recovered. The existing TS implementation remains a comparison baseline
until the Rust deployment passes equivalent acceptance and replaces its callers.

| Existing TS implementation | Rust destination / current gap |
| --- | --- |
| `native-pipe-host.ts` | `native_pipe.rs`; real socket transport tests exist. |
| `process-port.ts` | `process_port.rs`; owned processes, frames and retirement tested. |
| `session.ts`, `execution-deadline.ts` | `repl_manager.rs`; dual workers, deadlines, cancellation, reset and lifecycle tested; full deployment still pending. |
| `config-host.ts`, `persistent-config-host.ts` | `config_manager.rs`, `deployment_host.rs`; explicit config sources and atomic writes tested, original layered configuration resolution remains unimplemented. |
| `media.ts` | `media.rs`; data URL envelope handling tested, not native screenshot/codec parity. |
| `mcp.ts`, `mcp-tools.ts`, `stdio.ts` | `mcp_server.rs` and `examples/mcp_stdio.rs`; actual SDK client integration tested; example is not the production launcher. |
| `background-host.ts` | `background_host.rs`; retained execution context, callback routing between cells and cancellation tested. Production authenticated HTTP host composition remains open. |
| `sandbox-runtime.ts`, `sandbox-launcher.ts`, `sandbox-bootstrap.ts` | `sandbox_launcher.rs` now owns validated policy/spec generation and is exercised through the MCP harness. The bridge is now Rust as well. Production runtime composition and bootstrap ownership remain pending. |

The 14 TS files above are a confirmed migration queue, not 14 completed rewrites.
Retirement must include import/script consumer checks, a production entry-point
switch and equivalent isolated browser acceptance. Native-host and desktop
service language identification, plus the legacy root `src` review, remain open.
A module calling native APIs from JS is not by itself evidence that its original
implementation was native; retain JS-derived client/protocol wrappers in TS.


Desktop evidence is reproducible with `python3 scripts/audit-desktop-language.py`.
It reads the bundled app Info.plist/executable and extracts only selected Swift
source-path literals and linked framework names. No original service is launched.
`ComputerUse/ComputerUseIPCServer.swift` and service-specific Swift files establish
native Swift participation, not every function's implementation or recovered bodies.
The native text formatter remains independently authored; exact original formatting,
diff logic and IPC/schema compatibility are still pending.


Swift IPC migration has begun in `native/macos/Sources/CuaHelper/SkyIPC.swift`.
The unchanged original Sky JS-derived service now reaches the Swift inventory
endpoint through Rust native pipes in an integration fixture, bypassing the
independent TS helper-spawn adapter. Production service ownership and the remaining
policy/state/action protocol still need migration before retiring that adapter.


## Existing repository audit follow-up (2026-11-06)

`native/runtime-supervisor/src/native_service.rs` now owns Swift service launch,
readiness and retirement through the MCP harness; the original JS-derived Sky
client remains TS. This replaces the test-side service spawn for the Rust inventory
path, but does not yet retire `packages/native-macos/src/helper.ts` or
`src/native/helper.ts`. Both still implement independently authored NDJSON helper
process ownership in TS, and must migrate their consumers to the native service
once the corresponding operations are supported.

The legacy root is not dead code: package.json still exports dist/index and
agent/native/extension entries compiled from src, and the default demo/mcp scripts
point there. tests/native-transport.test.ts directly imports src/native/helper;
tests/native.test.ts imports src/native/provider; browser/runtime/input/extension
and other tests also consume src/index. Deleting these files now would break active
entry points. Retirement requires switching those callers and their acceptance
coverage, not merely rewriting or deleting the source directory.

Audit status remains per-responsibility and incomplete per-file. Source-evidenced
JS clients stay TS. Rust supervisor and Swift desktop responsibilities migrate to
the corresponding native layers. Unknown native-host/WASM implementation languages
remain explicitly unresolved rather than assigned a speculative language.


Native app policy result construction/resolution is now implemented in Swift
SkyAppPolicy.swift; Rust owns the standalone policy configuration passed to that
service. The source-derived JS `computer-use-policy` continues as TS because its
elicitation, metadata and approved-path logic are present in the original JS.
This division was exercised through real MCP workers and the Swift endpoint.
Original native rule contents/defaults remain unknown; explicit standalone rules
must not be labeled original policy parity. App start/state/action and legacy
adapter retirement remain open.


Sky app-state dispatch now lives in Swift SkyAppState.swift and shares native
Target.observeWithScreenshot with the existing adapter. No AX tree, screenshot
or app identity assembly was moved into TS. Original JS clients/window_result
remain TS. Protocol and error paths pass; actual PNG/AX acceptance is still
blocked by missing host TCC permissions and must not be counted as completed.


Explicit Sky AppStart now dispatches to the existing Swift LaunchServices adapter,
with native policy/identity/deadline checks in SkyAppState. Both original JS and
restored TS clients launched and reused an isolated fixture app successfully.
The original hidden GetSkyshot auto-launch behavior is still unknown; no policy
was inferred from the absence of a visible JS startApp caller. Existing TS launch
adapters have not yet been retired or replaced in production demo routing.


Original enum-shaped element-action payloads now decode in Swift
SkyElementAction.swift and execute through the shared native Target engine.
setValue/selectText/secondary-action protocol guards pass with original and
restored clients; UI effects remain unverified due to host permissions. No
original native snapshot/ID allocator parity is claimed. Existing TS adapters
remain pending retirement after equivalent production acceptance.


Original keyboard enum payloads now route to Swift keyboardInput, including native
hold conversion/release and deadline checks. The selectText parameter bridge was
corrected to match the existing Swift engine's value field. Native mapping and
release self-tests pass; live input acceptance and original native semantics are
still unproven. No TS key-event implementation was introduced.


Original click enum decoding now stays in Swift and reuses the native mouse and
capture-identity engine. Original coordinate declarations identify app-window
screenshot space; actual pixel-to-screen behavior still needs live acceptance.
Numeric button/count/hold conversion is exercised with original/restored clients
and native event construction, not treated as original native implementation proof.


Scroll enum decoding now shares native pointer-target parsing and routes to the
existing Swift viewport/event engine. No duplicate TS wheel generator was added.
Page-distance policy remains explicitly independent; the actual NSScrollView
acceptance is pending, despite passing envelope and pixel-delta construction tests.


Original drag endpoint arrays now decode in Swift and route through the existing
native capture/drag engine. Mapping and interruption-release self-tests pass;
actual gesture-pad acceptance remains pending. Interpolation and pacing are still
explicit independent native choices, not original source bodies recovered into TS.
