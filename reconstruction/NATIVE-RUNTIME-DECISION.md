# Native runtime integration decision

Status: route A remains authorized, with the user's 2026-11-06 correction:
implementation language and layer boundaries must follow the original CUA;
TypeScript is not the universal target. Earlier authorization for an independent
replacement does not make a TS replacement of native responsibilities final.

Installed JavaScript must be restored as readable TypeScript (user clarification, 2026-11-06). Native responsibilities
must be implemented in their original language where evidenced, and migrations
must preserve the existing protocol/acceptance tests. Missing native source is a
provenance gap, not permission to label a guessed rewrite as recovered source.
The installed supervisor remains the default. An opt-in TS independent supervisor
now passes sandbox/CDP and isolated extension acceptance, but is transitional
under this corrected requirement.

## Language and boundary migration audit (open)

| Current area | Decision / next evidence required |
| --- | --- |
| `packages/runtime-supervisor/src/*.ts` | Priority migration candidate: these files replace installed native supervisor responsibilities (sessions, workers, MCP, config, pipes, cancellation, sandbox launch). Earlier local audit identifies the installed supervisor as Rust. Revalidate binary/build evidence and migrate those responsibilities to Rust; retain TS only where original worker/JS boundaries justify it. Passing TS tests is not completion. |
| `native/macos-sandbox/sandbox.c` plus TS sandbox launcher | Independent Seatbelt/N-API bridge. Audit the original native sandbox ownership; integrate into the native supervisor rather than treating this bridge as source-equivalent. |
| `packages/native-host/src` | Independent browser native-messaging deployment, including capability authentication and endpoint discovery. Determine original host language and IPC ownership before choosing a migration language. Keep genuine recovered JS browser-service code separate from this adapter. |
| `native/macos/Sources` and `packages/native-macos` | Swift OS helper plus TS service adapter. Verify original native service implementation language and protocol boundary; Swift currently expresses platform behavior but is not established as source-language parity. |
| CUA/Sky/CUA-REPL and NodeREPL JS workers | Keep TypeScript restoration of installed JS where declarations prove the boundary. Do not migrate JavaScript worker logic merely because its parent process is native. |
| CDP host and caller-side AgentLoop | Independently authored demo/deployment components. Clearly identify their provenance; do not present the isolated-browser launch policy as recovered Codex behavior. |

Migration sequence: establish per-component evidence → document native protocol
and ownership → implement matching-language components → run existing differential
and real-browser acceptance → switch the opt-in runtime → remove superseded TS
native implementations after parity is demonstrated. Do not delete the working
baseline or claim the migration complete before those gates pass.

## Current implementations must not be conflated

| Layer | Current implementation | Evidence / limitation |
| --- | --- | --- |
| CUA, Sky, CUA-REPL JS | Readable TS with original package boundaries mapped to @core | 92 corresponding source/build paths; presence is not semantic coverage |
| NodeREPL JS workers | Reconstructed kernel and trusted worker | Original default supervisor is installed; opt-in TS replacement exists |
| macOS native App service | Independent @core/native-macos adapter + Swift helper | Restored API integration and pure/fixture tests pass; real UI acceptance blocked by missing OS permissions |
| Earlier standalone prototype | src/native | Its reviewed Swift helper and format utilities are reused by the current separate Sky-shaped adapter; the old MacApp API is not the demo API |
| Independent supervisor work | @core/runtime-supervisor | Opt-in sandbox demo and isolated extension/CDP acceptance pass; native-language migration remains required |
| Browser extension/native host | Reconstructed extension and separate host | Temporary local-page operation passed; daily Chrome and requested web searches unaccepted |

## Approved route A: independently implemented native boundary

Keep reconstructed @core API packages and workers. Add an explicitly named native backend with the same supported protocol/API contracts, using documented OS facilities and existing suitable libraries. Reuse the earlier helper only after reviewing it against the original contract; do not silently route reconstructed APIs to its different MacApp interface.

Required work includes a native supervisor/service implementation, lifecycle/reset/cancellation, process and permission handling, structured errors, app discovery and AX observations, screenshots, coordinate/input operations, and policy/approval integration. Preserve denied/unsupported outcomes. Establish differential protocol tests and real-device acceptance for each capability. Do not replace authentication results with fabricated success or weaken the installed service.

This route serves the standalone goal, but native internals are independently authored code, not a recovered TypeScript translation of unavailable original source. OS permissions still require user authorization. Existing prototype success is not acceptance for the reconstructed API.

## Route B: retain installed native implementation

Keep the original executable/service as explicit runtime dependencies and integrate only through a supported authorized host path if one is available. No such standalone authorization path has been verified. This keeps the original native implementation in use, but cannot satisfy an entirely readable-source, independently runnable delivery without additional source or vendor support.

## Authorization and remaining scope

The user approved route A. No further decision is needed to continue independently authored native work while preserving recovered public contracts and identifying provenance/gaps. This does not change the final feature scope or authorize weakening OS or installed-service protections.

Browser extension loading, upstream site-status transport, real web search acceptance, and source/behavior auditing remain separate outstanding work under either route. Do not interpret either choice as completion.

Native-language evidence is now reproducible in `native-language-evidence.json`.
The Rust migration begins in `native/runtime-supervisor`; see its README for
implemented scope and explicit missing integration gates. This does not yet
replace the transitional TS runtime.
