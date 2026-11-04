# @core/sky reconstruction

The installed @oai/sky 0.7.13 package has three native targets (mac, linux, windows), a public client, and a trusted service. This package is being restored in those same boundaries.

Currently implemented:

- `src/create_service.ts`: service closure with lazy platform-client creation, own-method dispatch, media wire serialization, and Linux drag-handle state.
- `src/targets/mac/client.ts`: native operation envelopes, validation, per-version transport cache, metadata/default precedence and client singleton.
- `src/targets/mac/window_result.ts`: window state validation and once-per-app instructions.
- `src/targets/mac/native-pipe.ts`: original privileged native-pipe transport, framing, API handshake, request queue, startup and host-service exchanges.
- `src/targets/mac/errors.ts`: original native error codes and error types.
- `src/require_audio_model_support.ts`: original per-recording model allowlist and trusted request metadata checks.

These internal modules are built and type-checked with the other reconstruction packages. They do not yet expose the original root/service entry points: platform-client factories are still missing; the Mac native transport is restored but has not been connected to an installed native service. `createSkyService` requires an explicit platform-client constructor; no placeholder native implementation is selected automatically.

The original Sky package declares @statsig/js-client, and platform code uses native helper processes. Its native executables are not JavaScript dependencies and are not reconstructed by the dispatcher. The original `SKY_AUDIO_MODEL_ALLOWLIST` name and request metadata protocol are retained unchanged.

Differential tests evaluate only inspected original service/policy code with synthetic platform clients. They cover construction retry, media field filtering, own properties vs getters/inherited methods, handle retention after failures, and live audio policy changes. No personal app state or native recording is accessed.

Native-pipe tests also use an isolated real Unix socket, plus original-code differential scenarios for framing, error handling, startup and audio attachment uncertainty. This validates the JS transport, not the native executable or end-to-end app operations. The original declarations mention formatOSStatus, but the installed errors.js does not export it; no fabricated implementation is added.
