# @core/cua-repl

Readable reconstruction of the installed `@oai/cua-repl` 0.1.2 launcher and instruction loader. Package imports are renamed to `@core/*`. Source imports are extensionless; the build patches emitted ESM paths.

`launch()` validates `CUA_REPL_NODE_REPL_PATH` as an absolute executable, selects platform/browser instructions and enabled surfaces, constructs NodeREPL environment/tool overrides, starts the external process with inherited stdio, forwards signals, and propagates termination. Instructions and the default banner are packaged alongside the launcher. Existing trusted-service and banner overrides, including empty strings, are preserved.

The actual source accepts an empty `CUA_REPL_ENABLED_SURFACES` value (both surfaces disabled), although the installed README says empty fails. This reconstruction preserves the implementation, and tests cover the discrepancy.

Build from repository root with `npm run build:reconstruction`. The bin is `node packages/cua-repl/bin/cua-repl.mjs`; an external NodeREPL executable is required. This package is **not** a reconstructed NodeREPL engine. Default trusted services reference `@core/browser-desktop/service` and `@core/sky/service`; browser-desktop now exports its restored dispatcher and environment documentation, and Sky now exports its platform dispatcher. The `@core/cua/tinyskyAlt` global entry now supports browser startup when a host supplies the browser RPC; native JS startup now resolves the Sky provider; real host/native resources are still required. Do not treat successful launcher fixture tests as a working standalone computer-use server.

Validation compares installed and restored instruction output across platforms, environments and guidance modes; real disposable child processes compare selected environment, description payloads, overrides, exit codes and signal termination. The fixture does not execute user code or call a model.

The native supervisor contains embedded worker JavaScript; extraction/provenance and initial readable helpers are tracked in `packages/node-repl`. This does not remove the external executable requirement of this original launcher.
