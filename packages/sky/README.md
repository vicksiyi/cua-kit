# @core/sky reconstruction

The installed @oai/sky 0.7.13 package has three native targets (mac, linux, windows), a public client, and a trusted service. This package is being restored in those same boundaries.

Currently implemented:

- `src/targets/windows/internal/codex_turn_metadata.ts` and `helper_protocol.ts`: metadata precedence, app/audio approval and scoped interrupt-marker path helpers; `helper_transport.ts` wires approval replay, turn transitions, interruption enforcement, subprocess framing and timeout lifecycle; `computer_use_client_base.ts` and `window_protocol.ts` restore public operations, window/state parsing, turn-end cleanup and optional audio; `computer_use_client.ts`, `native_pipe_transport.ts` and the Windows factory now select injected/shared subprocess/trusted native-pipe transports with the original lifecycle.

- `src/targets/mac/create_client.ts` and operation modules: complete Mac factory, policy-wrapped field mappings, per-factory window state and conditional audio methods.
- `src/targets/mac/audio_recording.ts`: original duration/approval, local WAV read, suspended timeout and host attachment flow.
- `src/core/uint8.ts` and `src/types/window/`: byte helpers and installed window declarations.
- `src/create_sky_proxy.ts`: trusted RPC proxy state, reflection, media restoration, Linux drag handles and explicit direct-client dependency.
- `src/load_options.ts`: original config-file/platform selection.
- `src/targets/linux/audio_recording.ts`, `create_client.ts` and `src/core/cli.ts`: original pactl/ffmpeg recording lifecycle, subprocess helper and complete Linux factory.
- Linux non-audio operation adapters: screenshots/window state, pointer/keyboard/text, clipboard, app/window listing and stateful drag handles; audio and factory assembly are also restored.
- `src/targets/linux/element_ids.ts` and `action_settler.ts`: per-window compact IDs, filtered refresh retention and action deadlines.
- `src/targets/linux/sky_linux_transport.ts`, `sky_linux.ts` and `src/core/package_bin.ts`: native helper process lifecycle, JSON line RPC, option-keyed caching and binary resolution.
- `src/targets/linux/accessibility_tree.ts`: native/RPC accessibility presentation restoration and condensed tree rendering.
- `src/create_service.ts`: service closure with lazy platform-client creation, own-method dispatch, media wire serialization, and Linux drag-handle state.
- `src/targets/mac/computer-use-policy.ts`: immutable app approval inputs, canonical app-path binding, response metadata, audio approval and terminal telemetry.
- `src/targets/mac/computer-use-telemetry.ts`: original structured-event wrapper around upstream Statsig 3.33.3, with host network/analytics gates and identity updates.
- `src/targets/mac/lazy-client.ts`: cached lazy client import.
- `src/targets/mac/client.ts`: native operation envelopes, validation, per-version transport cache, metadata/default precedence and client singleton.
- `src/targets/mac/window_result.ts`: window state validation and once-per-app instructions.
- `src/targets/mac/native-pipe.ts`: original privileged native-pipe transport, framing, API handshake, request queue, startup and host-service exchanges.
- `src/targets/mac/errors.ts`: original native error codes and error types.
- `src/require_audio_model_support.ts`: original per-recording model allowlist and trusted request metadata checks.

These internal modules are built and type-checked with the other reconstruction packages. They do not yet expose the original root/service entry points: the Mac factory is restored and tested through an isolated socket, the Windows factory is restored against synthetic helpers, while top-level assembly remains missing; the Mac transport has not been connected to an installed native service. `createSkyService` requires an explicit platform-client constructor; no placeholder native implementation is selected automatically.

The original Sky package declares @statsig/js-client ^3.32.6; its installed resolution is 3.33.3, which this package now pins independently of the browser bundle's 3.33.1. Platform code also uses native helper processes. Its native executables are not JavaScript dependencies and are not reconstructed by the dispatcher. The original `SKY_AUDIO_MODEL_ALLOWLIST` name and request metadata protocol are retained unchanged.

Differential tests evaluate only inspected original service/policy code with synthetic platform clients. They cover construction retry, media field filtering, own properties vs getters/inherited methods, handle retention after failures, and live audio policy changes. No personal app state or native recording is accessed.

Native-pipe tests also use an isolated real Unix socket, plus original-code differential scenarios for framing, error handling, startup and audio attachment uncertainty. This validates the JS transport, not the native executable or end-to-end app operations. The original declarations mention formatOSStatus, but the installed errors.js does not export it; no fabricated implementation is added.
