# Native runtime integration decision

Status: route A approved by the user: “resume 按照你的建议进行”. Independently authored native work is authorized; public-contract fidelity and full acceptance remain required.

The requested final state combines readable TypeScript reconstructed from installed JavaScript, original package/API behavior, and a standalone DeepSeek-driven computer-use implementation. The installed JavaScript does not contain all native implementation code. The current reconstructed demo still delegates supervisor functions to the installed Rust executable while App control now uses the independently authored @core/native-macos backend by default. The optional vendor route still fails sender authentication.

## Current implementations must not be conflated

| Layer | Current implementation | Evidence / limitation |
| --- | --- | --- |
| CUA, Sky, CUA-REPL JS | Readable TS with original package boundaries mapped to @core | 92 corresponding source/build paths; presence is not semantic coverage |
| NodeREPL JS workers | Reconstructed kernel and trusted worker | Native supervisor remains an installed executable |
| macOS native App service | Independent @core/native-macos adapter + Swift helper | Restored API integration and pure/fixture tests pass; real UI acceptance blocked by missing OS permissions |
| Earlier standalone prototype | src/native | Its reviewed Swift helper and format utilities are reused by the current separate Sky-shaped adapter; the old MacApp API is not the demo API |
| Independent supervisor work | @core/runtime-supervisor | Session core and actual-worker protocol tests exist; production launcher/MCP/privileged endpoint integration is incomplete and not selected by the demo |
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
