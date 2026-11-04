# Native runtime integration decision

Status: decision required for implementation provenance; no native backend switch has been made.

The requested final state combines readable TypeScript reconstructed from installed JavaScript, original package/API behavior, and a standalone DeepSeek-driven computer-use implementation. The installed JavaScript does not contain all native implementation code. The current reconstructed demo still delegates supervisor functions to the installed Rust executable and App control to SkyComputerUseService. The real App probe now confirms sender authentication rejection in the installed service.

## Current implementations must not be conflated

| Layer | Current implementation | Evidence / limitation |
| --- | --- | --- |
| CUA, Sky, CUA-REPL JS | Readable TS with original package boundaries mapped to @core | 92 corresponding source/build paths; presence is not semantic coverage |
| NodeREPL JS workers | Reconstructed kernel and trusted worker | Native supervisor remains an installed executable |
| macOS native App service | Installed SkyComputerUseService | Real probe connects then closes; correlated service log rejects sender authentication |
| Earlier standalone prototype | src/native + native/macos Swift helper | Independent implementation with partial operations and permission-gated tests; not the reconstructed Sky service, not wired into current demo |
| Browser extension/native host | Reconstructed extension and separate host | Temporary local-page operation passed; daily Chrome and requested web searches unaccepted |

## Proposed route A: independently implemented native boundary

Keep reconstructed @core API packages and workers. Add an explicitly named native backend with the same supported protocol/API contracts, using documented OS facilities and existing suitable libraries. Reuse the earlier helper only after reviewing it against the original contract; do not silently route reconstructed APIs to its different MacApp interface.

Required work includes a native supervisor/service implementation, lifecycle/reset/cancellation, process and permission handling, structured errors, app discovery and AX observations, screenshots, coordinate/input operations, and policy/approval integration. Preserve denied/unsupported outcomes. Establish differential protocol tests and real-device acceptance for each capability. Do not replace authentication results with fabricated success or weaken the installed service.

This route serves the standalone goal, but native internals are independently authored code, not a recovered TypeScript translation of unavailable original source. OS permissions still require user authorization. Existing prototype success is not acceptance for the reconstructed API.

## Route B: retain installed native implementation

Keep the original executable/service as explicit runtime dependencies and integrate only through a supported authorized host path if one is available. No such standalone authorization path has been verified. This keeps the original native implementation in use, but cannot satisfy an entirely readable-source, independently runnable delivery without additional source or vendor support.

## Decision needed

May the native boundary be independently implemented (route A), while keeping recoverable JS reconstruction and marking provenance/behavior gaps explicitly? This changes the earlier requirement that the code be the same as the installed implementation. No change to the user's final feature scope is proposed.

Browser extension loading, upstream site-status transport, real web search acceptance, and source/behavior auditing remain separate outstanding work under either route. Do not interpret either choice as completion.
