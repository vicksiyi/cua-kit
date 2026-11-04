# @core/sky reconstruction

The installed @oai/sky 0.7.13 package has three native targets (mac, linux, windows), a public client, and a trusted service. This package is being restored in those same boundaries.

Currently implemented:

- `src/create_service.ts`: service closure with lazy platform-client creation, own-method dispatch, media wire serialization, and Linux drag-handle state.
- `src/require_audio_model_support.ts`: original per-recording model allowlist and trusted request metadata checks.

These internal modules are built and type-checked with the other reconstruction packages. They do not yet expose the original root/service entry points: platform-client factories and transports are still missing. `createSkyService` requires an explicit platform-client constructor; no placeholder native implementation is selected automatically.

The original Sky package declares @statsig/js-client, and platform code uses native helper processes. Its native executables are not JavaScript dependencies and are not reconstructed by the dispatcher. The original `SKY_AUDIO_MODEL_ALLOWLIST` name and request metadata protocol are retained unchanged.

Differential tests evaluate only inspected original service/policy code with synthetic platform clients. They cover construction retry, media field filtering, own properties vs getters/inherited methods, handle retention after failures, and live audio policy changes. No personal app state or native recording is accessed.
