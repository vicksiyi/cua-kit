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

Current entry: `npm run start -w @core/native-host`. It is a native-messaging
process, not an interactive browser demo. Chrome manifest registration, a built
launch artifact, installed-extension origin binding, complete extension startup,
and browser-service/demo connector integration are still pending. Extension
host service requests (e.g. Codex app-server methods) currently return method-not-
implemented; do not advertise those features as supported.

Tests exercise real Unix sockets and the restored ExtensionBrowserPeer with
controlled handlers: concurrent ID collisions, fragmented frames, notifications,
invalid credentials, timeouts, errors and cleanup. They do not prove real Chrome
navigation, clicking, screenshots or DeepSeek browser search.
