# Demo model HTTP failures

The 2026-11-07 07:08:54 UTC local trace passed runtime initialization and native
permission preflight, then its first model decision failed after about 16.5s
with HTTP 500. This is distinct from the earlier malformed CORE_CUA_APP_POLICY
JSON. No model-generated app action was issued in that failed turn. The trace
does not establish why the configured model endpoint returned 500.

The standalone ChatCompletionsModel adapter now retries explicit HTTP
500/502/503/504 responses up to three total attempts, waiting 1s then 2s.
All attempts share the original 60-second cancellation/timeout signal. Other
HTTP errors (including authentication/payment errors), transport exceptions,
malformed successful responses, and tool execution are not retried here.
Provider response bodies/headers are not logged. model.retry events contain only
HTTP status, attempt numbers and delay. The CLI prints those retry events and
reports exhausted HTTP failures as a concise startup/run-boundary error.

This is demo-adapter resilience, not a claim that these constants were recovered
from the Codex CUA runtime. It does not change native app policy, approval or
macOS permissions. Tests use a loopback HTTP fixture and mock MCP service; no
real DeepSeek request or App launch was performed. Eight targeted tests and the
agent build passed. A live successful app workflow remains to be verified.
