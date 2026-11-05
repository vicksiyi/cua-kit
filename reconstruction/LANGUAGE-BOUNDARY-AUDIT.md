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
