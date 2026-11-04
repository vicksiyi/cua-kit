import { fileURLToPath } from "node:url";
import { from_filepath, to_data_url } from "../../core/uint8";
import { require_audio_model_support } from "../../require_audio_model_support";
import {
  setComputerUseResponseMeta,
  withComputerUseToolTelemetry,
  requestComputerAudioApproval,
} from "./computer-use-policy";
import { getClient } from "./lazy-client";
import { requestComputerUseHost } from "./native-pipe";
import type * as Start from "../../types/window/StartAudioRecording";
import type * as Stop from "../../types/window/StopAudioRecording";
export async function start_audio_recording(
  args: Start.Input = {},
): Start.Return {
  setComputerUseResponseMeta(null);
  return withComputerUseToolTelemetry(
    "start_audio_recording",
    undefined,
    async () => {
      const duration = args.max_duration_ms ?? 60000;
      if (!Number.isInteger(duration) || duration < 100 || duration > 300000)
        throw new Error(
          "audio recording duration must be an integer from 100 through 300000",
        );
      await requestComputerAudioApproval();
      const client = await getClient();
      await client.startAudioRecording({ maxDurationMilliseconds: duration });
    },
  );
}
export async function stop_audio_recording(): Stop.Return {
  setComputerUseResponseMeta(null);
  return withComputerUseToolTelemetry("stop_audio_recording", undefined, () => {
    const suspend = (globalThis as any).nodeRepl?.withSuspendedTimeout;
    const operation = async () => {
      const client = await getClient(),
        audio = await client.stopAudioRecording();
      if (typeof audio.url !== "string" || audio.url.length === 0)
        throw new Error(
          "computer-use service did not return a computer audio URL",
        );
      const url = new URL(audio.url);
      if (url.protocol !== "file:")
        throw new Error(
          "computer-use service did not return a local computer audio URL",
        );
      const filepath = fileURLToPath(url),
        bytes = await from_filepath(filepath),
        result = { filepath, bytes, data_url: to_data_url(bytes, "audio/wav") };
      if (process.env.SKY_AUDIO_ATTACHMENTS === "1") {
        const requestMeta = (globalThis as any).nodeRepl?.requestMeta;
        require_audio_model_support({
          model_allowlist: process.env.SKY_AUDIO_MODEL_ALLOWLIST,
          request_meta: requestMeta,
        });
        let metadata = requestMeta?.["x-codex-turn-metadata"];
        if (typeof metadata === "string") metadata = JSON.parse(metadata);
        const thread =
          metadata != null && typeof metadata === "object"
            ? Reflect.get(metadata, "session_id")
            : undefined;
        const turn =
          metadata != null && typeof metadata === "object"
            ? Reflect.get(metadata, "turn_id")
            : undefined;
        if (typeof thread !== "string" || typeof turn !== "string")
          throw new Error(
            "Computer audio attachments require the active Codex turn metadata",
          );
        await requestComputerUseHost("attachComputerAudio", {
          threadId: thread,
          turnId: turn,
          filepath,
        });
      }
      return result;
    };
    return typeof suspend === "function" ? suspend(operation) : operation();
  });
}
