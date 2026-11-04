# @core/node-repl reconstruction

The installed `cua_node/bin/node_repl` is a Mach-O arm64 supervisor containing readable embedded JavaScript, not just an opaque executable. This package is the readable TypeScript restoration of those worker components; it is not yet a runnable NodeREPL server or a replacement for the Rust supervisor.

`node scripts/extract-node-repl-sources.mjs /tmp/cua-node-repl-source [BINARY]` extracts nine resources from the local installed binary, checks JavaScript syntax, verifies both embedded copies are identical, and writes byte offsets and SHA-256 provenance. It does not execute the binary. The repository records hashes rather than redistributing the binary or the unmodified embedded vendor bundle.

Resources: kernel, diagnostics, privileged host bridge, privileged config bridge, realm checks, Meriyah, tracing, trusted worker and worker runtime. The embedded Meriyah header identifies version 7.0.0; this workspace pins upstream `meriyah` 7.0.0, and diagnostic tests use the upstream parser and compare with the embedded copy. The parser will also be used by the restored kernel; no parser is being rebuilt.

Restored so far:

- `src/kernel_bindings.ts` and `src/kernel_instrumentation.ts`: original binding collection/reassignment analysis and commit-marker source rewrites; kernel assembly/linking remains pending.

- `src/tracing.ts`: execution-scoped response metadata spans, async parent propagation, bounded/sanitized attributes, result/error tagging and dropped-span accounting; uses Node built-ins.
- `src/realmChecks.ts`: cross-realm ArrayBuffer brand check through the native getter.
- `src/diagnostics.ts`: binding-aware diagnostic identifier redaction, string/template/regex/comment masking and original truncation.
- `src/worker_values.ts`: descriptor-only error properties, object freezing/log formatting, byte views and image URL/MIME normalization.
- `src/background_operations.ts`: lazy rejected thenables and background-operation observation tracking.
- `src/exec_context.ts`: AsyncLocalStorage context with separate originating-store and active-execution checks.
- `src/worker_runtime.ts`: original worker assembly, output/media bridge, execution metadata, error kinds, background draining, response settlement and JSONL stdin/stdout lifecycle.
- `src/privileged_config.ts`: frozen configuration API, original validation/normalization, async argument handling and privileged-operation message construction. This module requires the host operation handler; it does not directly access configuration files.

Additional restored host components: `lifecycle_handlers.ts` preserves serial/concurrent best-effort hooks and timeouts; `privileged_host_operations.ts` implements elicitation and authenticated-fetch wire requests with their original context/observation differences. `native_pipe_bridge.ts` now restores host pipe requests, listener/context lifecycle and early-closure races; it is also tested beneath the restored Windows transport. `privileged_runtime.ts` now assembles the frozen privileged host API and its original descriptors, launch-services validation, response metadata, timeout suspension and lifecycle wiring. The trusted-worker entry is now restored in `src/trusted_worker.ts`; kernel/supervisor integration remains outstanding.

The supervisor's execution/process isolation, permission and MCP lifecycle are still compiled native code. Discovering embedded workers does not establish full source recovery or full standalone-server behavior. The shared worker runtime is restored and tested in isolated Node subprocesses. Kernel execution and supervisor integration remain outstanding.

`dist/trusted_worker.js` is the restored process entry for the trusted service host. It takes the working directory as argv[2], receives supervisor messages on stdin and reserves stdout for JSONL. It uses `NODE_REPL_TRUSTED_SERVICES`, `NODE_REPL_NODE_MODULE_DIRS` and `NODE_REPL_TRUSTED_CODE_PATHS` exactly as the embedded source. Its module resolver requires Node `module.registerHooks`; the current validation runtime is Node 23.11.0. This entry does not implement the native supervisor or its isolation boundary. Differential tests launch both original embedded JS and restored JS in disposable processes with temporary synthetic services, never the installed native executable.
