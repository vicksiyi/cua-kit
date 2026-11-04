import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cli } from "../../core/cli";
import { from_filepath, to_data_url } from "../../core/uint8";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import type { Function as Start } from "../../types/full-desktop/StartAudioRecording";
import type { Function as Stop } from "../../types/full-desktop/StopAudioRecording";
type Recording = {
  child: ChildProcess;
  completion: Promise<number>;
  filepath: string;
  stderr: string;
};
export function create_audio_recording(options: LinuxRuntimeOptions): {
  start_audio_recording: Start;
  stop_audio_recording: Stop;
} {
  let active: Recording | undefined,
    starting = false;
  return {
    async start_audio_recording(args = {}) {
      if (active || starting)
        throw new Error("computer audio recording is already active");
      const duration = args.max_duration_ms ?? 60000;
      if (!Number.isInteger(duration) || duration < 100 || duration > 300000)
        throw new Error(
          "max_duration_ms must be an integer from 100 through 300000",
        );
      starting = true;
      try {
        await options.action_settler.wait();
        const sink = (
          await cli("pactl", ["get-default-sink"], {
            quiet: true,
            stdio: "pipe",
          })
        ).stdout.trim();
        if (!sink) throw new Error("pactl returned an empty default sink");
        const directory = await mkdtemp(path.join(tmpdir(), "sky-audio-")),
          filepath = path.join(directory, "recording.wav");
        const child = spawn(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-progress",
            "pipe:2",
            "-f",
            "pulse",
            "-i",
            `${sink}.monitor`,
            "-t",
            String(duration / 1000),
            "-ar",
            "24000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            filepath,
          ],
          { stdio: ["pipe", "ignore", "pipe"] },
        );
        const completion = new Promise<number>((resolve) => {
          child.once("error", () => resolve(1));
          child.once("close", (code) => resolve(code ?? child.exitCode ?? 1));
        });
        const recording: Recording = {
          child,
          completion,
          filepath,
          stderr: "",
        };
        await new Promise<void>((resolve, reject) => {
          child.stderr?.on("data", (chunk) => {
            recording.stderr += String(chunk);
            if (
              /(?:^|\r?\n)progress=continue(?:\r?\n|$)/.test(recording.stderr)
            )
              resolve();
          });
          child.once("error", reject);
          child.once("close", () =>
            reject(
              new Error(
                "ffmpeg computer audio capture stopped before recording started",
              ),
            ),
          );
        });
        active = recording;
      } finally {
        starting = false;
      }
    },
    async stop_audio_recording() {
      const recording = active;
      if (!recording) throw new Error("computer audio recording is not active");
      active = undefined;
      await options.action_settler.wait();
      if (
        recording.child.exitCode == null &&
        recording.child.signalCode == null
      )
        recording.child.stdin?.end("q\n");
      const code = await recording.completion;
      if (code !== 0)
        throw new Error(
          `ffmpeg computer audio capture failed: ${recording.stderr.trim() || `exit=${code}`}`,
        );
      const bytes = await from_filepath(recording.filepath);
      return {
        filepath: recording.filepath,
        bytes,
        data_url: to_data_url(bytes, "audio/wav"),
      };
    },
  };
}
