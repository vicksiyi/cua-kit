# @core/node-repl reconstruction

The installed `cua_node/bin/node_repl` is a Mach-O arm64 supervisor containing readable embedded JavaScript, not just an opaque executable. This package is the readable TypeScript restoration of those worker components; it is not yet a runnable NodeREPL server or a replacement for the Rust supervisor.

`node scripts/extract-node-repl-sources.mjs /tmp/cua-node-repl-source [BINARY]` extracts nine resources from the local installed binary, checks JavaScript syntax, verifies both embedded copies are identical, and writes byte offsets and SHA-256 provenance. It does not execute the binary. The repository records hashes rather than redistributing the binary or the unmodified embedded vendor bundle.

Resources: kernel, diagnostics, privileged host bridge, privileged config bridge, realm checks, Meriyah, tracing, trusted worker and worker runtime. The embedded Meriyah header identifies version 7.0.0; this workspace pins upstream `meriyah` 7.0.0, and diagnostic tests use the upstream parser and compare with the embedded copy. The parser will also be used by the restored kernel; no parser is being rebuilt.

Restored so far:

- `src/realmChecks.ts`: cross-realm ArrayBuffer brand check through the native getter.
- `src/diagnostics.ts`: binding-aware diagnostic identifier redaction, string/template/regex/comment masking and original truncation.

The supervisor's execution/process isolation, permission and MCP lifecycle are still compiled native code. Discovering embedded workers does not establish full source recovery or full standalone-server behavior. The kernel/worker/privileged bridge restoration and supervisor integration remain outstanding.
