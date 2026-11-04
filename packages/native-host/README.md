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
