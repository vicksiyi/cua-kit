import { readFileSync } from "node:fs";
const directories: Partial<Record<NodeJS.Platform, string>> = {
  linux: "linux",
  darwin: "macos",
  win32: "windows",
};
export function load_instructions(
  instructions_directory: URL,
  platform: NodeJS.Platform,
  browser_environment?: string,
  browser_guidance?: string,
) {
  const readInstruction = (name: string) =>
    readFileSync(
      new URL(`${name}.md`, instructions_directory),
      "utf8",
    ).trimEnd();
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
    audio: readInstruction("audio"),
    browser_disabled: readInstruction("browser-disabled"),
    computer_disabled: readInstruction("computer-disabled"),
    server: readInstruction("server"),
    code: readInstruction("code"),
    title: readInstruction("title"),
    task_completion: readInstruction("task-completion"),
    completion_summary: readInstruction("completion-summary"),
    reset: readInstruction("reset"),
  };
}
