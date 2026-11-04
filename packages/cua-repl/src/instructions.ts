import { readFileSync } from "node:fs";
const directories: Partial<Record<NodeJS.Platform, string>> = {
  linux: "linux",
  darwin: "macos",
  win32: "windows",
};
function readInstruction(name: string) {
  return readFileSync(
    new URL(import.meta.resolve(`#instructions/${name}.md`)),
    "utf8",
  ).trimEnd();
}
export function load_instructions(
  platform: NodeJS.Platform,
  browser_environment?: string,
  browser_guidance?: string,
) {
  const directory = directories[platform];
  if (!directory) throw new Error(`unsupported cua_repl platform=${platform}`);
  const cloudFile =
    browser_guidance === "tool_description"
      ? "browser-cloud-guidance"
      : "browser-cloud";
  const browser =
    browser_environment === "cloud" || browser_environment === "orbit"
      ? [
          readInstruction(`browser-${browser_environment}-preference`),
          readInstruction(`${directory}/${cloudFile}`),
        ].join("\n\n")
      : readInstruction(`${directory}/browser`);
  return {
    description: readInstruction(`${directory}/description`),
    browser,
    computer: readInstruction(`${directory}/computer`),
    output: readInstruction(`${directory}/output`),
    audio_attachments: readInstruction("audio-attachments"),
    browser_disabled: readInstruction("browser-disabled"),
    computer_disabled: readInstruction("computer-disabled"),
    server: readInstruction("server"),
    code: readInstruction("code"),
    reset: readInstruction("reset"),
  };
}
