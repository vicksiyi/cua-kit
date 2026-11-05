import { fileURLToPath } from "node:url";
import { from_filepath, to_data_url } from "../../core/uint8";
import {
  setComputerUseResponseMeta,
  withComputerUseToolTelemetry,
  requestComputerAudioApproval,
} from "./computer-use-policy";
import { getClient } from "./lazy-client";
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
      return result;
    };
    return typeof suspend === "function" ? suspend(operation) : operation();
  });
}
