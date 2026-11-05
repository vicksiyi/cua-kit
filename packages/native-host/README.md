# @core/native-host

Independently authored TypeScript host for the reconstructed browser protocol.
This is not a decompilation of the installed Rust host. It leaves the installed
OpenAI host and its signature checks untouched.

The process reads/writes Chrome native-messaging frames on stdin/stdout and
routes BrowserRpcPeer JSON-RPC messages to authenticated local Unix-socket
clients. Framing is reused from `@core/browser/nativePipe`; RPC handlers remain
in the reconstructed extension. Client request IDs are rewritten and restored
per connection so concurrent agents do not collide. Notifications are shared
with authenticated clients; page/session isolation remains the extension's job.

The host creates a unique private directory (0700), socket and endpoint descriptor
(0600). The descriptor contains a random connection capability. Call
`connectNativeHost(endpoint)` to authenticate before exposing a BrowserRpcTransport.
Treat descriptor access as permission to control the shared browser; never put it
in prompts, logs, Git or web responses. Only its file path is logged to stderr.
No TCP listener is opened. Authentication is specific to this independent stack;
it is not an alternative entry into the installed OpenAI host.

Build with `npm run build:native-host` (also included in `build:reconstruction`).
`createNativeHostInstallation` writes a private config, a safely quoted executable
launcher and the `com.core.cua` native-messaging manifest for explicitly supplied
extension IDs. `registerChromeNativeHost` installs that manifest on macOS Chrome
using exclusive creation; an existing manifest is never overwritten. The launcher
runs the bundled `dist/main.mjs` with an absolute Node path and validates Chrome's
origin argument against config before opening an endpoint. This argument check
supplements Chrome's allowed_origins enforcement; it is not OS process attestation.
The local user is the trust boundary for the independent capability-based host.

No host has been registered into the user's real Chrome profile yet: the restored
extension's complete background and stable extension ID are still pending. Tests
register under a temporary home and simulate native-messaging stdin/stdout in a
separate process. Browser-service/demo connector integration is also pending.
Extension host service requests (e.g. Codex app-server methods) currently return
method-not-implemented; do not advertise those features as supported.

Tests exercise real Unix sockets and the restored ExtensionBrowserPeer with
controlled handlers: concurrent ID collisions, fragmented frames, notifications,
invalid credentials, timeouts, errors and cleanup. They do not prove real Chrome
navigation, clicking, screenshots or DeepSeek browser search.

## Browser-service connector

`createBrowserServiceConnector([endpointFile])` reads explicit private endpoint
files and returns `host.getNativePipeBridge` plus an environment map containing
only allowed socket paths. Merge the host property into `assembleBrowserService`
and the environment map into its privileged runtime environment. This keeps the
restored browser discovery, RPC and policy pipeline. Unknown socket paths are
rejected; there is no raw-socket fallback. Files and sockets must belong to the
current user, be private, and reside in the same private directory. Capability
secrets remain captured in the bridge closure, never the environment or model
messages. Existing access-verifier/broker configuration is not removed or waived;
extra host endpoints are unsupported until explicitly implemented.

A service-level test runs setup/list_browsers/turn cleanup through the restored
service and real authenticated host with controlled extension handlers. This does
not itself prove real navigation or model-driven operation.

Extension-origin `ping` is routed to authenticated browser clients. Replies are
correlated per client; the first successful response wins, with timeout and
disconnect cleanup. The host never fabricates `pong` merely because a connection
exists. This supports the restored extension's heartbeat cleanup behavior;
Codex-specific native-host methods are still unsupported.

`registerNativeHostForProfile(installation, userDataDirectory)` installs only in
that Chromium user-data directory, preserving normal browser profiles. The real
Chromium integration test now exercises Chrome-launched native messaging, socket
authentication, restored getInfo/getUserTabs, actual page-context capture and turn
cleanup. It uses a locally prepared page and does not yet exercise DeepSeek-driven
navigation. The router accepts correlated void replies whose result field is
omitted by JSON serialization, matching the restored BrowserRpcPeer wire behavior.

The demo now accepts `CORE_CUA_ENDPOINT_FILES` as a JSON array of explicit private
endpoint paths, including via the project's ignored `.env`. It validates the files
and selects `@core/native-host/browserService` in the trusted worker. This service
uses the restored desktop documentation/commands and authenticated bridge. The
runtime stager includes this package; untrusted environment allowlists are not
expanded. Existing custom trusted browser services cause a configuration error
rather than silent replacement. With no endpoint setting, original behavior stays.

This is connection selection, not extension installation. The regular Chrome
profile still needs the independent extension/host installed. Real DeepSeek search
acceptance remains pending. The integration test additionally creates a real tab
and ends its turn; browser timer callbacks in the test host are bound to globalThis
to preserve the native receiver during cleanup.

The packaged service requires `nodeRepl.nativePipe.createConnection`. It performs
its capability handshake over that original privileged bridge so asynchronous CDP
events inherit the current tool execution context. Using a raw Node socket here
retains the setup call's context and causes later intercepted navigation to fail
when reading requirements. Standalone connector callers can still use the direct
socket implementation outside the privileged worker.

The real Chromium integration now drives the complete demo MCP/supervisor/worker
chain through `cua.getTab`, navigation, Playwright click, page-state reading and
screenshot output. An opt-in live-model check is available after building:

```sh
CUA_LIVE_DEEPSEEK_TEST=1 npx tsx --test reconstruction/extension-native-controller.test.ts
```

It loads the ignored project `.env` in the model process, consumes DeepSeek API
usage and operates only on its isolated local test page. This is a diagnostic,
not an installation or acceptance command for the user's existing Chrome.

## Local lifecycle diagnostics

New native host processes write `lifecycle.jsonl` beside their registered
`config.json` (normally `~/.core-cua/host-*/lifecycle.jsonl`). The log records
only timestamp, PID and event code: starting, ready, input EOF/error, output
error, invalid extension message, server error, client cleanup error, explicit
close, or SIGINT/SIGTERM. It never contains RPC bodies, page contents, URLs,
endpoint authentication tokens or model keys. The file is private (0600),
rejects symlinks and clears old entries once it reaches 1 MiB. It is outside the
repository and is not uploaded. Existing running hosts pick up this change on
their next startup; rebuilding alone does not replace an active process.

An `input-ended` event means Chrome closed the native input stream; it does not
by itself prove whether the user quit Chrome, disabled the extension or the
worker restarted. SIGKILL/process crashes can leave no final event. This log
narrows the failure stage; it does not claim to repair every disconnect.

Directory-based demo discovery now authenticates each candidate socket before
selecting it. Missing sockets and connection-refused endpoints left by crashed
hosts are skipped without deleting the files. If none remain, the normal
unavailable/cold-start path runs. Invalid descriptors, unsafe permissions and
failed authentication are still reported as errors. Explicit endpoint lists
remain strict and are not silently replaced. This probe verifies a live host
transport, not extension/browser readiness; the MCP inventory preflight still
runs afterward. A host can disconnect after any probe, so this does not remove
all connection races.

## Chrome profile startup checks

The default macOS demo now inspects the selected existing Chrome profile before
launching it. Selection follows the bundled diagnostic rules: usable `last_used`,
then highest-numbered usable `last_active_profiles`, then the highest-numbered
usable profile. `Secure Preferences` takes precedence over `Preferences`.
Installation requires extension files (version directory or unpacked directory);
enablement also requires registration, nonzero-or-absent state, and no disable
reasons. An enabled extension in a different profile does not silently select
that profile. Missing/disabled Core CUA extensions stop startup with a diagnostic.
The launch command explicitly passes `--profile-directory`, `--new-window` and
`about:blank`; it does not create a temporary profile or enable remote debugging.

Source hashes and adaptation boundaries are in
`reconstruction/chrome-profile-source.json`. This is the macOS Core deployment
of the profile/status subset, not a claim to have reconstructed the complete
vendor cross-platform installer or diagnostic flow. Unit fixtures compare seven
status/selection scenarios directly with the locally installed original script
when that version is available. No user profile is modified by these tests.

Before cold startup, the demo now waits two seconds and retries live host discovery
once. A recovered connection avoids opening a window. If startup is still needed,
it checks the Core native manifest name/type/origin, executable launcher, adjacent
host configuration and exact endpoint directory before launching the selected
profile. These checks never rewrite registration or enable extensions. They
verify deployment prerequisites, not that the launcher dependencies or browser
worker can run; MCP readiness and real UI acceptance remain separate. The retry
here is transport discovery, while the vendor troubleshooting guide describes a
browser-client call. Full command-level recovery is not claimed by this change.
