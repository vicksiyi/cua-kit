# Installed supervisor compatibility, 2026-11-05

The demo was blocked before MCP initialization because ChatGPT.app replaced
`cua_node/bin/node_repl`. The original reconstruction manifest remains intact;
`compatibleSupervisors` records additional explicitly verified executable hashes.
Unknown hashes still fail closed. The demo now performs this check in its parent
process, so version mismatch is reported directly instead of only as MCP
`Connection closed`.

New executable SHA-256:
`44d08fb5c7346c53c869a9853c93090b3c10457950c2861ce8bdc4baabab5632`.

All nine embedded JS resources were extracted and syntax-checked locally using
`scripts/extract-node-repl-sources.mjs`. Relative to the recorded source, kernel,
diagnostics, privileged config, realm checks and Meriyah were unchanged. Changes:

- Trusted worker: private-key initialization, restricted telemetry service and
  operation names, request spans.
- Privileged bridge: optional private-key access in the trusted runtime.
- Worker runtime: explicit error code for unsupported image properties.
- Tracing: parent trace propagation, bounded parent fields and error attributes.

This is a supervisor compatibility update, not a claim that these new source
features have all been ported. The demo stages its existing restored workers and
services, not the newly installed trusted service code.

Verification: actual installed supervisor compared with its original workers and
our restored workers through MCP: execution, persistent bindings, reset, timeout,
cancellation and trusted RPC. The test passed for the new binary before its hash
was added to the allowlist. Unknown executable rejection is retained.

Final local validation:

- All five `native-supervisor.integration.ts` cases passed, including native pipe
  browser access denial and allowed navigation/input/screenshot.
- Agent-loop typecheck and two adapter tests passed.
- Both default extension and `--cdp-browser --check-browser` inventories passed.
- Real DeepSeek through restored CUA and CDP completed the owned local fixture,
  clicked its button, captured the page and returned `action-completed-marker`.
- Default Chrome extension + real DeepSeek opened a new Baidu tab, searched
  `deepseek`, captured results and returned the first result's observed Baidu
  redirect URL. Screenshot independently showed `DeepSeek | 深度求索` first.
- CDP against external Baidu opened the homepage and submitted search but later
  disconnected; this external search case remains unresolved. Do not count it
  as passed based on local-fixture success.
